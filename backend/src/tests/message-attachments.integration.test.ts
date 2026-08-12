import request from 'supertest';
import App from '@/app';
import { AppDataSource } from '@/config/database';
import { BasicUser } from '@/models/BasicUser';
import { MessageAttachment } from '@/models/MessageAttachment';

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
});
