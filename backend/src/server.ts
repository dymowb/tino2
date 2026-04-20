import 'reflect-metadata';
require('../module-alias');
import dotenv from 'dotenv';

dotenv.config();

import { App } from '@/app';
import { initializeDatabase } from '@/config/database';
import { redisClient } from '@/config/redis';
import { mongoClient } from '@/config/mongodb';
import logger from '@/config/logger';
import { startAutoCaptureJob } from '@/jobs/autoCapture.job';
import { validateConfig } from '@/config/environment';

async function bootstrap(): Promise<void> {
  try {
    validateConfig();
    logger.info('Starting Tino 2 Backend Server...');

    await initializeDatabase();
    logger.info('SQLite database initialized');

    if (process.env.REDIS_ENABLED === 'true') {
      await redisClient.connect();
      logger.info('Redis connected');
    } else {
      logger.info('Redis disabled');
    }

    if (process.env.MONGODB_ENABLED === 'true') {
      await mongoClient.connect();
      logger.info('MongoDB connected');
    } else {
      logger.info('MongoDB disabled');
    }

    const app = new App();
    app.listen();

    startAutoCaptureJob();

    const gracefulShutdown = async (): Promise<void> => {
      logger.info('Received shutdown signal. Gracefully shutting down...');
      
      try {
        if (process.env.REDIS_ENABLED === 'true') {
          await redisClient.disconnect();
        }
        if (process.env.MONGODB_ENABLED === 'true') {
          await mongoClient.disconnect();
        }
        logger.info('Databases disconnected successfully');
        
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap().catch((error) => {
  logger.error('Bootstrap error:', error);
  process.exit(1);
});