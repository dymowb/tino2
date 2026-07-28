/**
 * One-off maintenance script to clean up the messaging data that accumulated from
 * earlier bugs (the cascade-delete-participants bug and missing dedup):
 *
 *   1. REPAIR  — orphaned conversations (<2 participants) whose messages reveal exactly
 *                two distinct users: re-insert the missing participant junction row.
 *   2. DELETE  — orphaned conversations that remain unusable (still <2 participants,
 *                other party unknowable): remove them and their stranded messages.
 *   3. DEDUPE  — collapse duplicate non-booking direct conversations between the same
 *                pair into the oldest one, moving messages over and recomputing lastMessage.
 *
 * Safe to run multiple times (idempotent). Run with:
 *   npx ts-node src/scripts/cleanupConversations.ts
 */
import 'reflect-metadata';
require('../../module-alias');
import dotenv from 'dotenv';
dotenv.config({ path: process.env.NODE_ENV === 'production' ? '.env.production' : '.env' });

import { AppDataSource } from '@/config/database';
import logger from '@/config/logger';

async function run(): Promise<void> {
  await AppDataSource.initialize();
  const qr = AppDataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();

  let repaired = 0;
  let deletedConvs = 0;
  let deletedMsgs = 0;
  let mergedConvs = 0;
  let movedMsgs = 0;

  try {
    // ---- 1. REPAIR orphans whose messages reveal exactly two distinct users ----
    const orphanRows: { id: string }[] = await qr.query(`
      SELECT c.id FROM conversations c
      WHERE (SELECT COUNT(*) FROM conversation_participants cp WHERE cp."conversationId" = c.id) < 2
    `);

    for (const { id } of orphanRows) {
      const users: { uid: string }[] = await qr.query(
        `SELECT DISTINCT uid FROM (
           SELECT "senderId" AS uid FROM messages WHERE "conversationId" = $1
           UNION
           SELECT "receiverId" AS uid FROM messages WHERE "conversationId" = $1 AND "receiverId" IS NOT NULL
         ) u WHERE uid IS NOT NULL`,
        [id]
      );
      const userIds = users.map((u) => u.uid);
      if (userIds.length === 2) {
        for (const uid of userIds) {
          await qr.query(
            `INSERT INTO conversation_participants ("conversationId", "userId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [id, uid]
          );
        }
        repaired++;
      }
    }

    // ---- 2. DELETE remaining unusable orphans (+ stranded messages) ----
    const stillOrphan: { id: string }[] = await qr.query(`
      SELECT c.id FROM conversations c
      WHERE (SELECT COUNT(*) FROM conversation_participants cp WHERE cp."conversationId" = c.id) < 2
    `);
    for (const { id } of stillOrphan) {
      const del = await qr.query(`DELETE FROM messages WHERE "conversationId" = $1`, [id]);
      deletedMsgs += Array.isArray(del) ? (del[1] ?? 0) : 0;
      await qr.query(`DELETE FROM conversation_participants WHERE "conversationId" = $1`, [id]);
      await qr.query(`DELETE FROM conversations WHERE id = $1`, [id]);
      deletedConvs++;
    }

    // ---- 3. DEDUPE non-booking direct conversations per participant pair ----
    const dupPairs: { pair: string }[] = await qr.query(`
      WITH healthy AS (
        SELECT c.id, c."createdAt",
               (SELECT string_agg(cp."userId"::text, ',' ORDER BY cp."userId"::text)
                  FROM conversation_participants cp WHERE cp."conversationId" = c.id) AS pair
        FROM conversations c
        WHERE c.type = 'direct' AND (c.metadata->>'bookingId') IS NULL
          AND (SELECT COUNT(*) FROM conversation_participants cp WHERE cp."conversationId" = c.id) = 2
      )
      SELECT pair FROM healthy GROUP BY pair HAVING COUNT(*) > 1
    `);

    for (const { pair } of dupPairs) {
      // Conversations for this pair, oldest first — keep the first, merge the rest into it.
      const convs: { id: string }[] = await qr.query(
        `WITH healthy AS (
           SELECT c.id, c."createdAt",
                  (SELECT string_agg(cp."userId"::text, ',' ORDER BY cp."userId"::text)
                     FROM conversation_participants cp WHERE cp."conversationId" = c.id) AS pair
           FROM conversations c
           WHERE c.type = 'direct' AND (c.metadata->>'bookingId') IS NULL
             AND (SELECT COUNT(*) FROM conversation_participants cp WHERE cp."conversationId" = c.id) = 2
         )
         SELECT id FROM healthy WHERE pair = $1 ORDER BY "createdAt" ASC`,
        [pair]
      );
      const survivor = convs[0].id;
      const losers = convs.slice(1).map((c) => c.id);

      for (const loser of losers) {
        const moved = await qr.query(
          `UPDATE messages SET "conversationId" = $1 WHERE "conversationId" = $2`,
          [survivor, loser]
        );
        movedMsgs += Array.isArray(moved) ? (moved[1] ?? 0) : 0;
        await qr.query(`DELETE FROM conversation_participants WHERE "conversationId" = $1`, [
          loser,
        ]);
        await qr.query(`DELETE FROM conversations WHERE id = $1`, [loser]);
        mergedConvs++;
      }

      // Recompute survivor's lastMessage pointer
      await qr.query(
        `UPDATE conversations c SET "lastMessageId" = lm.id, "lastMessageAt" = lm."createdAt"
         FROM (SELECT id, "createdAt" FROM messages WHERE "conversationId" = $1 ORDER BY "createdAt" DESC LIMIT 1) lm
         WHERE c.id = $1`,
        [survivor]
      );
    }

    await qr.commitTransaction();
    logger.info('Conversation cleanup complete', {
      repaired,
      deletedConvs,
      deletedMsgs,
      mergedConvs,
      movedMsgs,
    });
    // eslint-disable-next-line no-console
    console.log(`\n✅ Cleanup done:
  repaired orphans:        ${repaired}
  deleted orphan convs:    ${deletedConvs} (and ${deletedMsgs} stranded messages)
  merged duplicate convs:  ${mergedConvs} (moved ${movedMsgs} messages to survivors)\n`);
  } catch (error) {
    await qr.rollbackTransaction();
    logger.error('Cleanup failed, rolled back:', error);
    throw error;
  } finally {
    await qr.release();
    await AppDataSource.destroy();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
