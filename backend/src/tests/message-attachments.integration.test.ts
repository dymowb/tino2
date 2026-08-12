import path from 'path';
import fs from 'fs/promises';
import request from 'supertest';
import App from '@/app';
import { QueryRunner } from 'typeorm';
import { AppDataSource } from '@/config/database';
import { BasicUser } from '@/models/BasicUser';
import { MessageAttachment } from '@/models/MessageAttachment';
import { MigrateLegacyMessageAttachments1781200000001 } from '@/migrations/1781200000001-MigrateLegacyMessageAttachments';

/**
 * Message attachments used to be written into a directory served statically, so
 * anyone holding (or guessing) the URL could read a private file without
 * authenticating. These pin the replacement: an authenticated route that checks
 * conversation membership, and content-based type validation.
 */
describe('message attachments', () => {
  const server = new App().app;
  const password = 'TestPassword123!';

  // A one-pixel PNG — real magic bytes, so it passes signature validation.
  const PNG_BYTES = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );

  async function account(email: string, userType: 'customer' | 'provider') {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password, firstName: 'Attach', lastName: userType, userType })
      .expect(201);
    const user = await AppDataSource.getRepository(BasicUser).findOneByOrFail({ email });
    await request(server)
      .get('/api/v1/auth/verify-email')
      .query({ token: user.emailVerificationToken })
      .expect(200);
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return { user, token: login.body.data.accessToken as string };
  }

  /**
   * Re-run the legacy backfill against the current table state. The suite truncates
   * between tests, so the boot-time run has nothing to act on by the time a fixture
   * exists.
   */
  async function runLegacyAttachmentMigration() {
    // The migration only ever calls `queryRunner.query`, so a shim over the shared
    // pool is enough. A real QueryRunner holds its own connection, and leaving those
    // around across tests deadlocks the TRUNCATE in beforeEach.
    const shim = {
      query: (sql: string, params?: unknown[]) => AppDataSource.query(sql, params),
    } as unknown as QueryRunner;
    await new MigrateLegacyMessageAttachments1781200000001().up(shim);
  }

  async function uploadPng(token: string, filename = 'photo.png') {
    const response = await request(server)
      .post('/api/v1/messages/messages/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG_BYTES, filename)
      .expect(200);
    return response.body.data as { url: string; mimeType: string; originalName: string };
  }

  it('returns an API url, not a static uploads path', async () => {
    const uploader = await account('attach-uploader@example.com', 'customer');
    const uploaded = await uploadPng(uploader.token);

    expect(uploaded.url).toMatch(/^\/api\/v1\/messages\/attachments\/[0-9a-f-]{36}$/);
    expect(uploaded.url).not.toContain('/uploads/');
  });

  it('lets the uploader read their own attachment before it is sent', async () => {
    const uploader = await account('attach-uploader2@example.com', 'customer');
    const uploaded = await uploadPng(uploader.token);

    const response = await request(server)
      .get(uploaded.url.replace('/api/v1', '/api/v1'))
      .set('Authorization', `Bearer ${uploader.token}`)
      .expect(200);

    expect(response.headers['content-type']).toContain('image/png');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('refuses an unrelated user with 404, without confirming the attachment exists', async () => {
    const uploader = await account('attach-uploader3@example.com', 'customer');
    const outsider = await account('attach-outsider@example.com', 'provider');
    const uploaded = await uploadPng(uploader.token);

    await request(server)
      .get(uploaded.url)
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(404);
  });

  it('refuses an unauthenticated reader', async () => {
    const uploader = await account('attach-uploader4@example.com', 'customer');
    const uploaded = await uploadPng(uploader.token);

    await request(server).get(uploaded.url).expect(401);
  });

  it('no longer serves attachments from the static uploads path', async () => {
    const uploader = await account('attach-uploader5@example.com', 'customer');
    await uploadPng(uploader.token);

    const attachment = await AppDataSource.getRepository(MessageAttachment).findOneOrFail({
      where: {},
      order: { createdAt: 'DESC' },
    });

    await request(server).get(`/uploads/messages/${attachment.storageKey}`).expect(404);
  });

  it('rejects a file whose contents do not match any allowed type', async () => {
    const uploader = await account('attach-uploader6@example.com', 'customer');

    // An ELF binary renamed to .png — the old extension-based check would allow it.
    const disguised = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00]);

    await request(server)
      .post('/api/v1/messages/messages/upload')
      .set('Authorization', `Bearer ${uploader.token}`)
      .attach('file', disguised, 'totally-an-image.png')
      .expect(400);
  });

  it('stores the type determined from content, not from the filename', async () => {
    const uploader = await account('attach-uploader7@example.com', 'customer');

    // Real PNG bytes carrying a .pdf name.
    const uploaded = await uploadPng(uploader.token, 'invoice.pdf');

    expect(uploaded.mimeType).toBe('image/png');
  });

  it('generates an unguessable storage key unrelated to the original filename', async () => {
    const uploader = await account('attach-uploader8@example.com', 'customer');
    await uploadPng(uploader.token, 'holiday-photo.png');

    const attachment = await AppDataSource.getRepository(MessageAttachment).findOneOrFail({
      where: {},
      order: { createdAt: 'DESC' },
    });

    expect(attachment.storageKey).toMatch(/^[0-9a-f]{48}\.png$/);
    expect(attachment.storageKey).not.toContain('holiday');
  });

  it('serves a Unicode filename without failing the response', async () => {
    const uploader = await account('attach-unicode@example.com', 'customer');

    // Node refuses header values outside Latin-1, so interpolating this name raw
    // uploads fine and then 500s on download.
    const uploaded = await uploadPng(uploader.token, '写真-café-🎉.png');

    const response = await request(server)
      .get(uploaded.url)
      .set('Authorization', `Bearer ${uploader.token}`)
      .expect(200);

    const disposition = response.headers['content-disposition'];
    // ASCII fallback for old clients, plus the real name as RFC 5987.
    expect(disposition).toMatch(/filename="/);
    expect(disposition).toContain("filename*=UTF-8''");
    expect(decodeURIComponent(disposition.split("filename*=UTF-8''")[1])).toBe('写真-café-🎉.png');
  });

  it('shares a legacy attachment referenced by more than one sender', async () => {
    const alice = await account('attach-shared-a@example.com', 'customer');
    const bob = await account('attach-shared-b@example.com', 'provider');
    const carol = await account('attach-shared-c@example.com', 'customer');

    // Two separate conversations, each referencing the same legacy file — the case
    // where a single backfilled row cannot name both senders as uploader.
    const convAB = await request(server)
      .post('/api/v1/messages/conversations')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ participantIds: [bob.user.id], type: 'direct' })
      .expect(201);
    const convCB = await request(server)
      .post('/api/v1/messages/conversations')
      .set('Authorization', `Bearer ${carol.token}`)
      .send({ participantIds: [bob.user.id], type: 'direct' })
      .expect(201);

    const legacyKey = 'legacy-shared.png';
    for (const [conv, sender, receiver] of [
      [convAB.body.data.id, alice.user.id, bob.user.id],
      [convCB.body.data.id, carol.user.id, bob.user.id],
    ] as const) {
      await AppDataSource.query(
        `INSERT INTO messages ("conversationId", "senderId", "receiverId", "message", "attachments", "messageType")
         VALUES ($1, $2, $3, 'shared file', $4::jsonb, 'file')`,
        [conv, sender, receiver, JSON.stringify([`/uploads/messages/${legacyKey}`])]
      );
    }

    const legacyDir = path.join(__dirname, '../../uploads/messages');
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(path.join(legacyDir, legacyKey), PNG_BYTES);

    try {
      await runLegacyAttachmentMigration();

      const migrated = await AppDataSource.getRepository(MessageAttachment).findOneOrFail({
        where: { storageKey: legacyKey },
      });

      // Both senders and their shared participant keep access, whichever of them
      // the backfill happened to record as uploader.
      for (const reader of [alice, carol, bob]) {
        await request(server)
          .get(`/api/v1/messages/attachments/${migrated.id}`)
          .set('Authorization', `Bearer ${reader.token}`)
          .expect(200);
      }
    } finally {
      await fs.rm(path.join(legacyDir, legacyKey), { force: true });
    }
  });

  it('does not let a user grant themselves access by referencing a stolen id', async () => {
    const victim = await account('attach-victim@example.com', 'customer');
    const attacker = await account('attach-attacker@example.com', 'provider');
    const accomplice = await account('attach-accomplice@example.com', 'customer');

    // The victim uploads a private file but never shares it with the attacker.
    const uploaded = await uploadPng(victim.token, 'private.png');

    // The attacker, having learned the id, tries to launder it through a
    // conversation they control.
    const conversation = await request(server)
      .post('/api/v1/messages/conversations')
      .set('Authorization', `Bearer ${attacker.token}`)
      .send({ participantIds: [accomplice.user.id], type: 'direct' })
      .expect(201);

    // Write-time ownership check must reject the attempt outright.
    await request(server)
      .post('/api/v1/messages/messages')
      .set('Authorization', `Bearer ${attacker.token}`)
      .send({
        conversationId: conversation.body.data.id,
        message: 'mine now',
        attachments: [uploaded.url],
      })
      .expect(400);

    // And the file stays unreadable either way.
    await request(server)
      .get(uploaded.url)
      .set('Authorization', `Bearer ${attacker.token}`)
      .expect(404);
  });

  it('does not grant access through a message the uploader did not send', async () => {
    const victim = await account('attach-victim2@example.com', 'customer');
    const attacker = await account('attach-attacker2@example.com', 'provider');

    const uploaded = await uploadPng(victim.token, 'private.png');

    const conversation = await request(server)
      .post('/api/v1/messages/conversations')
      .set('Authorization', `Bearer ${attacker.token}`)
      .send({ participantIds: [victim.user.id], type: 'direct' })
      .expect(201);

    // Bypass the write-time check by writing the reference straight to the database,
    // as if it had been stored before that check existed. The read check must still
    // refuse, because the referencing message was not sent by the uploader.
    await AppDataSource.query(
      `INSERT INTO messages ("conversationId", "senderId", "receiverId", "message", "attachments", "messageType")
       VALUES ($1, $2, $3, 'laundered', $4::jsonb, 'file')`,
      [conversation.body.data.id, attacker.user.id, victim.user.id, JSON.stringify([uploaded.url])]
    );

    await request(server)
      .get(uploaded.url)
      .set('Authorization', `Bearer ${attacker.token}`)
      .expect(404);
  });

  it('lets a conversation participant read an attachment referenced by a message', async () => {
    const sender = await account('attach-sender@example.com', 'customer');
    const recipient = await account('attach-recipient@example.com', 'provider');

    const conversation = await request(server)
      .post('/api/v1/messages/conversations')
      .set('Authorization', `Bearer ${sender.token}`)
      .send({ participantIds: [recipient.user.id], type: 'direct' })
      .expect(201);

    const conversationId = conversation.body.data.id;
    const uploaded = await uploadPng(sender.token);

    await request(server)
      .post('/api/v1/messages/messages')
      .set('Authorization', `Bearer ${sender.token}`)
      .send({ conversationId, message: 'Here is the photo', attachments: [uploaded.url] })
      .expect(201);

    // The recipient did not upload it, but shares the conversation that references it.
    await request(server)
      .get(uploaded.url)
      .set('Authorization', `Bearer ${recipient.token}`)
      .expect(200);
  });

  it('keeps a pre-existing legacy attachment readable after migration', async () => {
    const sender = await account('attach-legacy-sender@example.com', 'customer');
    const recipient = await account('attach-legacy-recipient@example.com', 'provider');

    const conversation = await request(server)
      .post('/api/v1/messages/conversations')
      .set('Authorization', `Bearer ${sender.token}`)
      .send({ participantIds: [recipient.user.id], type: 'direct' })
      .expect(201);

    // A message as it looked before attachments became private: a static
    // /uploads/messages/ URL and no message_attachments row.
    const legacyKey = 'legacy-fixture.png';
    await AppDataSource.query(
      `INSERT INTO messages ("conversationId", "senderId", "receiverId", "message", "attachments", "messageType")
       VALUES ($1, $2, $3, 'old photo', $4::jsonb, 'file')`,
      [
        conversation.body.data.id,
        sender.user.id,
        recipient.user.id,
        JSON.stringify([`/uploads/messages/${legacyKey}`]),
      ]
    );

    // Put the file where legacy uploads lived, so the service fallback can find it.
    const legacyDir = path.join(__dirname, '../../uploads/messages');
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(path.join(legacyDir, legacyKey), PNG_BYTES);

    try {
      await runLegacyAttachmentMigration();

      const migrated = await AppDataSource.getRepository(MessageAttachment).findOneOrFail({
        where: { storageKey: legacyKey },
      });
      expect(migrated.uploaderId).toBe(sender.user.id);
      expect(migrated.mimeType).toBe('image/png');

      const [message] = await AppDataSource.query(
        `SELECT "attachments" FROM messages WHERE "conversationId" = $1`,
        [conversation.body.data.id]
      );
      expect(message.attachments).toEqual([`/api/v1/messages/attachments/${migrated.id}`]);

      // Both participants can still read it, and it is no longer served statically.
      await request(server)
        .get(`/api/v1/messages/attachments/${migrated.id}`)
        .set('Authorization', `Bearer ${recipient.token}`)
        .expect(200);
      await request(server).get(`/uploads/messages/${legacyKey}`).expect(404);
    } finally {
      await fs.rm(path.join(legacyDir, legacyKey), { force: true });
    }
  });
});
