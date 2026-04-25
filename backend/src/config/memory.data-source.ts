import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { SemanticMemory } from '../models/memory/SemanticMemory';
import { EpisodicMemory } from '../models/memory/EpisodicMemory';
import { ProceduralRule } from '../models/memory/ProceduralRule';
import { MemoryRetrievalLog } from '../models/memory/MemoryRetrievalLog';
import { MemoryWriteLog } from '../models/memory/MemoryWriteLog';

dotenv.config();

export default new DataSource({
  type: 'postgres',
  url: process.env.MEMORY_DATABASE_URL,
  synchronize: false,
  logging: false,
  entities: [SemanticMemory, EpisodicMemory, ProceduralRule, MemoryRetrievalLog, MemoryWriteLog],
  migrations: ['src/migrations/memory/*.ts'],
});
