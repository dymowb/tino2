import 'reflect-metadata';
import * as Sentry from '@sentry/node';
import express from 'express';
import morgan from 'morgan';
import path from 'path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import config from '@/config/environment';
import logger from '@/config/logger';
import {
  securityMiddleware,
  sanitizeInput,
  logSuspiciousActivity,
  rateLimiters,
  getAllowedOrigins,
} from '@/middleware/security';

import { AppDataSource } from '@/config/database';
import authRoutes from '@/routes/auth';
import userRoutes from '@/routes/users';
import providerRoutes from '@/routes/providers';
import bookingRoutes from '@/routes/bookings';
import readinessRoutes from '@/routes/readiness';
import quoteRoutes from '@/routes/quotes';
import messageRoutes from '@/routes/messages';
// Browser routes temporarily disabled due to compilation errors
// import browserRoutes from '@/routes/browser';
import paymentRoutes from '@/routes/payments';
import reviewRoutes from '@/routes/reviews';
import notificationRoutes from '@/routes/notifications';
import locationRoutes from '@/routes/locations';
import adminRoutes from '@/routes/admin';
import agenticAssistantRoutes from '@/routes/agentic-assistant.routes';
import memoryRoutes from '@/routes/memory.routes';
import voiceRoutes from '@/routes/voice';
import configRoutes from '@/routes/config';
import openApiRoutes from '@/routes/openapi';
import messageService from '@/services/MessageService';
import notificationService from '@/services/NotificationService';
import { resolveSocketUser } from '@/utils/socketAuth';
import { requestContextMiddleware } from '@/observability/requestContext';
import { getJobMetrics } from '@/observability/jobMetrics';
import { validateAiConfiguration } from '@/agents/services/ai-gateway.service';
import { validateEmbeddingConfiguration } from '@/services/memory/EmbeddingService';
import { isMemoryEnabled } from '@/config/memoryDatabase';

export class App {
  public app: express.Application;
  public server: any;
  public io: SocketIOServer;

  constructor() {
    validateAiConfiguration();
    if (isMemoryEnabled()) validateEmbeddingConfiguration();
    this.app = express();
    // Trust loopback proxy (Cloudflare tunnel arrives from 127.0.0.1).
    // This makes Express use X-Forwarded-For for req.ip so rate limiting
    // and logging see real client IPs instead of the tunnel address.
    this.app.set('trust proxy', 'loopback');
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: getAllowedOrigins(),
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
    this.app.use(requestContextMiddleware);
    this.app.use(
      morgan('combined', {
        stream: {
          write: (message) => logger.info(message.trim()),
        },
      })
    );

    this.app.use(compression());

    // The Stripe webhook route needs the UNPARSED raw body for signature
    // verification (it has its own express.raw()). The global JSON parser would
    // otherwise consume the stream first → "payload provided as parsed object" →
    // every webhook 400s. Skip body parsing for that one path.
    const stripeWebhookPath = `/api/${config.server.apiVersion}/payments/webhook/stripe`;
    const skipWebhook =
      (parser: express.RequestHandler): express.RequestHandler =>
      (req, res, next) =>
        req.path === stripeWebhookPath ? next() : parser(req, res, next);
    this.app.use(skipWebhook(express.json({ limit: '10mb' })));
    this.app.use(skipWebhook(express.urlencoded({ extended: true, limit: '10mb' })));
    this.app.use(cookieParser());

    this.app.use(securityMiddleware);

    // Only rate-limit the API. Applying this globally also throttled static
    // asset + SPA serving (each page load fires dozens of chunk/image/favicon
    // requests), so a few reloads from one IP — and households share a NAT IP —
    // exhausted the budget and 429'd everything, including GET / and favicon.ico.
    this.app.use('/api', rateLimiters.general);
    this.app.use(sanitizeInput);
    this.app.use(logSuspiciousActivity);

    // Public assets only. Message attachments are private and deliberately live
    // outside this tree (backend/storage/), reachable solely through the
    // authenticated, membership-checked GET /api/v1/messages/attachments/:id.
    // Files uploaded before that change still sit in uploads/messages, so that
    // subtree is explicitly refused here rather than left readable by URL.
    this.app.use('/uploads/messages', (_req, res) => {
      res.status(404).json({ success: false, error: 'Not found' });
    });
    this.app.use('/uploads', express.static('uploads'));
  }

