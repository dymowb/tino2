import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { SemanticMemory } from '../models/memory/SemanticMemory';
import { EpisodicMemory } from '../models/memory/EpisodicMemory';
import { ProceduralRule } from '../models/memory/ProceduralRule';
import { MemoryRetrievalLog } from '../models/memory/MemoryRetrievalLog';
import { MemoryWriteLog } from '../models/memory/MemoryWriteLog';
import { buildDatabaseConnection } from './databaseConnection';

dotenv.config();

// The same TLS policy as every other data source. This one is the TypeORM CLI's,
// and leaving it on its own resolver is how the memory store ends up with two
// configurations that can disagree.
const connection = buildDatabaseConnection(process.env.MEMORY_DATABASE_URL);

export default new DataSource({
  type: 'postgres',
  host: connection.host,
  port: connection.port,
  username: connection.username,
  password: connection.password,
  database: connection.database,
  ssl: connection.ssl,
  extra: connection.extra,
  synchronize: false,
  logging: false,
  entities: [SemanticMemory, EpisodicMemory, ProceduralRule, MemoryRetrievalLog, MemoryWriteLog],
  migrations: ['src/migrations/memory/*.ts'],
});
