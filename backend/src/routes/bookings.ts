import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate, requireCustomerRole, requireProviderRole } from '@/middleware/auth';
import { handleValidationErrors } from '@/middleware/validation';
import bookingController from '@/controllers/BookingController';

const router = Router();

// Test endpoint
router.get('/test', (req, res) => {
  res.json({ message: 'Booking routes working!' });
});

// Create booking (customers only)
router.post(
  '/',
  authenticate,
  requireCustomerRole,
  [
    body('providerId').isUUID().withMessage('Valid provider ID required'),
    body('serviceType').notEmpty().withMessage('Service type is required'),
    body('description').notEmpty().withMessage('Description is required'),
    body('location.latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
    body('location.longitude')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Valid longitude required'),
    body('location.address').notEmpty().withMessage('Address is required'),
    body('scheduledDate')
      .isISO8601()
      .withMessage('Valid scheduled date required (ISO 8601 format)'),
    body('estimatedDuration')
      .isInt({ min: 15, max: 480 })
      .withMessage('Duration must be between 15 and 480 minutes'),
    body('specialInstructions')
      .optional()
      .isString()
      .withMessage('Special instructions must be a string'),
    handleValidationErrors,
  ],
  bookingController.createBooking
);

// Get all bookings (filtered by user role)
router.get(
  '/',
  authenticate,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('status')
      .optional()
      .isIn([
        'pending',
        'confirmed',
        'in_progress',
        'pending_completion',
        'completed',
        'cancelled',
        'in_dispute',
      ])
      .withMessage('Invalid status'),
    query('serviceType').optional().isString().withMessage('Service type must be a string'),
    query('dateFrom').optional().isISO8601().withMessage('Date from must be valid ISO 8601 date'),
    query('dateTo').optional().isISO8601().withMessage('Date to must be valid ISO 8601 date'),
    query('sortBy')
      .optional()
      .isIn(['date', 'status', 'created'])
      .withMessage('Invalid sort field'),
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Sort order must be asc or desc'),
    handleValidationErrors,
  ],
  bookingController.searchBookings
);

// Get specific booking by ID
router.get(
  '/:bookingId',
  authenticate,
  [param('bookingId').isUUID().withMessage('Valid booking ID required'), handleValidationErrors],
  bookingController.getBooking
);

// Update booking details (customers only, limited statuses)
router.put(
  '/:bookingId',
  authenticate,
  requireCustomerRole,
  [
    param('bookingId').isUUID().withMessage('Valid booking ID required'),
    body('serviceType').optional().notEmpty().withMessage('Service type cannot be empty'),
    body('description').optional().notEmpty().withMessage('Description cannot be empty'),
    body('location.latitude')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('Valid latitude required'),
    body('location.longitude')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('Valid longitude required'),
    body('location.address').optional().notEmpty().withMessage('Address cannot be empty'),
    body('scheduledDate')
      .optional()
      .isISO8601()
      .withMessage('Valid scheduled date required (ISO 8601 format)'),
    body('estimatedDuration')
      .optional()
      .isInt({ min: 15, max: 480 })
      .withMessage('Duration must be between 15 and 480 minutes'),
    body('specialInstructions')
      .optional()
      .isString()
      .withMessage('Special instructions must be a string'),
    handleValidationErrors,
  ],
  bookingController.updateBooking
);

// Update booking status (both customers and providers with different permissions)
router.put(
  '/:bookingId/status',
  authenticate,
  [
    param('bookingId').isUUID().withMessage('Valid booking ID required'),
    // Escrow-bearing transitions (in_progress / completion / dispute) must go through the
    // dedicated endpoints (/start, /complete, /confirm-completion, /dispute) so the payment
    // hold/capture/refund stays in sync. The generic status route only does accept & cancel.
    body('status').isIn(['confirmed', 'cancelled']).withMessage('Invalid status'),
    handleValidationErrors,
  ],
  bookingController.updateBookingStatus
);

// Cancel booking (both customers and providers can cancel)
router.delete(
  '/:bookingId',
  authenticate,
  [
    param('bookingId').isUUID().withMessage('Valid booking ID required'),
    body('reason')
      .optional()
      .isString()
      .isLength({ max: 500 })
      .withMessage('Reason must be under 500 chars'),
    handleValidationErrors,
  ],
  bookingController.cancelBooking
);

// POST /:bookingId/start — provider places hold and starts service
router.post(
  '/:bookingId/start',
  authenticate,
  [param('bookingId').isUUID(), handleValidationErrors],
  bookingController.startBooking
);

// POST /:bookingId/complete — provider marks service done
router.post(
  '/:bookingId/complete',
  authenticate,
  [param('bookingId').isUUID(), handleValidationErrors],
  bookingController.markBookingComplete
);

// POST /:bookingId/confirm-completion — customer confirms, triggers capture
router.post(
  '/:bookingId/confirm-completion',
  authenticate,
  [param('bookingId').isUUID(), handleValidationErrors],
  bookingController.confirmCompletion
);

// POST /:bookingId/dispute — customer disputes completion
router.post(
  '/:bookingId/dispute',
  authenticate,
  [param('bookingId').isUUID(), handleValidationErrors],
  bookingController.disputeBooking
);

// Get bookings for a specific customer (customers can only see their own)
router.get(
  '/customer/:customerId',
  authenticate,
  [
    param('customerId').isUUID().withMessage('Valid customer ID required'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('status')
      .optional()
      .isIn([
        'pending',
        'confirmed',
        'in_progress',
        'pending_completion',
        'completed',
        'cancelled',
        'in_dispute',
      ])
      .withMessage('Invalid status'),
    query('serviceType').optional().isString().withMessage('Service type must be a string'),
    handleValidationErrors,
  ],
  bookingController.getCustomerBookings
);

// Get bookings for authenticated provider
router.get(
  '/provider/my',
  authenticate,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('status')
      .optional()
      .isIn([
        'pending',
        'confirmed',
        'in_progress',
        'pending_completion',
        'completed',
        'cancelled',
        'in_dispute',
      ])
      .withMessage('Invalid status'),
    query('serviceType').optional().isString().withMessage('Service type must be a string'),
    handleValidationErrors,
  ],
  bookingController.getMyProviderBookings
);

// Get bookings for a specific provider (providers can only see their own)
router.get(
  '/provider/:providerId',
  authenticate,
  [
    param('providerId').isUUID().withMessage('Valid provider ID required'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('status')
      .optional()
      .isIn([
        'pending',
        'confirmed',
        'in_progress',
        'pending_completion',
        'completed',
        'cancelled',
        'in_dispute',
      ])
      .withMessage('Invalid status'),
    query('serviceType').optional().isString().withMessage('Service type must be a string'),
    handleValidationErrors,
  ],
  bookingController.getProviderBookings
);

export default router;
