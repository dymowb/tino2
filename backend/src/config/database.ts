import { DataSource, DataSourceOptions } from 'typeorm';
import { buildDatabaseConnection } from './databaseConnection';

const isProduction = process.env.NODE_ENV === 'production';

// The connection string is parsed once, here, and handed over as explicit fields.
// No `connectionString` reaches pg, so nothing can re-parse it and overwrite `ssl`.
const connection = buildDatabaseConnection(process.env.DATABASE_URL, isProduction);

const options: DataSourceOptions = {
  type: 'postgres',
  host: connection.host,
  port: connection.port,
  username: connection.username,
  password: connection.password,
  database: connection.database,
  synchronize: false,
  logging: !isProduction && process.env.NODE_ENV !== 'test',
  entities: [__dirname + '/../models/' + (isProduction ? '*.js' : '*.ts')],
  // Memory/pgvector migrations have their own DataSource. Do not recurse into
  // migrations/memory here or the app database will incorrectly require pgvector.
  migrations: [isProduction ? 'dist/migrations/*.js' : 'src/migrations/*.ts'],
  ssl: connection.ssl,
  poolSize: 20,
  extra: {
    ...connection.extra,
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
