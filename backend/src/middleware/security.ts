import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import config from '@/config/environment';
import logger from '@/config/logger';

export const securityMiddleware = [
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),

  cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'https://tino2.com',
        'https://www.tino2.com',
        'https://app.tino2.com',
      ];

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key'],
  }),
];

export const rateLimiters = {
  general: rateLimit({
    windowMs: config.security.rateLimitWindowMs,
    max: config.security.rateLimitMax,
    message: {
      success: false,
      error: 'Too many requests, please try again later',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      return req.user?.userId || req.ip || 'unknown';
    },
  }),

  auth: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per window
    message: {
      success: false,
      error: 'Too many authentication attempts, please try again later',
    },
    skipSuccessfulRequests: true,
    keyGenerator: (req: Request) => {
      return `auth:${req.ip}:${req.body.email || 'unknown'}`;
    },
  }),

  passwordReset: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 password reset attempts per hour
    message: {
      success: false,
      error: 'Too many password reset attempts, please try again later',
    },
    keyGenerator: (req: Request) => {
      return `password-reset:${req.ip}:${req.body.email || 'unknown'}`;
    },
  }),

  fileUpload: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 file uploads per minute
    message: {
      success: false,
      error: 'Too many file upload attempts, please try again later',
    },
    keyGenerator: (req: Request) => {
      return req.user?.userId || req.ip || 'unknown';
    },
  }),

  messaging: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 messages per minute
    message: {
      success: false,
      error: 'Too many messages sent, please slow down',
    },
    keyGenerator: (req: Request) => {
      return req.user?.userId || req.ip || 'unknown';
    },
  }),
};

export const validateApiKey = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.headers['x-api-key'] as string;
  const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];

  if (validApiKeys.length > 0 && !validApiKeys.includes(apiKey)) {
    res.status(401).json({
      success: false,
      error: 'Invalid or missing API key',
    });
    return;
  }

  next();
};

export const sanitizeInput = (req: Request, _res: Response, next: NextFunction): void => {
  const sanitizeObject = (obj: any): any => {
    if (typeof obj !== 'object' || obj === null) return obj;

    const sanitized: any = Array.isArray(obj) ? [] : {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = value.trim();
      } else if (typeof value === 'object') {
        sanitized[key] = sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  };

  req.body = sanitizeObject(req.body);
  req.query = sanitizeObject(req.query);

  next();
};

export const logSuspiciousActivity = (req: Request, res: Response, next: NextFunction): void => {
  const suspiciousPatterns = [
    /script/i,
    /javascript/i,
    /vbscript/i,
    /onload/i,
    /onerror/i,
    /eval\(/i,
    /<script/i,
    /javascript:/i,
  ];

  const checkForSuspiciousContent = (obj: any): boolean => {
    if (typeof obj === 'string') {
      return suspiciousPatterns.some((pattern) => pattern.test(obj));
    }

    if (typeof obj === 'object' && obj !== null) {
      return Object.values(obj).some((value) => checkForSuspiciousContent(value));
    }

    return false;
  };

  const hasSuspiciousContent =
    checkForSuspiciousContent(req.body) ||
    checkForSuspiciousContent(req.query) ||
    checkForSuspiciousContent(req.params);

  if (hasSuspiciousContent) {
    logger.warn('Suspicious activity detected:', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url,
      method: req.method,
      body: req.body,
      query: req.query,
      params: req.params,
    });
  }

  next();
};

export const preventClickjacking = (_req: Request, res: Response, next: NextFunction): void => {
  res.setHeader('X-Frame-Options', 'DENY');
  next();
};

export const preventMimeSniffing = (_req: Request, res: Response, next: NextFunction): void => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
};

export const enableXSSProtection = (_req: Request, res: Response, next: NextFunction): void => {
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
};

export const httpsRedirect = (req: Request, res: Response, next: NextFunction): void => {
  if (config.server.nodeEnv === 'production' && req.header('x-forwarded-proto') !== 'https') {
    res.redirect(301, `https://${req.header('host')}${req.url}`);
    return;
  }
  next();
};
