import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAgentWorkflowRuns1781100000000 implements MigrationInterface {
  name = 'CreateAgentWorkflowRuns1781100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_workflow_runs" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "workflowType" varchar NOT NULL,
        "subjectType" varchar NOT NULL,
        "subjectId" uuid NOT NULL,
        "initiatedBy" uuid NOT NULL,
        "status" varchar NOT NULL DEFAULT 'pending',
        "sourceFingerprint" varchar,
        "schemaVersion" int NOT NULL DEFAULT 1,
        "output" jsonb,
        "stageOutcomes" jsonb NOT NULL DEFAULT '[]',
        "errorSummary" text,
        "inputTokens" int NOT NULL DEFAULT 0,
        "outputTokens" int NOT NULL DEFAULT 0,
        "durationMs" int NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    // "Latest run for this subject" is the hot read path.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_workflow_runs_subject"
        ON "agent_workflow_runs" ("subjectType", "subjectId", "createdAt" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_workflow_runs_type_status"
        ON "agent_workflow_runs" ("workflowType", "status")
    `);

    // One in-flight run per subject per workflow. Enforced in the database
    // rather than the service so a double-clicked button cannot race two
    // expensive model runs past a check-then-insert.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_workflow_runs_single_in_flight"
        ON "agent_workflow_runs" ("workflowType", "subjectType", "subjectId")
        WHERE "status" IN ('pending', 'running')
    `);

    // The readiness snapshot finds booking messages through this jsonb key.
    // Without an expression index every snapshot build scans conversations.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_conversations_metadata_booking_id"
        ON "conversations" (("metadata" ->> 'bookingId'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_conversations_metadata_booking_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_workflow_runs_single_in_flight"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_workflow_runs_type_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_workflow_runs_subject"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_workflow_runs"`);
  }
}
