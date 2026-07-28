import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTargetProviderIdsToQuoteRequest1780601900000 implements MigrationInterface {
  name = 'AddTargetProviderIdsToQuoteRequest1780601900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "quote_requests" ADD COLUMN IF NOT EXISTS "targetProviderIds" jsonb`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "quote_requests" DROP COLUMN IF EXISTS "targetProviderIds"`
    );
  }
}
