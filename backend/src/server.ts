import 'reflect-metadata';
require('../module-alias');
import dotenv from 'dotenv';

dotenv.config({ path: process.env.NODE_ENV === 'production' ? '.env.production' : '.env' });

import * as Sentry from '@sentry/node';
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
}

import { App } from '@/app';
import { initializeDatabase } from '@/config/database';
import { initializeMemoryDatabase } from '@/config/memoryDatabase';
import { redisClient } from '@/config/redis';
import logger from '@/config/logger';
import { startAutoCaptureJob } from '@/jobs/autoCapture.job';
import { startReflectionJob } from '@/jobs/reflection.job';
import { startQuoteExpiryJob } from '@/jobs/quoteExpiry.job';
import { startBookingReminderJob } from '@/jobs/bookingReminder.job';
import { validateConfig } from '@/config/environment';

async function bootstrap(): Promise<void> {
  try {
    validateConfig();
    logger.info('Starting Tino 2 Backend Server...');

    await initializeDatabase();

    await initializeMemoryDatabase();

    if (process.env.REDIS_ENABLED === 'true') {
      await redisClient.connect();
      logger.info('Redis connected');
    } else {
      logger.info('Redis disabled');
    }

    const app = new App();
    app.listen();

    startAutoCaptureJob();
    startReflectionJob();
    startQuoteExpiryJob();
    startBookingReminderJob();

    const gracefulShutdown = async (): Promise<void> => {
      logger.info('Received shutdown signal. Gracefully shutting down...');

      try {
        if (process.env.REDIS_ENABLED === 'true') {
          await redisClient.disconnect();
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
