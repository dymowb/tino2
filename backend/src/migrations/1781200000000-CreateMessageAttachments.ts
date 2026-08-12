import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMessageAttachments1781200000000 implements MigrationInterface {
  name = 'CreateMessageAttachments1781200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "message_attachments" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "storageKey" varchar NOT NULL,
        "uploaderId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "originalName" varchar NOT NULL,
        "mimeType" varchar NOT NULL,
        "sizeBytes" int NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    // The storage key is the filename on disk; a collision would let one upload
    // overwrite another's file.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_message_attachments_storage_key"
        ON "message_attachments" ("storageKey")
    `);

    // "Did this user upload this file" is checked on every download of an
    // attachment that has not been sent in a message yet.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_message_attachments_uploader"
        ON "message_attachments" ("uploaderId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_message_attachments_uploader"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_message_attachments_storage_key"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "message_attachments"`);
  }
}
