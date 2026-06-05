import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate, requireCustomerRole, requireProviderRole } from '@/middleware/auth';
import { handleValidationErrors } from '@/middleware/validation';
import quoteController from '@/controllers/QuoteController';

const router = Router();

// Test endpoint
router.get('/test', (req, res) => {
  res.json({ message: 'Quote routes working!' });
});

// =====================
// QUOTE REQUEST ROUTES
// =====================

// Create quote request (customers only)
router.post(
  '/requests',
  authenticate,
  requireCustomerRole,
  [
    body('serviceType').notEmpty().withMessage('Service type is required'),
    body('description').notEmpty().withMessage('Description is required'),
    body('location.latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
    body('location.longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required'),
    body('location.address').optional().isString(),
    body('location.city').notEmpty().withMessage('City is required'),
    body('location.state').optional().isString(),
    body('location.zipCode').optional().isString(),
    body('preferredDate').optional().isISO8601().withMessage('Valid preferred date required (ISO 8601 format)'),
    body('budget.min').optional().isFloat({ min: 0 }).withMessage('Budget minimum must be positive'),
    body('budget.max').optional().isFloat({ min: 0 }).withMessage('Budget maximum must be positive'),
    body('budget.currency').optional().isString().withMessage('Budget currency must be a string'),
    body('images').optional().isArray().withMessage('Images must be an array'),
    body('urgency').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid urgency level'),
    body('requirements').optional().isArray().withMessage('Requirements must be an array'),
    body('availability').optional().isArray().withMessage('Availability must be an array'),
    body('searchRadius').optional().isFloat({ min: 1, max: 100 }).withMessage('Search radius must be between 1 and 100 km'),
    body('expiresAt').optional().isISO8601().withMessage('Valid expiration date required (ISO 8601 format)'),
    handleValidationErrors,
  ],
  quoteController.createQuoteRequest
);

// Get all quote requests (filtered by user role)
router.get(
  '/requests',
  authenticate,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('serviceType').optional().isString().withMessage('Service type must be a string'),
    query('status').optional().isIn(['open', 'closed', 'cancelled']).withMessage('Invalid status'),
    query('urgency').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid urgency level'),
    query('minBudget').optional().isFloat({ min: 0 }).withMessage('Minimum budget must be positive'),
    query('maxBudget').optional().isFloat({ min: 0 }).withMessage('Maximum budget must be positive'),
    query('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
    query('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required'),
    query('radius').optional().isFloat({ min: 1, max: 100 }).withMessage('Radius must be between 1 and 100 km'),
    query('sortBy').optional().isIn(['date', 'budget', 'urgency', 'created']).withMessage('Invalid sort field'),
    query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
    handleValidationErrors,
  ],
  quoteController.searchQuoteRequests
);

// Get specific quote request by ID
router.get(
  '/requests/:requestId',
  authenticate,
  [
    param('requestId').isUUID().withMessage('Valid request ID required'),
    handleValidationErrors,
  ],
  quoteController.getQuoteRequest
);

// Update quote request (customers only)
router.put(
  '/requests/:requestId',
  authenticate,
  requireCustomerRole,
  [
    param('requestId').isUUID().withMessage('Valid request ID required'),
    body('serviceType').optional().notEmpty().withMessage('Service type cannot be empty'),
    body('description').optional().notEmpty().withMessage('Description cannot be empty'),
    body('location.latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
    body('location.longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required'),
    body('location.address').optional().notEmpty().withMessage('Address cannot be empty'),
    body('location.city').optional().notEmpty().withMessage('City cannot be empty'),
    body('location.state').optional().notEmpty().withMessage('State cannot be empty'),
    body('location.zipCode').optional().notEmpty().withMessage('Zip code cannot be empty'),
    body('preferredDate').optional().isISO8601().withMessage('Valid preferred date required (ISO 8601 format)'),
    body('budget.min').optional().isFloat({ min: 0 }).withMessage('Budget minimum must be positive'),
    body('budget.max').optional().isFloat({ min: 0 }).withMessage('Budget maximum must be positive'),
    body('budget.currency').optional().isString().withMessage('Budget currency must be a string'),
    body('images').optional().isArray().withMessage('Images must be an array'),
    body('urgency').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid urgency level'),
    body('requirements').optional().isArray().withMessage('Requirements must be an array'),
    body('availability').optional().isArray().withMessage('Availability must be an array'),
    body('searchRadius').optional().isFloat({ min: 1, max: 100 }).withMessage('Search radius must be between 1 and 100 km'),
    body('expiresAt').optional().isISO8601().withMessage('Valid expiration date required (ISO 8601 format)'),
    handleValidationErrors,
  ],
  quoteController.updateQuoteRequest
);

// Close quote request (customers only)
router.post(
  '/requests/:requestId/close',
  authenticate,
  requireCustomerRole,
  [
    param('requestId').isUUID().withMessage('Valid request ID required'),
    body('reason').optional().isString().withMessage('Reason must be a string'),
    handleValidationErrors,
  ],
  quoteController.closeQuoteRequest
);

// Get quotes for a specific request
router.get(
  '/requests/:requestId/quotes',
  authenticate,
  [
    param('requestId').isUUID().withMessage('Valid request ID required'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('sortBy').optional().isIn(['price', 'date', 'created']).withMessage('Invalid sort field'),
    query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
    handleValidationErrors,
  ],
  quoteController.getQuotesForRequest
);

// =============
// QUOTE ROUTES
// =============

// Create quote (providers only)
router.post(
  '/',
  authenticate,
  requireProviderRole,
  [
    body('requestId').isUUID().withMessage('Valid request ID required'),
    body('serviceType').notEmpty().withMessage('Service type is required'),
    body('description').notEmpty().withMessage('Description is required'),
    body('estimatedPrice').isFloat({ min: 0 }).withMessage('Estimated price must be positive'),
    body('estimatedDuration').isInt({ min: 15, max: 480 }).withMessage('Duration must be between 15 and 480 minutes'),
    body('validUntil').isISO8601().withMessage('Valid until date required (ISO 8601 format)'),
    body('breakdown.labor').optional().isFloat({ min: 0 }).withMessage('Labor cost must be positive'),
    body('breakdown.materials').optional().isFloat({ min: 0 }).withMessage('Materials cost must be positive'),
    body('breakdown.equipment').optional().isFloat({ min: 0 }).withMessage('Equipment cost must be positive'),
    body('breakdown.other').optional().isFloat({ min: 0 }).withMessage('Other cost must be positive'),
    body('breakdown.tax').optional().isFloat({ min: 0 }).withMessage('Tax must be positive'),
    body('terms').optional().isArray().withMessage('Terms must be an array'),
    body('notes').optional().isString().withMessage('Notes must be a string'),
    body('attachments').optional().isArray().withMessage('Attachments must be an array'),
    handleValidationErrors,
  ],
  quoteController.createQuote
);

// Get all quotes (filtered by user role)
router.get(
  '/',
  authenticate,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('requestId').optional().isUUID().withMessage('Valid request ID required'),
    query('status').optional().isIn(['pending', 'accepted', 'rejected', 'expired', 'withdrawn']).withMessage('Invalid status'),
    query('serviceType').optional().isString().withMessage('Service type must be a string'),
    query('minPrice').optional().isFloat({ min: 0 }).withMessage('Minimum price must be positive'),
    query('maxPrice').optional().isFloat({ min: 0 }).withMessage('Maximum price must be positive'),
    query('sortBy').optional().isIn(['price', 'date', 'created']).withMessage('Invalid sort field'),
    query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
    handleValidationErrors,
  ],
  quoteController.searchQuotes
);

// Get specific quote by ID
router.get(
  '/:quoteId',
  authenticate,
  [
    param('quoteId').isUUID().withMessage('Valid quote ID required'),
    handleValidationErrors,
  ],
  quoteController.getQuote
);

// Update quote (providers only, limited statuses)
router.put(
  '/:quoteId',
  authenticate,
  requireProviderRole,
  [
    param('quoteId').isUUID().withMessage('Valid quote ID required'),
    body('serviceType').optional().notEmpty().withMessage('Service type cannot be empty'),
    body('description').optional().notEmpty().withMessage('Description cannot be empty'),
    body('estimatedPrice').optional().isFloat({ min: 0 }).withMessage('Estimated price must be positive'),
    body('estimatedDuration').optional().isInt({ min: 15, max: 480 }).withMessage('Duration must be between 15 and 480 minutes'),
    body('validUntil').optional().isISO8601().withMessage('Valid until date required (ISO 8601 format)'),
    body('breakdown.labor').optional().isFloat({ min: 0 }).withMessage('Labor cost must be positive'),
    body('breakdown.materials').optional().isFloat({ min: 0 }).withMessage('Materials cost must be positive'),
    body('breakdown.equipment').optional().isFloat({ min: 0 }).withMessage('Equipment cost must be positive'),
    body('breakdown.other').optional().isFloat({ min: 0 }).withMessage('Other cost must be positive'),
    body('breakdown.tax').optional().isFloat({ min: 0 }).withMessage('Tax must be positive'),
    body('terms').optional().isArray().withMessage('Terms must be an array'),
    body('notes').optional().isString().withMessage('Notes must be a string'),
    body('attachments').optional().isArray().withMessage('Attachments must be an array'),
    handleValidationErrors,
  ],
  quoteController.updateQuote
);

// Update quote status (customers can accept/reject, providers can withdraw)
router.put(
  '/:quoteId/status',
  authenticate,
  [
    param('quoteId').isUUID().withMessage('Valid quote ID required'),
    body('status').isIn(['accepted', 'rejected', 'withdrawn']).withMessage('Invalid status'),
    body('reason').optional().isString().withMessage('Reason must be a string'),
    handleValidationErrors,
  ],
  quoteController.updateQuoteStatus
);

// Withdraw quote (providers only)
router.delete(
  '/:quoteId',
  authenticate,
  requireProviderRole,
  [
    param('quoteId').isUUID().withMessage('Valid quote ID required'),
    handleValidationErrors,
  ],
  quoteController.withdrawQuote
);

export default router;