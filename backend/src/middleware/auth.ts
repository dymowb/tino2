import { Request, Response, NextFunction } from 'express';
import { jwtService } from '@/utils/jwt';
import { redisClient } from '@/config/redis';
import logger from '@/config/logger';
import { AuthenticatedRequest } from '@/types';
import { AppDataSource } from '@/config/database';
import { User } from '@/models/User';

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractTokenFromRequest(req);

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Access token required',
      });
      return;
    }

    if (process.env.REDIS_ENABLED === 'true') {
      const isBlacklisted = await redisClient.exists(`blacklist:${token}`);
      if (isBlacklisted) {
        res.status(401).json({
          success: false,
          error: 'Token has been revoked',
        });
        return;
      }
    }

    const payload = jwtService.verifyToken(token);
    if (!payload) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
      return;
    }

    req.user = payload;
    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: payload.userId } });

    if (!user) {
      res.status(401).json({ success: false, error: 'User not found' });
      return;
    }

    // Lazy reactivation: suspension expired?
    if (!user.isActive && user.suspendedUntil && new Date() > user.suspendedUntil) {
      user.isActive = true;
      user.suspendedUntil = null;
      await AppDataSource.getRepository(User).save(user);
    }

    if (!user.isActive) {
      res.status(403).json({ success: false, error: 'Account is suspended' });
      return;
    }

    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(401).json({
      success: false,
      error: 'Authentication failed',
    });
  }
};

export const authorize = (allowedUserTypes: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
      return;
    }

    if (!allowedUserTypes.includes(req.user.userType)) {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
      });
      return;
    }

    next();
  };
};

export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractTokenFromRequest(req);

    if (token) {
      let isBlacklisted = false;
      if (process.env.REDIS_ENABLED === 'true') {
        isBlacklisted = await redisClient.exists(`blacklist:${token}`);
      }
      if (!isBlacklisted) {
        const payload = jwtService.verifyToken(token);
        if (payload) {
          req.user = payload;
        }
      }
    }

    next();
  } catch (error) {
    logger.error('Optional authentication error:', error);
    next();
  }
};

export const validateTokenOwnership = (req: Request, res: Response, next: NextFunction): void => {
  const { userId } = req.params;

  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'User not authenticated',
    });
    return;
  }

  if (req.user.userId !== userId) {
    res.status(403).json({
      success: false,
      error: 'Access denied: You can only access your own resources',
    });
    return;
  }

  next();
};

export const revokeToken = async (token: string): Promise<void> => {
  try {
    if (process.env.REDIS_ENABLED === 'true') {
      const payload = jwtService.decodeToken(token);
      if (payload && payload.exp) {
        const ttl = payload.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await redisClient.set(`blacklist:${token}`, '1', ttl);
        }
      }
    }
  } catch (error) {
    logger.error('Error revoking token:', error);
    throw error;
  }
};

export const extractTokenFromRequest = (req: Request): string | null => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  const cookieToken = req.cookies?.accessToken;
  if (cookieToken) {
    return cookieToken;
  }

  const queryToken = req.query.token;
  if (queryToken && typeof queryToken === 'string') {
    return queryToken;
  }

  return null;
};

export const refreshTokenMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;

    if (!refreshToken) {
      res.status(401).json({
        success: false,
        error: 'Refresh token required',
      });
      return;
    }

    if (process.env.REDIS_ENABLED === 'true') {
      const isBlacklisted = await redisClient.exists(`blacklist:${refreshToken}`);
      if (isBlacklisted) {
        res.status(401).json({
          success: false,
          error: 'Refresh token has been revoked',
        });
        return;
      }
    }

    const payload = jwtService.verifyToken(refreshToken);
    if (!payload) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token',
      });
      return;
    }

    req.user = payload;
    next();
  } catch (error) {
    logger.error('Refresh token validation error:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid refresh token',
    });
  }
};

export const requireProviderRole = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
    return;
  }

  if (req.user.userType !== 'provider') {
    res.status(403).json({
      success: false,
      error: 'Provider access required',
    });
    return;
  }

  next();
};

export const requireCustomerRole = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
    return;
  }

  if (req.user.userType !== 'customer') {
    res.status(403).json({
      success: false,
      error: 'Customer access required',
    });
    return;
  }

  next();
};

export const requireAdminRole = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
    return;
  }

  if (req.user.userType !== 'admin') {
    res.status(403).json({
      success: false,
      error: 'Admin access required',
    });
    return;
  }

  next();
};
