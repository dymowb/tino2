import winston from 'winston';
import config from './environment';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return `${timestamp} ${level}: ${stack || message}`;
  })
);

const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
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
