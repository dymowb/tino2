import 'reflect-metadata';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough-for-tests-only';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key';
process.env.REDIS_ENABLED = 'false';
process.env.REBOOK_AI_MODEL_CHAIN = process.env.REBOOK_AI_MODEL_CHAIN || 'anthropic:test-model';
process.env.AI_FAST_MODEL_CHAIN = process.env.AI_FAST_MODEL_CHAIN || 'anthropic:test-fast';
process.env.AI_REASONING_MODEL_CHAIN =
  process.env.AI_REASONING_MODEL_CHAIN || 'anthropic:test-reasoning';
process.env.AI_SYNTHESIS_MODEL_CHAIN =
  process.env.AI_SYNTHESIS_MODEL_CHAIN || 'anthropic:test-synthesis';
process.env.AI_EMBEDDING_CHAIN = process.env.AI_EMBEDDING_CHAIN || 'openai:test-embedding';
process.env.AI_EMBEDDING_DIMENSIONS = process.env.AI_EMBEDDING_DIMENSIONS || '1024';

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgresql://tino_test:tino_test@localhost:5434/tino_test';
const configuredDatabaseUrl = process.env.DATABASE_URL;

if (configuredDatabaseUrl && configuredDatabaseUrl === testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL must not equal the configured application DATABASE_URL');
}
if (!/localhost:5434\/tino_test$/.test(testDatabaseUrl) && process.env.CI !== 'true') {
  throw new Error('Refusing to run tests against a non-local, non-test PostgreSQL database');
}

process.env.DATABASE_URL = testDatabaseUrl;

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: jest.fn().mockResolvedValue({
        id: 'pi_test_123',
        client_secret: 'pi_test_123_secret',
        status: 'requires_payment_method',
      }),
      confirm: jest.fn().mockResolvedValue({
        id: 'pi_test_123',
        status: 'succeeded',
      }),
      capture: jest.fn().mockResolvedValue({ id: 'pi_test_123', status: 'succeeded' }),
      cancel: jest.fn().mockResolvedValue({ id: 'pi_test_123', status: 'canceled' }),
    },
    refunds: {
      create: jest.fn().mockResolvedValue({
        id: 're_test_123',
        amount: 10000,
        status: 'succeeded',
      }),
    },
    webhooks: {
      constructEvent: jest.fn(() => {
        throw new Error('Invalid Stripe signature');
      }),
    },
  }));
});

jest.mock('@/config/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const { AppDataSource } = require('@/config/database') as typeof import('@/config/database');

beforeAll(async () => {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  await AppDataSource.runMigrations();
});

beforeEach(async () => {
  const tables = await AppDataSource.query(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename NOT IN ('migrations', 'typeorm_metadata')`
  );
  if (tables.length > 0) {
    const quoted = tables
      .map(({ tablename }: { tablename: string }) => `"${tablename}"`)
      .join(', ');

    // Several code paths write notifications fire-and-forget, so a previous test's
    // inserts can still be in flight when this runs and deadlock against the
    // TRUNCATE's ACCESS EXCLUSIVE locks. That is a harness timing artifact, not a
    // product fault, so retry briefly before failing the run.
    for (let attempt = 0; ; attempt++) {
      try {
        await AppDataSource.query(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
        break;
      } catch (error) {
        const isDeadlock = error instanceof Error && /deadlock detected/i.test(error.message);
        if (!isDeadlock || attempt >= 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
      }
    }
  }
  jest.clearAllMocks();
});

afterAll(async () => {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
});
