import { Router } from 'express';
import { param } from 'express-validator';
import { authenticate } from '@/middleware/auth';
import { rateLimiters } from '@/middleware/security';
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

// Creation is the only expensive verb here. Reads stay on the general limiter so
// viewing an existing plan is never rationed alongside generating one.
router.post(
  '/bookings/:bookingId/readiness-runs',
  authenticate,
  rateLimiters.agentRun,
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

// Returns draft text. It creates no conversation, stores no message and sends
// nothing — the user carries the draft to the existing composer and sends it
// themselves. Rate-limited like a run: it is a model call.
router.post(
  '/readiness-runs/:runId/findings/:findingId/draft',
  authenticate,
  // Its own bucket: sharing the run limiter meant drafting could exhaust a
  // user's ability to generate a plan, and vice versa.
  rateLimiters.agentDraft,
  [
    param('runId').isUUID().withMessage('Valid run ID required'),
    param('findingId').isUUID().withMessage('Valid finding ID required'),
  ],
  handleValidationErrors,
  readinessController.draftMessageForFinding
);

router.get(
  '/readiness-runs/:runId',
  authenticate,
  [param('runId').isUUID().withMessage('Valid run ID required')],
  handleValidationErrors,
  readinessController.getById
);

export default router;
