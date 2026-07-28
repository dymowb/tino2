import { MigrationInterface, QueryRunner } from 'typeorm';
import { SERVICE_CATEGORIES, categorizeServiceType } from '../data/serviceCatalog';

export class CreateServiceCategories1780800000000 implements MigrationInterface {
  name = 'CreateServiceCategories1780800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Catalog table (column names match the TypeORM entity property names).
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "service_categories" (
                "category" varchar PRIMARY KEY,
                "labelPt" varchar NOT NULL,
                "labelEn" varchar NOT NULL,
                "aliases" jsonb NOT NULL DEFAULT '[]',
                "services" jsonb NOT NULL DEFAULT '[]',
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
            )
        `);

    // 2. Seed the catalog (idempotent).
    for (const c of SERVICE_CATEGORIES) {
      await queryRunner.query(
        `INSERT INTO "service_categories" ("category","labelPt","labelEn","aliases","services")
                 VALUES ($1,$2,$3,$4,$5) ON CONFLICT ("category") DO NOTHING`,
        [c.category, c.labelPt, c.labelEn, JSON.stringify(c.aliases), JSON.stringify(c.services)]
      );
    }

    // 3. Normalised category on quote requests.
    await queryRunner.query(
      `ALTER TABLE "quote_requests" ADD COLUMN IF NOT EXISTS "category" varchar`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_quote_requests_category" ON "quote_requests" ("category")`
    );

    // 4. Backfill legacy rows: resolve each distinct serviceType → category via the
    //    shared fuzzy resolver. Unresolved rows stay NULL (→ broadcast-all fallback).
    const rows: Array<{ serviceType: string }> = await queryRunner.query(
      `SELECT DISTINCT "serviceType" FROM "quote_requests" WHERE "category" IS NULL AND "serviceType" IS NOT NULL`
    );
    for (const { serviceType } of rows) {
      const category = categorizeServiceType(serviceType);
      if (category) {
        await queryRunner.query(
          `UPDATE "quote_requests" SET "category" = $1 WHERE "serviceType" = $2 AND "category" IS NULL`,
          [category, serviceType]
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_quote_requests_category"`);
    await queryRunner.query(`ALTER TABLE "quote_requests" DROP COLUMN IF EXISTS "category"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "service_categories"`);
  }
}
