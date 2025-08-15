import 'reflect-metadata';
import { AppDataSource } from '@/config/database';
import { redisClient } from '@/config/redis';
import { mongoClient } from '@/config/mongodb';

beforeAll(async () => {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  
  await redisClient.connect();
  await mongoClient.connect();
});

afterAll(async () => {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
  
  await redisClient.disconnect();
  await mongoClient.disconnect();
});

beforeEach(async () => {
  await redisClient.getClient().flushall();
});

afterEach(async () => {
  const entities = AppDataSource.entityMetadatas;
  
  for (const entity of entities) {
    const repository = AppDataSource.getRepository(entity.name);
    await repository.clear();
  }
});