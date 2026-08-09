import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFavoritesAndRebooking1781000000000 implements MigrationInterface {
  name = 'AddFavoritesAndRebooking1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "favorite_providers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "customerId" uuid NOT NULL,
        "providerId" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_favorite_providers" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_favorite_customer_provider" UNIQUE ("customerId", "providerId"),
        CONSTRAINT "FK_favorite_customer" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_favorite_provider" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "quote_requests" ADD COLUMN IF NOT EXISTS "sourceBookingId" uuid`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_quote_requests_source_booking" ON "quote_requests" ("sourceBookingId")`
    );
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "quote_requests" ADD CONSTRAINT "FK_quote_request_source_booking"
          FOREIGN KEY ("sourceBookingId") REFERENCES "bookings"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "quote_requests" DROP CONSTRAINT IF EXISTS "FK_quote_request_source_booking"`
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_quote_requests_source_booking"`);
    await queryRunner.query(`ALTER TABLE "quote_requests" DROP COLUMN IF EXISTS "sourceBookingId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "favorite_providers"`);
  }
}
