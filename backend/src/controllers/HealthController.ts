import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import axios from 'axios';

/**
 * Health Controller - Comprehensive system health monitoring
 *
 * Provides detailed health checks for:
 * - Application status
 * - Database connectivity
 * - Redis connectivity
 * - Third-party service status
 * - System resources and performance
 */

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  details?: any;
  responseTime?: number;
}

interface SystemHealth {
  success: boolean;
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  environment: string;
  uptime: number;
  services: {
    application: HealthStatus;
    database: HealthStatus;
    redis: HealthStatus;
    stripe: HealthStatus;
    googlemaps: HealthStatus;
    twilio: HealthStatus;
    sendgrid: HealthStatus;
  };
  performance: {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage | null;
    eventLoopLag: number;
  };
  metrics: {
    activeConnections: number;
    totalRequests: number;
    errorRate: number;
    averageResponseTime: number;
  };
}

export class HealthController {
  private static startTime = Date.now();
  private static requestCount = 0;
  private static errorCount = 0;
  private static totalResponseTime = 0;
  private static cpuStart: NodeJS.CpuUsage | null = null;

  static {
    // Initialize CPU usage tracking
    try {
      this.cpuStart = process.cpuUsage();
    } catch (error) {
      // CPU usage tracking not available in this environment
    }
  }

