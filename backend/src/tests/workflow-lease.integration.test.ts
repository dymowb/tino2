import { AppDataSource } from '@/config/database';
import { AgentWorkflowRun, WorkflowRunStatus } from '@/models/AgentWorkflowRun';
import {
  WorkflowAlreadyRunningError,
  workflowRepository,
} from '@/agents/workflows/shared/WorkflowRepository';

const SUBJECT_ID = '99999999-9999-4999-8999-999999999999';
const INITIATED_BY = '88888888-8888-4888-8888-888888888888';

const input = {
  workflowType: 'lease_test',
  subjectType: 'booking',
  subjectId: SUBJECT_ID,
  initiatedBy: INITIATED_BY,
  schemaVersion: 1,
};

describe('workflow in-flight lease', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  });

  beforeEach(async () => {
    await AppDataSource.getRepository(AgentWorkflowRun).delete({ subjectId: SUBJECT_ID });
  });

  afterAll(async () => {
    await AppDataSource.getRepository(AgentWorkflowRun).delete({ subjectId: SUBJECT_ID });
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  it('rejects a second run while the first is genuinely in flight', async () => {
    await workflowRepository.createRunning(input);
    await expect(workflowRepository.createRunning(input)).rejects.toBeInstanceOf(
      WorkflowAlreadyRunningError
    );
  });

  it('reclaims the slot when a run died without completing', async () => {
    // Simulates a process killed between the insert and the completion: the row
    // stays `running` and nothing will ever transition it. Without a lease the
    // partial unique index would 409 this booking forever.
    const abandoned = await workflowRepository.createRunning(input);
    await AppDataSource.getRepository(AgentWorkflowRun).update(abandoned.id, {
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    const fresh = await workflowRepository.createRunning(input);

    expect(fresh.id).not.toBe(abandoned.id);
    expect(fresh.status).toBe(WorkflowRunStatus.RUNNING);

    const reclaimed = await AppDataSource.getRepository(AgentWorkflowRun).findOneBy({
      id: abandoned.id,
    });
    expect(reclaimed?.status).toBe(WorkflowRunStatus.FAILED);
    expect(reclaimed?.errorSummary).toMatch(/lease/i);
  });

  it('releases the slot once the run completes', async () => {
    const run = await workflowRepository.createRunning(input);
    await workflowRepository.complete(run.id, {
      status: WorkflowRunStatus.COMPLETED,
      sourceFingerprint: 'fp',
      output: {},
      stageOutcomes: [],
    });

    await expect(workflowRepository.createRunning(input)).resolves.toBeDefined();
  });
});
