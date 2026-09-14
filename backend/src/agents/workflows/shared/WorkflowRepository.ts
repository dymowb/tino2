import { EntityManager, QueryFailedError } from 'typeorm';
import { AppDataSource } from '@/config/database';
import {
  AgentWorkflowRun,
  IN_FLIGHT_STATUSES,
  WorkflowRunStatus,
  WorkflowStageOutcome,
} from '@/models/AgentWorkflowRun';

/** Raised when the single-in-flight-run unique index rejects an insert. */
export class WorkflowAlreadyRunningError extends Error {
  constructor() {
    super('A run for this subject is already in progress');
    this.name = 'WorkflowAlreadyRunningError';
  }
}

/**
 * Raised when a run would exceed the cost budget for its initiator or for the
 * platform. Carries which ceiling was hit so the caller can say something true
 * to the user, and how long until the window releases a slot.
 */
export class WorkflowBudgetExceededError extends Error {
  constructor(
    readonly scope: 'user' | 'global',
    readonly retryAfterSeconds: number
  ) {
    super(`Agent run budget exhausted for scope "${scope}"`);
    this.name = 'WorkflowBudgetExceededError';
  }
}

/**
 * Ceilings on how many runs of one workflow type may be started in a rolling
 * window, per initiator and across the whole platform.
 */
export interface WorkflowBudget {
  perUserMaxRuns: number;
  perUserWindowMs: number;
  globalMaxRuns: number;
  globalWindowMs: number;
}

/**
 * Advisory-lock namespace. The first argument separates these locks from any
 * other advisory lock the application might take; the second identifies the
 * workflow type, so two different workflows never wait on each other.
 */
const BUDGET_LOCK_CLASS = 0x7a10;

/** Stable 31-bit key for a workflow type, computed here rather than with the
 * undocumented `hashtext()` so the lock key does not depend on server internals. */
function lockKey(workflowType: string): number {
  let hash = 2166136261;
  for (let i = 0; i < workflowType.length; i += 1) {
    hash ^= workflowType.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // Positive int4, which is what pg_advisory_xact_lock(int, int) accepts.
  return hash & 0x7fffffff;
}

const UNIQUE_VIOLATION = '23505';

/**
 * How long an in-flight run may hold the slot before another caller may reclaim
 * it. Comfortably longer than the slowest possible run (the readiness stage
 * timeouts total ~135s), so this only ever fires for a genuinely dead process.
 */
const LEASE_MS = 15 * 60 * 1000;

/**
 * "Now", in exactly the terms `agent_workflow_runs."createdAt"` is written in.
 *
 * That column is `timestamp without time zone` and **the database writes it**:
 * TypeORM emits a literal `DEFAULT` for a `@CreateDateColumn` it was given no
 * value for, so the value comes from the DDL's `DEFAULT now()` and carries the
 * wall-clock digits of the *database session's* zone. `now()::timestamp` is that
 * same rendering, so the two agree whatever that zone is set to.
 *
 * Two plausible answers were ruled out by probing a live database rather than by
 * reasoning, because both look right and both are wrong:
 *
 * - A JavaScript `Date` bound as a parameter — which is what a `:cutoff`
 *   placeholder and `repository.update({ createdAt })` both send — is rendered in
 *   the *node process'* zone, not the database's. Comparing against one skews
 *   every window by the offset between the two: seven hours on the machine this
 *   was written on. That is what `main` did, and it enforced a 15-minute lease
 *   for 7h15m — the defect the `lockedUntil` column was migrated to fix.
 * - `timezone('UTC', now())` is right only while the database session is UTC.
 *   It reads as more explicit and is in fact less portable.
 *
 * Nothing here reads `createdAt` into JavaScript either: node-postgres parses a
 * zoneless timestamp in the node process' zone, so a row written moments ago
 * comes back as one written hours from now.
 */
const COLUMN_NOW = 'now()::timestamp';

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError && (error as { code?: string }).code === UNIQUE_VIOLATION
  );
}

export interface CreateRunInput {
  workflowType: string;
  subjectType: string;
  subjectId: string;
  initiatedBy: string;
  schemaVersion: number;
  /** When present, the claim is refused unless it fits within these ceilings. */
  budget?: WorkflowBudget;
}

export interface CompleteRunInput {
  status: WorkflowRunStatus;
  sourceFingerprint: string | null;
  output: unknown | null;
  stageOutcomes: WorkflowStageOutcome[];
  errorSummary?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
}

export class WorkflowRepository {
  private get repo() {
    return AppDataSource.getRepository(AgentWorkflowRun);
  }

