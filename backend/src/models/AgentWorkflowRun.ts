import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Persisted status. `stale` is deliberately absent: staleness is derived by
 * comparing the stored fingerprint against a freshly computed one, so it can
 * become true without anything writing to the row.
 */
export enum WorkflowRunStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED_PARTIAL = 'failed_partial',
  FAILED = 'failed',
}

export const IN_FLIGHT_STATUSES: WorkflowRunStatus[] = [
  WorkflowRunStatus.PENDING,
  WorkflowRunStatus.RUNNING,
];

/** Per-stage audit. Deliberately excludes prompt payloads — they carry private
 * message content, and the roadmap forbids storing them by default. */
export interface WorkflowStageOutcome {
  stage: string;
  status: 'succeeded' | 'failed' | 'timed_out' | 'skipped';
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

/**
 * Domain-neutral record of one agent workflow execution. Booking Readiness is
 * the first consumer; Quote Decision Council is expected to reuse it without
 * schema changes, which is why nothing here names a booking.
 */
@Entity('agent_workflow_runs')
@Index(['subjectType', 'subjectId', 'createdAt'])
@Index(['workflowType', 'status'])
export class AgentWorkflowRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** e.g. 'booking_readiness' */
  @Column()
  workflowType: string;

  /** e.g. 'booking' */
  @Column()
  subjectType: string;

  @Column({ type: 'uuid' })
  subjectId: string;

  /** User who triggered the run. */
  @Column({ type: 'uuid' })
  initiatedBy: string;

  @Column({ type: 'varchar', default: WorkflowRunStatus.PENDING })
  status: WorkflowRunStatus;

  /** Hash of the source records the run was computed from. */
  @Column({ type: 'varchar', nullable: true })
  sourceFingerprint: string | null;

  /** Bumped when the output contract changes, so old rows can be identified. */
  @Column({ type: 'int', default: 1 })
  schemaVersion: number;

  @Column({ type: 'jsonb', nullable: true })
  output: unknown | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  stageOutcomes: WorkflowStageOutcome[];

  @Column({ type: 'text', nullable: true })
  errorSummary: string | null;

  @Column({ type: 'int', default: 0 })
  inputTokens: number;

  @Column({ type: 'int', default: 0 })
  outputTokens: number;

  @Column({ type: 'int', default: 0 })
  durationMs: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
