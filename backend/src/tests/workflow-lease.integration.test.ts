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

  it('holds the slot for a run that is still inside its lease', async () => {
    // Fourteen minutes into a fifteen-minute lease: the slot is still taken.
    //
    // This pins the lease's lower edge, not the timestamp basis. A JS-`Date`
    // cutoff skews the comparison by the node/database offset in whichever
    // direction that offset runs, and where node is *behind* the database it
    // makes the lease longer — under which a fourteen-minute-old run is held
    // either way. The reclaim tests below are the ones that discriminate.
    const first = await workflowRepository.createRunning(input);
    await AppDataSource.query(
      `UPDATE agent_workflow_runs
          SET "createdAt" = now()::timestamp - interval '14 minutes'
        WHERE id = $1`,
      [first.id]
    );

    await expect(workflowRepository.createRunning(input)).rejects.toBeInstanceOf(
      WorkflowAlreadyRunningError
    );
  });

  it('rejects a second run while the first is genuinely in flight', async () => {
    await workflowRepository.createRunning(input);
    await expect(workflowRepository.createRunning(input)).rejects.toBeInstanceOf(
      WorkflowAlreadyRunningError
    );
  });

  it('reclaims the slot one minute past the lease', async () => {
    // Sixteen minutes against a fifteen-minute lease. The hour-old case below
    // survives a skew of up to seven hours; this one has a single minute of
    // margin, so any comparison not made in the column's own terms fails it.
    const abandoned = await workflowRepository.createRunning(input);
    await AppDataSource.query(
      `UPDATE agent_workflow_runs
          SET "createdAt" = now()::timestamp - interval '16 minutes'
        WHERE id = $1`,
      [abandoned.id]
    );

    const fresh = await workflowRepository.createRunning(input);

    expect(fresh.id).not.toBe(abandoned.id);
    expect(
      (await AppDataSource.getRepository(AgentWorkflowRun).findOneBy({ id: abandoned.id }))?.status
    ).toBe(WorkflowRunStatus.FAILED);
  });

  it('reclaims the slot when a run died without completing', async () => {
    // Simulates a process killed between the insert and the completion: the row
    // stays `running` and nothing will ever transition it. Without a lease the
    // partial unique index would 409 this booking forever.
    const abandoned = await workflowRepository.createRunning(input);
    // Backdated in SQL. `createdAt` is `timestamp without time zone` written by
    // the DDL's `DEFAULT now()`, while a JavaScript `Date` passed as a parameter
    // — which is what `repository.update()` sends — is rendered in the node
    // process' zone instead. A fixture written that second way ages the row by
    // the offset between the two rather than by the hour this test intends.
    await AppDataSource.query(
      `UPDATE agent_workflow_runs
          SET "createdAt" = now()::timestamp - interval '60 minutes'
        WHERE id = $1`,
      [abandoned.id]
    );

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
