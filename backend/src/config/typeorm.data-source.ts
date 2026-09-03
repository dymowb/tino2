import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { buildDatabaseConnection } from './databaseConnection';

dotenv.config();

const connection = buildDatabaseConnection(process.env.DATABASE_URL);

export default new DataSource({
  type: 'postgres',
  host: connection.host,
  port: connection.port,
  username: connection.username,
  password: connection.password,
  database: connection.database,
  synchronize: false,
  logging: false,
  entities: ['src/models/*.ts'],
  migrations: ['src/migrations/*.ts'],
  ssl: connection.ssl,
  extra: connection.extra,
});
