import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { buildDatabaseConnection } from './databaseSsl';

dotenv.config();

const connection = buildDatabaseConnection(process.env.DATABASE_URL);

export default new DataSource({
  type: 'postgres',
  url: connection.url,
  synchronize: false,
  logging: false,
  entities: ['src/models/*.ts'],
  migrations: ['src/migrations/*.ts'],
  ssl: connection.ssl,
});
