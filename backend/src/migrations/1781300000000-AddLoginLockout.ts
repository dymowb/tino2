import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-account brute-force tracking.
 *
 * The IP rate limiter already in front of /auth/login throttles a single noisy
 * source, but it does nothing about a distributed attempt against one account: the
 * requirement is a temporary lockout after a number of wrong passwords, and nothing
 * counted failures per account.
 */
export class AddLoginLockout1781300000000 implements MigrationInterface {
  name = 'AddLoginLockout1781300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "failedLoginAttempts" integer NOT NULL DEFAULT 0`
    );
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP`);

    // Only locked accounts are ever scanned by time, and they are a tiny minority.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_users_locked_until"
         ON "users" ("lockedUntil") WHERE "lockedUntil" IS NOT NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_locked_until"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "lockedUntil"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "failedLoginAttempts"`);
  }
}