  /**
   * Claims the slot for this subject and, when a budget is supplied, a unit of
   * that budget — before any model is called.
   *
   * The whole claim runs inside one transaction holding a per-workflow-type
   * advisory lock. That lock is what makes counting safe: a rolling-window count
   * cannot be enforced by a unique index, and without serialization two requests
   * for *different* subjects would both read "9 runs used" and both proceed,
   * putting the eleventh run through a ceiling of ten. The lock is held for the
   * few milliseconds of counting and inserting, never across the model run.
   *
   * Serializing claims also lets the in-flight check be an ordinary read: no
   * other claim for this workflow type can be interleaved with it. The partial
   * unique index stays as a backstop and is still translated if it ever fires.
   *
   * The slot is a **lease, not a permanent lock**. A process that dies between
   * the insert and the completion leaves a `running` row that nothing will ever
   * transition, and the unique index would then reject every future run for that
   * subject forever, so an in-flight row that has outlived any possible run is
   * failed and its slot reused.
   */
  async createRunning(input: CreateRunInput): Promise<AgentWorkflowRun> {
    return AppDataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [
        BUDGET_LOCK_CLASS,
        lockKey(input.workflowType),
      ]);

      await this.claimSubjectSlot(manager, input);
      if (input.budget) await this.assertWithinBudget(manager, input, input.budget);

