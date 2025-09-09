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
import userRoutes from '@/routes/users';
import providerRoutes from '@/routes/providers';
import bookingRoutes from '@/routes/bookings';
import quoteRoutes from '@/routes/quotes';
import messageRoutes from '@/routes/messages';
// Browser routes temporarily disabled due to compilation errors
// import browserRoutes from '@/routes/browser';
import paymentRoutes from '@/routes/payments';
import reviewRoutes from '@/routes/reviews';
// import locationRoutes from '@/routes/locations';
// import adminRoutes from '@/routes/admin';
import messageService from '@/services/MessageService';

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
    this.initializeServices();
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
    // Welcome page
    this.app.get('/', (req, res) => {
      res.json({
        success: true,
        message: 'Tino 2 Domestic Service API',
        version: config.server.apiVersion,
        environment: config.server.nodeEnv,
        endpoints: {
          health: '/health',
          auth: `/api/${config.server.apiVersion}/auth`,
          users: `/api/${config.server.apiVersion}/users`,
          providers: `/api/${config.server.apiVersion}/providers`,
          bookings: `/api/${config.server.apiVersion}/bookings`,
          quotes: `/api/${config.server.apiVersion}/quotes`,
          messages: `/api/${config.server.apiVersion}/messages`,
          browser: `/api/${config.server.apiVersion}/browser`,
          payments: `/api/${config.server.apiVersion}/payments`,
          reviews: `/api/${config.server.apiVersion}/reviews`,
          locations: `/api/${config.server.apiVersion}/locations`,
          admin: `/api/${config.server.apiVersion}/admin`,
        },
        documentation: 'Available endpoints listed above',
      });
    });

    this.app.get('/health', (req, res) => {
      res.json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        environment: config.server.nodeEnv,
      });
    });

    this.app.use(`/api/${config.server.apiVersion}/auth`, authRoutes);
    this.app.use(`/api/${config.server.apiVersion}/users`, userRoutes);
    this.app.use(`/api/${config.server.apiVersion}/providers`, providerRoutes);
    this.app.use(`/api/${config.server.apiVersion}/bookings`, bookingRoutes);
    this.app.use(`/api/${config.server.apiVersion}/quotes`, quoteRoutes);
    this.app.use(`/api/${config.server.apiVersion}/messages`, messageRoutes);
    // this.app.use(`/api/${config.server.apiVersion}/browser`, browserRoutes);
    this.app.use(`/api/${config.server.apiVersion}/payments`, paymentRoutes);
    this.app.use(`/api/${config.server.apiVersion}/reviews`, reviewRoutes);
    // this.app.use(`/api/${config.server.apiVersion}/locations`, locationRoutes);
    // this.app.use(`/api/${config.server.apiVersion}/admin`, adminRoutes);

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
        // TODO: Add JWT verification middleware for Socket.IO
        next();
      } else {
        next(new Error('Authentication error'));
      }
    });

    this.io.on('connection', (socket) => {
      const userId = socket.handshake.auth.userId; // From JWT token
      logger.info(`User connected: ${socket.id}, userId: ${userId}`);

      // Handle user connection for messaging
      if (userId) {
        messageService.handleUserConnection(userId, socket.id);
      }

      // Join user to their personal room
      socket.on('join_user_room', (userId) => {
        socket.join(`user_${userId}`);
        logger.info(`User ${socket.id} joined personal room user_${userId}`);
      });

      // Join conversation room
      socket.on('join_conversation', async ({ userId, conversationId }) => {
        try {
          await messageService.joinConversation(userId, conversationId, socket.id);
        } catch (error) {
          socket.emit('error', { message: 'Failed to join conversation' });
        }
      });

      // Leave conversation room
      socket.on('leave_conversation', (conversationId) => {
        messageService.leaveConversation(conversationId, socket.id);
      });

      // Generic room join/leave (backwards compatibility)
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
        if (userId) {
          messageService.handleUserDisconnection(userId, socket.id);
        }
      });
    });
  }

  private initializeServices(): void {
    // Set Socket.IO instance in MessageService for real-time features
    messageService.setSocketServer(this.io);
  }

  public listen(): void {
    this.server.listen(config.server.port, () => {
      logger.info(`Server running on port ${config.server.port} in ${config.server.nodeEnv} mode`);
    });
  }
}

export default App;