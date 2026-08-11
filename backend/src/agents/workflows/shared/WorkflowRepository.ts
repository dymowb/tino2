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
   */
  async createRunning(input: CreateRunInput): Promise<AgentWorkflowRun> {
    try {
      return await this.repo.save(
        this.repo.create({ ...input, status: WorkflowRunStatus.RUNNING })
      );
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as { code?: string }).code === UNIQUE_VIOLATION
      ) {
        throw new WorkflowAlreadyRunningError();
      }
      throw error;
    }
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
