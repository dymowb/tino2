import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `lockedUntil` is an instant, so it has to be stored as one.
 *
 * As `timestamp without time zone` the column had no single meaning: the lock was
 * written from SQL (`now()`, in the database session's zone) but read back and
 * compared in JavaScript, where node-postgres parses a naive timestamp in the *node
 * process'* zone. With the database on UTC and the process on UTC-7 — the ordinary
 * arrangement — a fifteen-minute lockout was enforced as seven hours and fifteen
 * minutes, and the `Retry-After` sent to the user said so. The two guards on the
 * login path disagreed with each other for the same reason: the SQL one saw a lock
 * the JavaScript one had already considered expired.
 *
 * `timestamptz` stores the instant and both sides agree regardless of either zone.
 */
export class LockedUntilTimestamptz1781400000000 implements MigrationInterface {
  name = 'LockedUntilTimestamptz1781400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Existing values were written by the previous implementation as UTC instants
    // that lost their zone on the way in, so that is how they are reinterpreted.
    await queryRunner.query(
      `ALTER TABLE "users"
         ALTER COLUMN "lockedUntil" TYPE timestamptz
         USING "lockedUntil" AT TIME ZONE 'UTC'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users"
         ALTER COLUMN "lockedUntil" TYPE timestamp
         USING "lockedUntil" AT TIME ZONE 'UTC'`
    );
  }
}
