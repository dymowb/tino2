import { Router } from 'express';
import { HealthController } from '../controllers/HealthController';
import { rateLimiter } from '../middleware/rateLimiter';

const router = Router();

/**
 * Health Check Routes
 *
 * Provides various health check endpoints for monitoring and orchestration:
 * - Basic health check for simple monitoring
 * - Detailed health check with service status
 * - Readiness probe for container orchestration
 * - Liveness probe for container orchestration
 */

/**
 * @route   GET /health
 * @desc    Basic health check
 * @access  Public (with rate limiting)
 */
router.get('/', rateLimiter({ windowMs: 60000, max: 60 }), HealthController.basicHealth);

/**
 * @route   GET /health/detailed
 * @desc    Comprehensive health check with service status
 * @access  Public (with rate limiting)
 */
router.get('/detailed', rateLimiter({ windowMs: 60000, max: 30 }), HealthController.detailedHealth);

/**
 * @route   GET /health/ready
 * @desc    Readiness probe for Kubernetes/container orchestration
 * @access  Public (with rate limiting)
 */
router.get('/ready', rateLimiter({ windowMs: 60000, max: 120 }), HealthController.readiness);

/**
 * @route   GET /health/live
 * @desc    Liveness probe for Kubernetes/container orchestration
 * @access  Public (with rate limiting)
 */
router.get('/live', rateLimiter({ windowMs: 60000, max: 120 }), HealthController.liveness);

export default router;
