import { QueryFailedError } from 'typeorm';
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

const UNIQUE_VIOLATION = '23505';

/**
 * How long an in-flight run may hold the slot before another caller may reclaim
 * it. Comfortably longer than the slowest possible run (the readiness stage
 * timeouts total ~135s), so this only ever fires for a genuinely dead process.
 */
const LEASE_MS = 15 * 60 * 1000;

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
   * Claims the in-flight slot for this subject. Relies on the partial unique
   * index rather than a read-then-write check, so two concurrent requests
   * cannot both pass a check and then both start an expensive model run.
   *
   * The slot is a **lease, not a permanent lock**. A process that dies between
   * the insert and the completion leaves a `running` row that nothing will ever
   * transition, and the unique index would then reject every future run for that
   * subject forever. On conflict we therefore reclaim a lease that has already
   * outlived any possible run.
   */
  async createRunning(input: CreateRunInput): Promise<AgentWorkflowRun> {
    try {
      return await this.insertRunning(input);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      if (!(await this.reclaimExpiredLease(input))) throw new WorkflowAlreadyRunningError();

      try {
        return await this.insertRunning(input);
      } catch (retryError) {
        // Another caller took the reclaimed slot first — genuinely busy now.
        if (isUniqueViolation(retryError)) throw new WorkflowAlreadyRunningError();
        throw retryError;
      }
    }
  }

  private async insertRunning(input: CreateRunInput): Promise<AgentWorkflowRun> {
    return this.repo.save(this.repo.create({ ...input, status: WorkflowRunStatus.RUNNING }));
  }

  /** Fails any in-flight run older than the lease, freeing the slot. */
  private async reclaimExpiredLease(input: CreateRunInput): Promise<boolean> {
    const result = await this.repo
      .createQueryBuilder()
      .update(AgentWorkflowRun)
      .set({
        status: WorkflowRunStatus.FAILED,
        errorSummary: 'Abandoned: run exceeded its lease without completing',
      })
      .where('"workflowType" = :workflowType', { workflowType: input.workflowType })
      .andWhere('"subjectType" = :subjectType', { subjectType: input.subjectType })
      .andWhere('"subjectId" = :subjectId', { subjectId: input.subjectId })
      .andWhere('status IN (:...statuses)', { statuses: IN_FLIGHT_STATUSES })
      .andWhere('"createdAt" < :cutoff', { cutoff: new Date(Date.now() - LEASE_MS) })
      .execute();

    return (result.affected ?? 0) > 0;
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
