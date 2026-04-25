import { DataSource } from 'typeorm';
import { SemanticMemory } from '@/models/memory/SemanticMemory';
import { EpisodicMemory } from '@/models/memory/EpisodicMemory';
import { ProceduralRule } from '@/models/memory/ProceduralRule';
import { MemoryRetrievalLog } from '@/models/memory/MemoryRetrievalLog';
import { MemoryWriteLog } from '@/models/memory/MemoryWriteLog';
import logger from '@/config/logger';

const MEMORY_ENTITIES = [
  SemanticMemory,
  EpisodicMemory,
  ProceduralRule,
  MemoryRetrievalLog,
  MemoryWriteLog,
];

export const MemoryDataSource = new DataSource({
  type: 'postgres',
  url: process.env.MEMORY_DATABASE_URL,
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  entities: MEMORY_ENTITIES,
  migrations: [__dirname + '/../migrations/memory/*.js'],
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  extra: {
    max: 5,
    min: 1,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  },
});

export const isMemoryEnabled = (): boolean => !!process.env.MEMORY_DATABASE_URL;

export const initializeMemoryDatabase = async (): Promise<boolean> => {
  if (!isMemoryEnabled()) {
    logger.info('Memory system disabled (MEMORY_DATABASE_URL not set)');
    return false;
  }

  try {
    await MemoryDataSource.initialize();
    logger.info('Memory database (PostgreSQL + pgvector) connected');
    return true;
  } catch (error) {
    logger.error('Failed to connect to memory database:', error);
    throw error;
  }
};
