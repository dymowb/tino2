import winston from 'winston';
import config from './environment';
import { getRequestContext } from '@/observability/requestContext';

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format((info) => {
    const context = getRequestContext();
    if (context) info.requestId = context.requestId;
    return info;
  })(),
  winston.format.json()
);

const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: logFormat,
    }),
  ],
});

if (config.server.nodeEnv === 'production') {
  logger.add(
    new winston.transports.File({
      filename: config.logging.file.replace('app.log', 'error.log'),
      level: 'error',
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    })
  );

  logger.add(
    new winston.transports.File({
      filename: config.logging.file,
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    })
  );
}

export default logger;
