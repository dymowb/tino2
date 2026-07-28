import rateLimit, { Options } from 'express-rate-limit';
import { Request, Response } from 'express';

export const rateLimiter = (options: Partial<Options>) =>
  rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
      res
        .status(429)
        .json({ success: false, message: 'Too many requests, please try again later.' });
    },
    ...options,
  });