      try {
        return await this.insertRunning(manager, input);
      } catch (error) {
        // Unreachable while the advisory lock holds, but a unique violation here
        // still means exactly one thing, and it must not surface as a 500.
        if (isUniqueViolation(error)) throw new WorkflowAlreadyRunningError();
        throw error;
      }
    });
  }

  private async insertRunning(
    manager: EntityManager,
    input: CreateRunInput
  ): Promise<AgentWorkflowRun> {
    const repo = manager.getRepository(AgentWorkflowRun);
    return repo.save(
      repo.create({
        workflowType: input.workflowType,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        initiatedBy: input.initiatedBy,
        schemaVersion: input.schemaVersion,
        status: WorkflowRunStatus.RUNNING,
      })
    );
  }

  /**
   * Rejects the claim if this subject already has a live run, and frees the slot
   * if the run holding it has outlived its lease.
   */
  private async claimSubjectSlot(manager: EntityManager, input: CreateRunInput): Promise<void> {
    const scope = [input.workflowType, input.subjectType, input.subjectId];

    // Expire first, then count what is left, so an abandoned run is not counted
    // as live. Both statements are evaluated by the database against
    // `COLUMN_NOW` — see the note there for why the age of a row is never
    // computed in JavaScript.
    await manager.query(
      `UPDATE agent_workflow_runs
          SET status = 'failed',
              "errorSummary" = 'Abandoned: run exceeded its lease without completing'
        WHERE "workflowType" = $1 AND "subjectType" = $2 AND "subjectId" = $3
          AND status = ANY($4)
          AND "createdAt" < ${COLUMN_NOW} - make_interval(secs => $5)`,
      [...scope, IN_FLIGHT_STATUSES, LEASE_MS / 1000]
    );

    const [{ live }] = await manager.query(
      `SELECT COUNT(*)::int AS live
         FROM agent_workflow_runs
        WHERE "workflowType" = $1 AND "subjectType" = $2 AND "subjectId" = $3
          AND status = ANY($4)`,
      [...scope, IN_FLIGHT_STATUSES]
    );

    if (live > 0) throw new WorkflowAlreadyRunningError();
  }

  /**
   * Enforces the per-initiator and platform-wide ceilings on how many runs of
   * this workflow type may start in a rolling window.
   *
   * Every row created in the window counts, whatever it became. A run that
   * failed still called the models and still cost money, so excluding failures
   * would let a broken workflow bill without limit. Runs served from an existing
   * result never reach here, so reuse costs nothing against either ceiling.
   */
  private async assertWithinBudget(
    manager: EntityManager,
    input: CreateRunInput,
    budget: WorkflowBudget
  ): Promise<void> {
    const perUser = await this.countWindow(
      manager,
      input.workflowType,
      budget.perUserWindowMs,
      input.initiatedBy
    );
    if (perUser.count >= budget.perUserMaxRuns) {
      throw new WorkflowBudgetExceededError('user', perUser.retryAfterSeconds);
    }

    const global = await this.countWindow(manager, input.workflowType, budget.globalWindowMs, null);
    if (global.count >= budget.globalMaxRuns) {
      throw new WorkflowBudgetExceededError('global', global.retryAfterSeconds);
    }
  }

  /**
   * Counts runs inside the rolling window and says how long until the oldest of
   * them leaves it.
   *
   * Both numbers are computed by the database, against `COLUMN_NOW` — see the
   * note there for the column's basis, which is not restated here so the two
   * cannot drift apart. The reason nothing reads `createdAt` into JavaScript is
   * the same: node-postgres parses a zoneless value in the *node process'* zone,
   * so a row written moments ago reads back as one written hours from now, and
   * subtracting it from `Date.now()` gave a `Retry-After` of 111600s where the
   * window itself is only 86400.
   */
  private async countWindow(
    manager: EntityManager,
    workflowType: string,
    windowMs: number,
    initiatedBy: string | null
  ): Promise<{ count: number; retryAfterSeconds: number }> {
    const windowSeconds = windowMs / 1000;
    const rows = await manager.query(
      `SELECT COUNT(*)::int AS count,
              CEIL(
                EXTRACT(
                  EPOCH FROM
                    MIN("createdAt") + make_interval(secs => $2) - ${COLUMN_NOW}
                )
              )::int AS "retryAfterSeconds"
         FROM agent_workflow_runs
        WHERE "workflowType" = $1
          AND "createdAt" >= ${COLUMN_NOW} - make_interval(secs => $2)
          AND ($3::uuid IS NULL OR "initiatedBy" = $3::uuid)`,
      [workflowType, windowSeconds, initiatedBy]
    );

    // An aggregate always returns exactly one row, but the ceiling is not the
    // place to assume it: `Number(undefined)` is NaN, every comparison against
    // NaN is false, and the run would be waved through with no budget at all.
    const count = Number(rows?.[0]?.count);
    if (!Number.isFinite(count)) {
      throw new Error('Could not count agent workflow runs for the budget window');
    }

    // Null when the window is empty, which only happens when count is 0 and the
    // caller never asks.
    const retryAfter = Number(rows[0].retryAfterSeconds);
    return {
      count,
      retryAfterSeconds: Number.isFinite(retryAfter)
        ? Math.max(1, retryAfter)
        : Math.ceil(windowSeconds),
    };
  }

  async complete(runId: string, input: CompleteRunInput): Promise<AgentWorkflowRun | null> {
    await this.repo.update(runId, {
      status: input.status,
      sourceFingerprint: input.sourceFingerprint,
      output: input.output,
      stageOutcomes: input.stageOutcomes,
      errorSummary: input.errorSummary ?? null,
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      durationMs: input.durationMs ?? 0,
    });
    return this.repo.findOne({ where: { id: runId } });
  }

  /** Releases the in-flight slot when a run throws before it can complete. */
  async fail(runId: string, errorSummary: string): Promise<void> {
    await this.repo.update(runId, {
      status: WorkflowRunStatus.FAILED,
      errorSummary: errorSummary.slice(0, 2000),
    });
  }

  async findById(runId: string): Promise<AgentWorkflowRun | null> {
    return this.repo.findOne({ where: { id: runId } });
  }

  async findLatest(
    workflowType: string,
    subjectType: string,
    subjectId: string
  ): Promise<AgentWorkflowRun | null> {
    return this.repo.findOne({
      where: { workflowType, subjectType, subjectId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * The newest completed run that was computed from exactly this input, or null.
   *
   * Only `completed` runs qualify: a degraded or failed run produced a partial
   * plan, and returning that forever would mean one bad run permanently
   * suppresses any retry for an unchanged booking. `schemaVersion` must match
   * too, or a release that changes the output contract would keep serving plans
   * shaped for the old one.
   */
  async findReusable(
    workflowType: string,
    subjectType: string,
    subjectId: string,
    sourceFingerprint: string,
    schemaVersion: number
  ): Promise<AgentWorkflowRun | null> {
    return this.repo.findOne({
      where: {
        workflowType,
        subjectType,
        subjectId,
        sourceFingerprint,
        schemaVersion,
        status: WorkflowRunStatus.COMPLETED,
      },
      order: { createdAt: 'DESC' },
    });
  }

  async findInFlight(
    workflowType: string,
    subjectType: string,
    subjectId: string
  ): Promise<AgentWorkflowRun | null> {
    const runs = await this.repo.find({
      where: IN_FLIGHT_STATUSES.map((status) => ({
        workflowType,
        subjectType,
        subjectId,
        status,
      })),
      order: { createdAt: 'DESC' },
      take: 1,
    });
    return runs[0] ?? null;
  }
}

export const workflowRepository = new WorkflowRepository();
