import { DataSource } from 'typeorm';
import config from './environment';

export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: './database.sqlite',
  synchronize: config.server.nodeEnv === 'development',
  logging: config.server.nodeEnv === 'development',
  entities: [__dirname + '/../models/*.ts'],
  migrations: ['dist/migrations/**/*.js'],
  subscribers: ['dist/subscribers/**/*.js'],
});

export const initializeDatabase = async (): Promise<void> => {
  try {
    await AppDataSource.initialize();
    console.log('PostgreSQL Database connected successfully');
  } catch (error) {
    console.error('Error connecting to PostgreSQL database:', error);
    throw error;
  }
};
