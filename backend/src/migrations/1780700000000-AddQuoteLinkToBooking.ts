import { MigrationInterface, QueryRunner } from "typeorm";

export class AddQuoteLinkToBooking1780700000000 implements MigrationInterface {
    name = 'AddQuoteLinkToBooking1780700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "quoteId" uuid`);
        await queryRunner.query(`ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "requestId" uuid`);
        // Indexed because the hub correlates bookings to their origin request when
        // deduping the lifecycle card.
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_bookings_requestId" ON "bookings" ("requestId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bookings_requestId"`);
        await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN IF EXISTS "requestId"`);
        await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN IF EXISTS "quoteId"`);
    }
}
