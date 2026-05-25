import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLatencyMs1777161602000 implements MigrationInterface {
  name = 'AddLatencyMs1777161602000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE memory_retrieval_log
      ADD COLUMN IF NOT EXISTS latency_ms INTEGER NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE memory_retrieval_log DROP COLUMN IF EXISTS latency_ms`);
  }
}
