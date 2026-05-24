import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReflectedAt1777161601000 implements MigrationInterface {
  name = 'AddReflectedAt1777161601000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE episodic_memories
      ADD COLUMN IF NOT EXISTS reflected_at TIMESTAMP WITH TIME ZONE NULL
    `);

    // Partial index: only index unprocessed rows — keeps the index tiny as episodes age
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_episodic_memories_unreflected
        ON episodic_memories (user_id, created_at)
        WHERE reflected_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_episodic_memories_unreflected`);
    await queryRunner.query(`ALTER TABLE episodic_memories DROP COLUMN IF EXISTS reflected_at`);
  }
}
