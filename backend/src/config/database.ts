import { DataSource, DataSourceOptions } from 'typeorm';

const isProduction = process.env.NODE_ENV === 'production';

const options: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false,
  logging: !isProduction,
  entities: [__dirname + '/../models/' + (isProduction ? '*.js' : '*.ts')],
  migrations: [isProduction ? 'dist/migrations/**/*.js' : 'src/migrations/**/*.ts'],
  ssl: isProduction ? { rejectUnauthorized: false } : false,
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
