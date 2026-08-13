import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bring attachments that predate the private-attachment change into the new model.
 *
 * Messages sent before this stored URLs like `/uploads/messages/<file>`, which are no
 * longer served — so without this migration every existing attachment becomes
 * unreachable. Each legacy reference gets a `message_attachments` row owned by the
 * sender of the message that referenced it, and the message's URL is rewritten to the
 * authenticated API path.
 *
 * The files themselves stay where they are; MessageAttachmentService falls back to the
 * legacy directory when a storage key is not found under the new root.
 */
export class MigrateLegacyMessageAttachments1781200000001 implements MigrationInterface {
  name = 'MigrateLegacyMessageAttachments1781200000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // One row per (message, legacy attachment URL) pair.
    const legacyReferences: Array<{
      messageId: string;
      senderId: string;
      url: string;
    }> = await queryRunner.query(`
      SELECT m."id" AS "messageId", m."senderId" AS "senderId", elem AS "url"
        FROM messages m
        CROSS JOIN LATERAL jsonb_array_elements_text(m."attachments") AS elem
       WHERE jsonb_typeof(m."attachments") = 'array'
         AND elem LIKE '/uploads/messages/%'
    `);

    for (const reference of legacyReferences) {
      const storageKey = reference.url.replace('/uploads/messages/', '');
      if (!storageKey || storageKey.includes('/')) continue;

      // The uploader was not recorded back then; the sender of the message that
      // shared the file is the closest truthful owner, and it is also what the
      // read check anchors on.
      const inserted: Array<{ id: string }> = await queryRunner.query(
        `INSERT INTO "message_attachments"
           ("storageKey", "uploaderId", "originalName", "mimeType", "sizeBytes")
         VALUES ($1, $2, $3, $4, 0)
         ON CONFLICT ("storageKey") DO UPDATE SET "storageKey" = EXCLUDED."storageKey"
         RETURNING "id"`,
        [storageKey, reference.senderId, storageKey, mimeTypeForKey(storageKey)]
      );

      const attachmentId = inserted[0]?.id;
      if (!attachmentId) continue;

      await queryRunner.query(
        `UPDATE messages
            SET "attachments" = jsonb_set(
              "attachments",
              ARRAY[(
                SELECT (idx - 1)::text
                  FROM jsonb_array_elements_text("attachments") WITH ORDINALITY AS t(val, idx)
                 WHERE val = $2
                 LIMIT 1
              )],
              to_jsonb($3::text)
            )
          WHERE "id" = $1
            AND "attachments" @> to_jsonb(ARRAY[$2::text])`,
        [reference.messageId, reference.url, `/api/v1/messages/attachments/${attachmentId}`]
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the legacy URLs for rows this migration created (sizeBytes = 0 marks
    // them; real uploads always record a non-zero size).
    const migrated: Array<{ id: string; storageKey: string }> = await queryRunner.query(
      `SELECT "id", "storageKey" FROM "message_attachments" WHERE "sizeBytes" = 0`
    );

    for (const attachment of migrated) {
      await queryRunner.query(
        `UPDATE messages
            SET "attachments" = jsonb_set(
              "attachments",
              ARRAY[(
                SELECT (idx - 1)::text
                  FROM jsonb_array_elements_text("attachments") WITH ORDINALITY AS t(val, idx)
                 WHERE val = $1
                 LIMIT 1
              )],
              to_jsonb($2::text)
            )
          WHERE "attachments" @> to_jsonb(ARRAY[$1::text])`,
        [
          `/api/v1/messages/attachments/${attachment.id}`,
          `/uploads/messages/${attachment.storageKey}`,
        ]
      );
    }

    await queryRunner.query(`DELETE FROM "message_attachments" WHERE "sizeBytes" = 0`);
  }
}

/**
 * Legacy files cannot be sniffed from SQL, so their type is taken from the stored
 * extension. Responses carry `nosniff` and never use text/html, so a mislabelled file
 * fails to render rather than being interpreted as something dangerous.
 */
function mimeTypeForKey(storageKey: string): string {
  const extension = storageKey.split('.').pop()?.toLowerCase() ?? '';
  const byExtension: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    pdf: 'application/pdf',
    txt: 'text/plain',
  };
  return byExtension[extension] ?? 'application/octet-stream';
}
