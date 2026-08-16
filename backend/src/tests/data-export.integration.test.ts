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
    ]) {
      expect(`${key}:${Array.isArray(data[key])}`).toBe(`${key}:true`);
    }

    // Assistant memory is a shape of its own: five stores, each of which has to be
    // present rather than collapsed into one list.
    for (const key of ['semantic', 'episodic', 'proceduralRules', 'retrievalLog', 'writeLog']) {
      expect(`${key}:${Array.isArray(data.assistantMemory[key])}`).toBe(`${key}:true`);
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
      await MemoryDataSource.query(
        `TRUNCATE TABLE "semantic_memories", "episodic_memories", "procedural_rules",
                        "memory_retrieval_log", "memory_write_log" CASCADE`
      );
    });

    /**
     * One row in every user-scoped table the memory database has. Exporting only
     * the facts and stopping there is the same failure as exporting only the
     * profile: what the assistant concluded about someone, what it recorded them
     * doing, and what they typed at it are all theirs.
     */
    async function seedEveryMemoryStore(userId: string, marker: string) {
      await MemoryDataSource.query(
        `INSERT INTO "semantic_memories" ("user_id", "content", "confidence", "source_type")
         VALUES ($1, $2, 0.9, 'extraction')`,
        [userId, `${marker}_SEMANTIC prefers mornings`]
      );
      await MemoryDataSource.query(
        `INSERT INTO "episodic_memories" ("user_id", "summary", "occurred_at")
         VALUES ($1, $2, now())`,
        [userId, `${marker}_EPISODIC booked a cleaning`]
      );
      await MemoryDataSource.query(
        `INSERT INTO "procedural_rules" ("user_id", "rule_text", "prompt_fragment", "confidence", "status")
         VALUES ($1, $2, $3, 0.9, 'active')`,
        [userId, `${marker}_RULE always confirm the address`, `${marker}_FRAGMENT confirm address`]
      );
      await MemoryDataSource.query(
        `INSERT INTO "memory_retrieval_log" ("user_id", "query_text", "memory_type")
         VALUES ($1, $2, 'semantic')`,
        [userId, `${marker}_QUERY who cleaned my flat`]
      );
      await MemoryDataSource.query(
        `INSERT INTO "memory_write_log" ("user_id", "memory_type", "action", "source_content")
         VALUES ($1, 'semantic', 'created', $2)`,
        [userId, `${marker}_WRITE original message text`]
      );
    }

    it('carries every store the assistant keeps, not only the facts', async () => {
      const { user, token } = await account('export-memory@example.com');
      await seedEveryMemoryStore(user.id, 'MINE');

      const { assistantMemory } = (await exportFor(token).expect(200)).body;

      expect(assistantMemory.semantic[0]).toMatchObject({
        content: 'MINE_SEMANTIC prefers mornings',
        confidence: 0.9,
        sourceType: 'extraction',
      });
      expect(assistantMemory.episodic[0]).toMatchObject({
        summary: 'MINE_EPISODIC booked a cleaning',
      });
      expect(assistantMemory.proceduralRules[0]).toMatchObject({
        ruleText: 'MINE_RULE always confirm the address',
        status: 'active',
      });
      expect(assistantMemory.retrievalLog[0]).toMatchObject({
        queryText: 'MINE_QUERY who cleaned my flat',
        memoryType: 'semantic',
      });
      expect(assistantMemory.writeLog[0]).toMatchObject({
        sourceContent: 'MINE_WRITE original message text',
        action: 'created',
      });

      // A silent SQL failure reports itself rather than looking like an empty
      // history, so the absence of that marker is part of the assertion.
      expect(assistantMemory.unavailable).toBeUndefined();
    });

    it('does not carry another account holder\u2019s memories', async () => {
      const mine = await account('export-memory-mine@example.com');
      const theirs = await account('export-memory-theirs@example.com', 'Theirs');
      await seedEveryMemoryStore(theirs.user.id, 'THEIRS');

      const response = await exportFor(mine.token).expect(200);

      expect(response.body.assistantMemory).toMatchObject({
        semantic: [],
        episodic: [],
        proceduralRules: [],
        retrievalLog: [],
        writeLog: [],
      });
      expect(JSON.stringify(response.body)).not.toContain('THEIRS_');
    });

    it('never carries embedding vectors', async () => {
      const { user, token } = await account('export-memory-vectors@example.com');
      await seedEveryMemoryStore(user.id, 'VECTOR');
      await MemoryDataSource.query(
        `UPDATE "semantic_memories" SET "embedding" = $2 WHERE "user_id" = $1`,
        [user.id, `[${Array.from({ length: 1024 }, () => '0.5').join(',')}]`]
      );

      const response = await exportFor(token).expect(200);

      // A derived encoding of text that is already in the file, at roughly a
      // thousand floats per row. Nothing to port, plenty to bloat.
      expect(JSON.stringify(response.body)).not.toContain('embedding');
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
