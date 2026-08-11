import { Router } from 'express';
import { param } from 'express-validator';
import { authenticate } from '@/middleware/auth';
import { handleValidationErrors } from '@/middleware/validation';
import readinessController from '@/controllers/ReadinessController';

/**
 * Booking Readiness Copilot — read-only.
 *
 * There is deliberately no endpoint here that mutates a booking, sends a
 * message, or changes a quote. Suggested actions (BR-3) will return drafts that
 * the user submits through the existing messaging API.
 */
const router = Router();

router.post(
  '/bookings/:bookingId/readiness-runs',
  authenticate,
  [param('bookingId').isUUID().withMessage('Valid booking ID required')],
  handleValidationErrors,
  readinessController.createRun
);

router.get(
  '/bookings/:bookingId/readiness-runs/latest',
  authenticate,
  [param('bookingId').isUUID().withMessage('Valid booking ID required')],
  handleValidationErrors,
  readinessController.getLatest
);

router.get(
  '/readiness-runs/:runId',
  authenticate,
  [param('runId').isUUID().withMessage('Valid run ID required')],
  handleValidationErrors,
  readinessController.getById
);

export default router;
