import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { buildDatabaseSsl } from './databaseSsl';

dotenv.config();

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false,
  logging: false,
  entities: ['src/models/*.ts'],
  migrations: ['src/migrations/*.ts'],
  ssl: buildDatabaseSsl(process.env.DATABASE_URL),
});
