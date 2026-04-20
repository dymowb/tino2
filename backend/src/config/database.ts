import { DataSource, DataSourceOptions } from 'typeorm';

const isProduction = process.env.NODE_ENV === 'production';

const devOptions: DataSourceOptions = {
  type: 'sqlite',
  database: './database.sqlite',
  synchronize: true,
  logging: true,
  entities: [__dirname + '/../models/*.ts'],
  migrations: ['dist/migrations/**/*.js'],
  subscribers: ['dist/subscribers/**/*.js'],
};

const prodOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false,
  logging: false,
  entities: [__dirname + '/../models/*.js'],
  migrations: ['dist/migrations/**/*.js'],
  subscribers: ['dist/subscribers/**/*.js'],
  ssl: { rejectUnauthorized: false },
};

export const AppDataSource = new DataSource(isProduction ? prodOptions : devOptions);

export const initializeDatabase = async (): Promise<void> => {
  try {
    await AppDataSource.initialize();
    console.log(`${isProduction ? 'PostgreSQL' : 'SQLite'} database connected successfully`);
  } catch (error) {
    console.error('Error connecting to database:', error);
    throw error;
  }
};
