import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceBookingQuoteIdempotency1780900000000 implements MigrationInterface {
  name = 'EnforceBookingQuoteIdempotency1780900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_bookings_quote_unique"
       ON "bookings" ("quoteId") WHERE "quoteId" IS NOT NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bookings_quote_unique"`);
  }
}
