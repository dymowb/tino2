import 'reflect-metadata';
import express from 'express';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import config from '@/config/environment';
import logger from '@/config/logger';
import { securityMiddleware, sanitizeInput, logSuspiciousActivity, rateLimiters } from '@/middleware/security';

import authRoutes from '@/routes/auth';

export class App {
  public app: express.Application;
  public server: any;
  public io: SocketIOServer;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: ['http://localhost:3000', 'http://localhost:3001'],
        credentials: true,
      },
    });

    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
    this.initializeSocketIO();
  }

  private initializeMiddleware(): void {
    this.app.use(morgan('combined', {
      stream: {
        write: (message) => logger.info(message.trim()),
      },
    }));

    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use(cookieParser());

    this.app.use(securityMiddleware);

    this.app.use(rateLimiters.general);
    this.app.use(sanitizeInput);
    this.app.use(logSuspiciousActivity);

    this.app.use('/uploads', express.static('uploads'));
  }

  private initializeRoutes(): void {
    this.app.get('/health', (req, res) => {
      res.json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        environment: config.server.nodeEnv,
      });
    });

    this.app.use(`/api/${config.server.apiVersion}/auth`, authRoutes);

    this.app.all('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Route not found',
      });
    });
  }

  private initializeErrorHandling(): void {
    this.app.use((error: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error('Unhandled error:', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      const isDevelopment = config.server.nodeEnv === 'development';

      res.status(error.status || 500).json({
        success: false,
        error: error.message || 'Internal server error',
        ...(isDevelopment && { stack: error.stack }),
      });
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });
  }

  private initializeSocketIO(): void {
    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token;
      if (token) {
        next();
      } else {
        next(new Error('Authentication error'));
      }
    });

    this.io.on('connection', (socket) => {
      logger.info(`User connected: ${socket.id}`);

      socket.on('join_room', (roomId) => {
        socket.join(roomId);
        logger.info(`User ${socket.id} joined room ${roomId}`);
      });

      socket.on('leave_room', (roomId) => {
        socket.leave(roomId);
        logger.info(`User ${socket.id} left room ${roomId}`);
      });

      socket.on('disconnect', () => {
        logger.info(`User disconnected: ${socket.id}`);
      });
    });
  }

  public listen(): void {
    this.server.listen(config.server.port, () => {
      logger.info(`Server running on port ${config.server.port} in ${config.server.nodeEnv} mode`);
    });
  }
}

export default App;