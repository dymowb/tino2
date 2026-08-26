import { DataSource, DataSourceOptions } from 'typeorm';
import { buildDatabaseConnection } from './databaseSsl';

const isProduction = process.env.NODE_ENV === 'production';

// One authority on TLS: the URL is stripped of its own `ssl*` parameters so pg
// cannot re-derive an `ssl` config that overwrites the one below.
const connection = buildDatabaseConnection(process.env.DATABASE_URL, isProduction);

const options: DataSourceOptions = {
  type: 'postgres',
  url: connection.url,
  synchronize: false,
  logging: !isProduction && process.env.NODE_ENV !== 'test',
  entities: [__dirname + '/../models/' + (isProduction ? '*.js' : '*.ts')],
  // Memory/pgvector migrations have their own DataSource. Do not recurse into
  // migrations/memory here or the app database will incorrectly require pgvector.
  migrations: [isProduction ? 'dist/migrations/*.js' : 'src/migrations/*.ts'],
  ssl: connection.ssl,
  poolSize: 20,
  extra: {
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 20,
    min: 2,
  },
};

export const AppDataSource = new DataSource(options);

export const initializeDatabase = async (): Promise<void> => {
  try {
    await AppDataSource.initialize();
    console.log('PostgreSQL database connected successfully');
  } catch (error) {
    console.error('Error connecting to database:', error);
    throw error;
  }
};
