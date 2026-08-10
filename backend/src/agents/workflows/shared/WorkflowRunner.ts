import logger from '@/config/logger';
import { WorkflowStageOutcome } from '@/models/AgentWorkflowRun';

/**
 * A single unit of work in a workflow.
 *
 * The runner knows nothing about what a stage does — it does not load records,
 * check authorization, or call a model. Stages that need those things do them
 * themselves. Keeping domain hooks out of the kernel is what stops the second
 * workflow (Quote Decision Council) from inheriting booking-shaped assumptions.
 */
export interface WorkflowStage<TState> {
  name: string;
  /** A failed required stage degrades the run; a failed optional one is noted and skipped. */
  required: boolean;
  timeoutMs?: number;
  run: (state: TState) => Promise<Partial<TState>>;
}

export interface WorkflowUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface WorkflowRunResult<TState> {
  state: TState;
  outcomes: WorkflowStageOutcome[];
  /** True when at least one required stage did not succeed. */
  degraded: boolean;
  /** True when no required stage succeeded — the run produced nothing usable. */
  failed: boolean;
  durationMs: number;
}

const DEFAULT_STAGE_TIMEOUT_MS = 60_000;

class StageTimeoutError extends Error {
  constructor(stage: string, ms: number) {
    super(`Stage "${stage}" timed out after ${ms}ms`);
    this.name = 'StageTimeoutError';
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, stage: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new StageTimeoutError(stage, ms)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Executes ordered groups of stages. Stages inside a group run concurrently;
 * groups run in sequence. Partial failure is the design point: one dead stage
 * marks its own section and lets the rest of the plan render, rather than
 * blanking the whole result.
 */
export class WorkflowRunner<TState> {
  constructor(private readonly groups: WorkflowStage<TState>[][]) {}

  async run(initialState: TState): Promise<WorkflowRunResult<TState>> {
    const startedAt = Date.now();
    const outcomes: WorkflowStageOutcome[] = [];
    let state = initialState;

    for (const group of this.groups) {
      const settled = await Promise.all(
        group.map(async (stage): Promise<{ stage: WorkflowStage<TState>; patch?: Partial<TState>; outcome: WorkflowStageOutcome }> => {
          const stageStart = Date.now();
          try {
            const patch = await withTimeout(
              stage.run(state),
              stage.timeoutMs ?? DEFAULT_STAGE_TIMEOUT_MS,
              stage.name
            );
            return {
              stage,
              patch,
              outcome: {
                stage: stage.name,
                status: 'succeeded',
                durationMs: Date.now() - stageStart,
              },
            };
          } catch (error) {
            const timedOut = error instanceof StageTimeoutError;
            const message = error instanceof Error ? error.message : String(error);
            logger.warn('Workflow stage failed', {
              stage: stage.name,
              required: stage.required,
              timedOut,
              error: message,
            });
            return {
              stage,
              outcome: {
                stage: stage.name,
                status: timedOut ? 'timed_out' : 'failed',
                durationMs: Date.now() - stageStart,
                error: message,
              },
            };
          }
        })
      );

      // Merge sequentially so concurrent stages cannot interleave partial writes.
      for (const { patch, outcome } of settled) {
        outcomes.push(outcome);
        if (patch) state = { ...state, ...patch };
      }

      // A failed required stage stops later groups (they would consume its
      // output), but everything already produced is still returned.
      const requiredFailed = settled.some(
        ({ stage, outcome }) => stage.required && outcome.status !== 'succeeded'
      );
      if (requiredFailed) {
        for (const remaining of this.groups.slice(this.groups.indexOf(group) + 1).flat()) {
          outcomes.push({ stage: remaining.name, status: 'skipped', durationMs: 0 });
        }
        break;
      }
    }

    const requiredStages = this.groups.flat().filter((s) => s.required);
    const succeededNames = new Set(
      outcomes.filter((o) => o.status === 'succeeded').map((o) => o.stage)
    );
    const degraded = requiredStages.some((s) => !succeededNames.has(s.name));
    const failed = requiredStages.length > 0 && !requiredStages.some((s) => succeededNames.has(s.name));

    return { state, outcomes, degraded, failed, durationMs: Date.now() - startedAt };
  }
}

export function sumUsage(outcomes: WorkflowStageOutcome[]): WorkflowUsage {
  return outcomes.reduce<WorkflowUsage>(
    (acc, outcome) => ({
      inputTokens: acc.inputTokens + (outcome.inputTokens ?? 0),
      outputTokens: acc.outputTokens + (outcome.outputTokens ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0 }
  );
}
