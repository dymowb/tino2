import 'reflect-metadata';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough-for-tests-only';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key';
process.env.REDIS_ENABLED = 'false';

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
    await AppDataSource.query(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
  }
  jest.clearAllMocks();
});

afterAll(async () => {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
});