  private initializeRoutes(): void {
    this.app.get('/health', async (req, res) => {
      const health: Record<string, any> = {
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        environment: config.server.nodeEnv,
        jobs: getJobMetrics(),
      };

      try {
        await AppDataSource.query('SELECT 1');
        health.database = 'ok';
      } catch {
        health.database = 'error';
        health.success = false;
      }

      res.status(health.success ? 200 : 503).json(health);
    });

    this.app.use(`/api/${config.server.apiVersion}/auth`, authRoutes);
    this.app.use(`/api/${config.server.apiVersion}/users`, userRoutes);
    this.app.use(`/api/${config.server.apiVersion}/providers`, providerRoutes);
    this.app.use(`/api/${config.server.apiVersion}/bookings`, bookingRoutes);
    // Mounted at the API root: it owns both /bookings/:id/readiness-runs and
    // /readiness-runs/:runId, so it cannot sit under a single resource prefix.
    this.app.use(`/api/${config.server.apiVersion}`, readinessRoutes);
    this.app.use(`/api/${config.server.apiVersion}/quotes`, quoteRoutes);
    this.app.use(`/api/${config.server.apiVersion}/messages`, messageRoutes);
    this.app.use(`/api/${config.server.apiVersion}/notifications`, notificationRoutes);
    // this.app.use(`/api/${config.server.apiVersion}/browser`, browserRoutes);
    this.app.use(`/api/${config.server.apiVersion}/payments`, paymentRoutes);
    this.app.use(`/api/${config.server.apiVersion}/reviews`, reviewRoutes);
    this.app.use(`/api/${config.server.apiVersion}/locations`, locationRoutes);
    this.app.use(`/api/${config.server.apiVersion}/agentic-assistant`, agenticAssistantRoutes);
    this.app.use(`/api/${config.server.apiVersion}/memory`, memoryRoutes);
    this.app.use(`/api/${config.server.apiVersion}/voice`, voiceRoutes);
    this.app.use(`/api/${config.server.apiVersion}/config`, configRoutes);
    this.app.use(`/api/${config.server.apiVersion}/openapi.json`, openApiRoutes);
    this.app.use(`/api/${config.server.apiVersion}/admin`, adminRoutes);

    if (process.env.NODE_ENV === 'production') {
      // Serve React build; __dirname is dist/ so ../../frontend/build reaches the repo root
      const buildDir = path.join(__dirname, '../../frontend/build');
      this.app.use(express.static(buildDir));
      this.app.get('*', (_req, res) => res.sendFile(path.join(buildDir, 'index.html')));
    } else {
      this.app.all('*', (_req, res) => {
        res.status(404).json({ success: false, error: 'Route not found' });
      });
    }
  }

  private initializeErrorHandling(): void {
    if (process.env.SENTRY_DSN) {
      Sentry.setupExpressErrorHandler(this.app);
    }

    this.app.use(
      (error: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
        logger.error('Unhandled error:', {
          error: error.message,
          stack: error.stack,
          url: req.url,
          method: req.method,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          requestId: res.getHeader('x-request-id'),
        });

        const isDevelopment = config.server.nodeEnv === 'development';

        res.status(error.status || 500).json({
          success: false,
          error: error.message || 'Internal server error',
          requestId: res.getHeader('x-request-id'),
          ...(isDevelopment && { stack: error.stack }),
        });
      }
    );

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
      // The handshake is a bearer credential like any other, so resolveSocketUser
      // demands an access token — a refresh token must not authenticate a socket.
      const user = resolveSocketUser(socket.handshake.auth?.token);
      if (!user) {
        return next(new Error('Authentication error: invalid token'));
      }
      socket.data.userId = user.userId;
      next();
    });

    this.io.on('connection', (socket) => {
      const userId = socket.data.userId; // From JWT token
      socket.join(`user_${userId}`); // Join personal room for direct messages
      logger.info(`User connected: ${socket.id}, userId: ${userId}`);

      // Handle user connection for messaging
      if (userId) {
        messageService.handleUserConnection(userId, socket.id);
      }

      // Join conversation room
      socket.on('conversation:join', async ({ conversationId }) => {
        try {
          await messageService.joinConversation(userId, conversationId, socket.id);
        } catch (error) {
          socket.emit('error', { message: 'Failed to join conversation' });
        }
      });

      // Leave conversation room
      socket.on('conversation:leave', ({ conversationId }) => {
        messageService.leaveConversation(conversationId, socket.id);
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
    notificationService.setSocketServer(this.io);
  }

  public listen(): void {
    this.server.listen(config.server.port, () => {
      logger.info(`Server running on port ${config.server.port} in ${config.server.nodeEnv} mode`);
    });
  }
}

export default App;