  /**
   * Basic health check endpoint
   */
  static basicHealth = async (req: Request, res: Response): Promise<void> => {
    try {
      const health = {
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
      };

      res.status(200).json(health);
    } catch (error) {
      res.status(503).json({
        success: false,
        message: 'Server health check failed',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * Comprehensive health check with detailed service status
   */
  static detailedHealth = async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();

    try {
      const health: SystemHealth = {
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: Math.floor((Date.now() - HealthController.startTime) / 1000),
        services: {
          application: await HealthController.checkApplicationHealth(),
          database: await HealthController.checkDatabaseHealth(),
          redis: await HealthController.checkRedisHealth(),
          stripe: await HealthController.checkStripeHealth(),
          googlemaps: await HealthController.checkGoogleMapsHealth(),
          twilio: await HealthController.checkTwilioHealth(),
          sendgrid: await HealthController.checkSendGridHealth(),
        },
        performance: {
          memoryUsage: process.memoryUsage(),
          cpuUsage: HealthController.cpuStart ? process.cpuUsage(HealthController.cpuStart) : null,
          eventLoopLag: await HealthController.measureEventLoopLag(),
        },
        metrics: {
          activeConnections: 0, // Would be populated by actual connection tracking
          totalRequests: HealthController.requestCount,
          errorRate:
            HealthController.requestCount > 0
              ? (HealthController.errorCount / HealthController.requestCount) * 100
              : 0,
          averageResponseTime:
            HealthController.requestCount > 0
              ? HealthController.totalResponseTime / HealthController.requestCount
              : 0,
        },
      };

      // Determine overall health status
      const serviceStatuses = Object.values(health.services);
      const unhealthyServices = serviceStatuses.filter((service) => service.status === 'unhealthy');
      const degradedServices = serviceStatuses.filter((service) => service.status === 'degraded');

      if (unhealthyServices.length > 0) {
        health.status = 'unhealthy';
        health.success = false;
      } else if (degradedServices.length > 0) {
        health.status = 'degraded';
      }

      const responseTime = Date.now() - startTime;
      HealthController.updateMetrics(responseTime, health.success);

      const statusCode =
        health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error) {
      const responseTime = Date.now() - startTime;
      HealthController.updateMetrics(responseTime, false);

      res.status(503).json({
        success: false,
        status: 'unhealthy',
        message: 'Health check failed',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * Readiness probe for Kubernetes/container orchestration
   */
  static readiness = async (req: Request, res: Response): Promise<void> => {
    try {
      // Check critical services required for the application to serve requests
      const criticalChecks = await Promise.all([
        HealthController.checkDatabaseHealth(),
        HealthController.checkRedisHealth(),
      ]);

      const failedChecks = criticalChecks.filter((check) => check.status === 'unhealthy');

      if (failedChecks.length > 0) {
        res.status(503).json({
          success: false,
          ready: false,
          message: 'Application not ready',
          timestamp: new Date().toISOString(),
          failedChecks: failedChecks.length,
        });
        return;
      }

      res.status(200).json({
        success: true,
        ready: true,
        message: 'Application ready',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(503).json({
        success: false,
        ready: false,
        message: 'Readiness check failed',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * Liveness probe for Kubernetes/container orchestration
   */
  static liveness = async (req: Request, res: Response): Promise<void> => {
    try {
      // Basic application liveness check
      const memoryUsage = process.memoryUsage();
      const uptime = process.uptime();

      // Check if memory usage is within reasonable limits (< 1GB)
      const memoryLimitMB = 1024;
      const currentMemoryMB = memoryUsage.heapUsed / 1024 / 1024;

      if (currentMemoryMB > memoryLimitMB) {
        res.status(503).json({
          success: false,
          alive: false,
          message: 'Memory usage exceeded limits',
          timestamp: new Date().toISOString(),
          memoryUsageMB: currentMemoryMB,
          memoryLimitMB,
        });
        return;
      }

      res.status(200).json({
        success: true,
        alive: true,
        message: 'Application alive',
        timestamp: new Date().toISOString(),
        uptime,
        memoryUsageMB: currentMemoryMB,
      });
    } catch (error) {
      res.status(503).json({
        success: false,
        alive: false,
        message: 'Liveness check failed',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * Database connectivity health check
   */
  private static async checkDatabaseHealth(): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      if (!AppDataSource.isInitialized) {
        return {
          status: 'unhealthy',
          message: 'Database not initialized',
          responseTime: Date.now() - startTime,
        };
      }

      // Perform a simple query to test connectivity
      await AppDataSource.query('SELECT 1');

      const responseTime = Date.now() - startTime;

      return {
        status: responseTime < 100 ? 'healthy' : 'degraded',
        message: 'Database connection successful',
        responseTime,
        details: {
          isInitialized: AppDataSource.isInitialized,
          driver: AppDataSource.driver.constructor.name,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Database connection failed',
        responseTime: Date.now() - startTime,
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Redis connectivity health check
   */
  private static async checkRedisHealth(): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createClient } = require('redis');
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      const client = createClient({ url: redisUrl });

      await client.connect();
      await client.ping();
      await client.disconnect();

      const responseTime = Date.now() - startTime;

      return {
        status: responseTime < 50 ? 'healthy' : 'degraded',
        message: 'Redis connection successful',
        responseTime,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Redis connection failed',
        responseTime: Date.now() - startTime,
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Application health check
   */
  private static async checkApplicationHealth(): Promise<HealthStatus> {
    try {
      const memoryUsage = process.memoryUsage();
      const uptime = process.uptime();

      // Check memory usage (warn if > 512MB, unhealthy if > 1GB)
      const memoryMB = memoryUsage.heapUsed / 1024 / 1024;

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      let message = 'Application running normally';

      if (memoryMB > 1024) {
        status = 'unhealthy';
        message = 'High memory usage detected';
      } else if (memoryMB > 512) {
        status = 'degraded';
        message = 'Elevated memory usage';
      }

      return {
        status,
        message,
        details: {
          uptime,
          memoryUsageMB: memoryMB,
          nodeVersion: process.version,
          platform: process.platform,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Application health check failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Stripe service health check
   */
  private static async checkStripeHealth(): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      if (!process.env.STRIPE_SECRET_KEY) {
        return {
          status: 'degraded',
          message: 'Stripe not configured',
          responseTime: Date.now() - startTime,
        };
      }

      // Check Stripe API availability with a simple request
      const response = await axios.get('https://api.stripe.com/v1/account', {
        headers: {
          Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        },
        timeout: 5000,
      });

      const responseTime = Date.now() - startTime;

      return {
        status: response.status === 200 ? 'healthy' : 'degraded',
        message: 'Stripe API accessible',
        responseTime,
        details: {
          statusCode: response.status,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Stripe API check failed',
        responseTime: Date.now() - startTime,
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Google Maps service health check
   */
  private static async checkGoogleMapsHealth(): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      if (!process.env.GOOGLE_MAPS_API_KEY) {
        return {
          status: 'degraded',
          message: 'Google Maps not configured',
          responseTime: Date.now() - startTime,
        };
      }

      // Check Google Maps Geocoding API
      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
          address: 'Seattle, WA',
          key: process.env.GOOGLE_MAPS_API_KEY,
        },
        timeout: 5000,
      });

      const responseTime = Date.now() - startTime;

      return {
        status: response.data.status === 'OK' ? 'healthy' : 'degraded',
        message: 'Google Maps API accessible',
        responseTime,
        details: {
          status: response.data.status,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Google Maps API check failed',
        responseTime: Date.now() - startTime,
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Twilio service health check
   */
  private static async checkTwilioHealth(): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
        return {
          status: 'degraded',
          message: 'Twilio not configured',
          responseTime: Date.now() - startTime,
        };
      }

      // Check Twilio API status
      const authString = Buffer.from(
        `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
      ).toString('base64');

      const response = await axios.get(
        `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}.json`,
        {
          headers: {
            Authorization: `Basic ${authString}`,
          },
          timeout: 5000,
        }
      );

      const responseTime = Date.now() - startTime;

      return {
        status: response.status === 200 ? 'healthy' : 'degraded',
        message: 'Twilio API accessible',
        responseTime,
        details: {
          statusCode: response.status,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Twilio API check failed',
        responseTime: Date.now() - startTime,
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * SendGrid service health check
   */
  private static async checkSendGridHealth(): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      if (!process.env.SENDGRID_API_KEY) {
        return {
          status: 'degraded',
          message: 'SendGrid not configured',
          responseTime: Date.now() - startTime,
        };
      }

      // Check SendGrid API status
      const response = await axios.get('https://api.sendgrid.com/v3/user/account', {
        headers: {
          Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        },
        timeout: 5000,
      });

      const responseTime = Date.now() - startTime;

      return {
        status: response.status === 200 ? 'healthy' : 'degraded',
        message: 'SendGrid API accessible',
        responseTime,
        details: {
          statusCode: response.status,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'SendGrid API check failed',
        responseTime: Date.now() - startTime,
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Measure event loop lag
   */
  private static async measureEventLoopLag(): Promise<number> {
    return new Promise((resolve) => {
      const start = process.hrtime.bigint();
      setImmediate(() => {
        const lag = Number(process.hrtime.bigint() - start) / 1e6; // Convert to milliseconds
        resolve(lag);
      });
    });
  }

  /**
   * Update performance metrics
   */
  private static updateMetrics(responseTime: number, success: boolean): void {
    HealthController.requestCount++;
    HealthController.totalResponseTime += responseTime;

    if (!success) {
      HealthController.errorCount++;
    }
  }

  /**
   * Reset metrics (useful for testing or scheduled resets)
   */
  static resetMetrics(): void {
    HealthController.requestCount = 0;
    HealthController.errorCount = 0;
    HealthController.totalResponseTime = 0;
    HealthController.startTime = Date.now();
  }
}
