import request from 'supertest';
import App from '@/app';
import { AppDataSource } from '@/config/database';
import { BasicUser } from '@/models/BasicUser';
import { Conversation, ConversationType } from '@/models/Conversation';
import { Message } from '@/models/Message';
import { Notification, NotificationType } from '@/models/Notification';
import MemoryDataSource from '@/config/memory.data-source';

/**
 * "Download my data" used to serialize the profile the user was already looking
 * at. These pin what a portable export has to contain — and, just as much, what
 * it must not: credentials, other people's writing, and staff-only notes.
 */
describe('personal data export', () => {
  const server = new App().app;
  const password = 'ExportTest123!';

  async function account(email: string, firstName = 'Export') {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password, firstName, lastName: 'Test', userType: 'customer' })
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

  function exportFor(token: string) {
    return request(server).get('/api/v1/users/export').set('Authorization', `Bearer ${token}`);
  }

  it('refuses anonymous callers', async () => {
    await request(server).get('/api/v1/users/export').expect(401);
  });

  it('reaches the export rather than being read as a user id', async () => {
    const { token } = await account('export-route@example.com');

    // `/users/:id` is registered on the same path segment. If it wins, this comes
    // back as a lookup for a user called "export" instead of the export itself.
    const response = await exportFor(token).expect(200);
    expect(response.body.meta.format).toBe('tino2.data-export.v1');
    expect(response.headers['content-disposition']).toContain('attachment');
  });

  it('carries the account holder’s own records', async () => {
    const { user, token } = await account('export-content@example.com');

    await AppDataSource.getRepository(Notification).save({
      userId: user.id,
      type: NotificationType.SYSTEM,
      title: 'Welcome aboard',
      message: 'A notification that belongs in the export',
    });

    const response = await exportFor(token).expect(200);
    const data = response.body;

    expect(data.profile).toMatchObject({ id: user.id, email: 'export-content@example.com' });
    expect(data.meta.subject).toEqual({ id: user.id, email: 'export-content@example.com' });

    // Every collection the audit found missing is present, even when empty — an
    // absent key reads as "we hold nothing", which is a different claim.
    for (const key of [
      'bookings',
      'quoteRequests',
      'quotes',
      'payments',
      'reviewsWritten',
      'reviewsReceived',
      'conversations',
      'notifications',
      'favoriteProviders',
      'assistantMemory',
    ]) {
      expect(`${key}:${Array.isArray(data[key])}`).toBe(`${key}:true`);
    }

    expect(data.notifications).toHaveLength(1);
    expect(data.notifications[0]).toMatchObject({ title: 'Welcome aboard' });
  });

  it('never carries credentials or tokens', async () => {
    const { token } = await account('export-secrets@example.com');

    const response = await exportFor(token).expect(200);
    const serialized = JSON.stringify(response.body);

    // The models behind this export hold a bcrypt hash and three kinds of token.
    // Checked against the whole document, because the risk is a nested relation
    // dragging one in rather than the top-level profile listing it outright.
    for (const forbidden of [
      'password',
      'emailVerificationToken',
      'passwordResetToken',
      'refreshToken',
      '$2b$',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('carries the user’s own messages but not the other side’s', async () => {
    const mine = await account('export-me@example.com', 'Mine');
    const theirs = await account('export-them@example.com', 'Theirs');

    const conversation = await AppDataSource.getRepository(Conversation).save({
      type: ConversationType.DIRECT,
      title: 'About the booking',
      participants: [{ id: mine.user.id }, { id: theirs.user.id }] as never,
    });

    const messages = AppDataSource.getRepository(Message);
    await messages.save({
      conversationId: conversation.id,
      senderId: mine.user.id,
      receiverId: theirs.user.id,
      message: 'MINE_ONE can you come on Tuesday?',
    });
    await messages.save({
      conversationId: conversation.id,
      senderId: theirs.user.id,
      receiverId: mine.user.id,
      message: 'THEIRS_ONE Tuesday works',
    });
    await messages.save({
      conversationId: conversation.id,
      senderId: mine.user.id,
      receiverId: theirs.user.id,
      message: 'MINE_TWO see you then',
    });

    const response = await exportFor(mine.token).expect(200);
    const serialized = JSON.stringify(response.body);

    expect(response.body.conversations).toHaveLength(1);
    const [thread] = response.body.conversations;

    // My own words, in full.
    expect(thread.messages).toHaveLength(2);
    expect(serialized).toContain('MINE_ONE');
    expect(serialized).toContain('MINE_TWO');

    // Theirs are not mine to take away, anywhere in the document.
    expect(serialized).not.toContain('THEIRS_ONE');

    // But the thread does not pretend they never wrote: the count is there, and
    // enough about them to know who this was with.
    expect(thread.messagesFromCounterparts).toBe(1);
    expect(thread.counterparts).toEqual([{ name: 'Theirs Test', role: 'customer' }]);

    // Contact details are not part of "who this was with".
    expect(serialized).not.toContain('export-them@example.com');
  });

  describe('assistant memory', () => {
    // Exercised against a real memory database on purpose. The first version of
    // this query named columns that do not exist — the table is snake_case while
    // the entity is camelCase — and every export would have caught the SQL error
    // and reported memory as unavailable. Nothing in the suite noticed, because
    // the memory data source is not initialized by default and the code path
    // returned an empty list before reaching the query.
    beforeAll(async () => {
      if (!MemoryDataSource.isInitialized) {
        await MemoryDataSource.initialize();
      }
      await MemoryDataSource.runMigrations();
    });

    afterAll(async () => {
      if (MemoryDataSource.isInitialized) {
        await MemoryDataSource.destroy();
      }
    });

    beforeEach(async () => {
      await MemoryDataSource.query('TRUNCATE TABLE "semantic_memories" CASCADE');
    });

    it('carries what the assistant remembers about the account holder', async () => {
      const { user, token } = await account('export-memory@example.com');

      await MemoryDataSource.query(
        `INSERT INTO "semantic_memories" ("user_id", "content", "confidence", "source_type")
         VALUES ($1, $2, 0.9, 'extraction')`,
        [user.id, 'Prefers appointments in the morning']
      );

      const response = await exportFor(token).expect(200);

      expect(response.body.assistantMemory).toHaveLength(1);
      expect(response.body.assistantMemory[0]).toMatchObject({
        content: 'Prefers appointments in the morning',
        confidence: 0.9,
        sourceType: 'extraction',
      });
      // A silent SQL failure reports itself rather than looking like an empty
      // history, so the absence of that marker is part of the assertion.
      expect(JSON.stringify(response.body.assistantMemory)).not.toContain('unavailable');
    });

    it('does not carry another account holder’s memories', async () => {
      const mine = await account('export-memory-mine@example.com');
      const theirs = await account('export-memory-theirs@example.com', 'Theirs');

      await MemoryDataSource.query(
        `INSERT INTO "semantic_memories" ("user_id", "content", "confidence", "source_type")
         VALUES ($1, $2, 0.9, 'extraction')`,
        [theirs.user.id, 'THEIR_PRIVATE_MEMORY']
      );

      const response = await exportFor(mine.token).expect(200);
      expect(response.body.assistantMemory).toEqual([]);
      expect(JSON.stringify(response.body)).not.toContain('THEIR_PRIVATE_MEMORY');
    });
  });

  it('exports each account separately', async () => {
    const first = await account('export-first@example.com');
    const second = await account('export-second@example.com', 'Second');

    await AppDataSource.getRepository(Notification).save({
      userId: second.user.id,
      type: NotificationType.SYSTEM,
      title: 'SECOND_ONLY_NOTIFICATION',
      message: 'belongs to the other account',
    });

    const response = await exportFor(first.token).expect(200);
    expect(JSON.stringify(response.body)).not.toContain('SECOND_ONLY_NOTIFICATION');
    expect(response.body.notifications).toEqual([]);
  });
});
