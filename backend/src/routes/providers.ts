import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate, requireProviderRole, requireAdminRole } from '@/middleware/auth';
import { handleValidationErrors } from '@/middleware/validation';
import providerController from '@/controllers/ProviderController';

const router = Router();

// Test endpoint
router.get('/test', (req, res) => {
  res.json({ message: 'Provider routes working!' });
});

// Get all distinct service types from active providers (public endpoint)
router.get('/services/catalog', providerController.getServiceCatalog);

// Search providers (public endpoint)
router.get(
  '/',
  [
    query('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
    query('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required'),
    query('radius').optional().isFloat({ min: 0.1, max: 100 }).withMessage('Radius must be between 0.1 and 100 km'),
    query('services').optional().isString().withMessage('Services must be a string'),
    query('minRating').optional().isFloat({ min: 0, max: 5 }).withMessage('Rating must be between 0 and 5'),
    query('isInsured').optional().isBoolean().withMessage('Insurance status must be boolean'),
    query('isBackgroundChecked').optional().isBoolean().withMessage('Background check status must be boolean'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('sortBy').optional().isIn(['distance', 'rating', 'price']).withMessage('Invalid sort option'),
    handleValidationErrors,
  ],
  providerController.searchProviders
);

// Get authenticated provider's own profile (must be before /:providerId)
router.get(
  '/my',
  authenticate,
  requireProviderRole,
  providerController.getMyProvider
);

// Get authenticated provider's profile (alternative path)
router.get(
  '/my/profile',
  authenticate,
  requireProviderRole,
  providerController.getMyProvider
);

// Get authenticated provider's dashboard statistics
router.get(
  '/my/dashboard-stats',
  authenticate,
  requireProviderRole,
  [
    query('period').optional().isIn(['week', 'month', 'year']).withMessage('Period must be week, month, or year'),
    handleValidationErrors,
  ],
  providerController.getDashboardStats
);

// Get specific provider by ID (public endpoint) - MUST BE AFTER /my routes
router.get(
  '/:providerId',
  [
    param('providerId').isUUID().withMessage('Valid provider ID required'),
    handleValidationErrors,
  ],
  providerController.getProvider
);

// Create provider profile (authenticated providers only)
router.post(
  '/',
  authenticate,
  requireProviderRole,
  [
    body('businessName').notEmpty().withMessage('Business name is required'),
    body('description').notEmpty().withMessage('Description is required'),
    body('services').isArray({ min: 1 }).withMessage('At least one service is required'),
    body('services.*').isString().withMessage('Each service must be a string'),
    body('location.latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
    body('location.longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required'),
    body('location.address').notEmpty().withMessage('Address is required'),
    body('location.city').notEmpty().withMessage('City is required'),
    body('location.state').notEmpty().withMessage('State is required'),
    body('location.zipCode').notEmpty().withMessage('Zip code is required'),
    body('location.country').notEmpty().withMessage('Country is required'),
    body('serviceRadius').optional().isFloat({ min: 1, max: 100 }).withMessage('Service radius must be between 1 and 100 km'),
    body('availableHours').isObject().withMessage('Available hours object is required'),
    body('availableHours.monday.available').isBoolean().withMessage('Monday availability must be boolean'),
    body('availableHours.tuesday.available').isBoolean().withMessage('Tuesday availability must be boolean'),
    body('availableHours.wednesday.available').isBoolean().withMessage('Wednesday availability must be boolean'),
    body('availableHours.thursday.available').isBoolean().withMessage('Thursday availability must be boolean'),
    body('availableHours.friday.available').isBoolean().withMessage('Friday availability must be boolean'),
    body('availableHours.saturday.available').isBoolean().withMessage('Saturday availability must be boolean'),
    body('availableHours.sunday.available').isBoolean().withMessage('Sunday availability must be boolean'),
    body('pricing.baseRate').optional().isFloat({ min: 0 }).withMessage('Base rate must be non-negative'),
    body('pricing.currency').optional().isString().withMessage('Currency must be a string'),
    body('pricing.rateType').optional().isIn(['hourly', 'fixed', 'quote']).withMessage('Invalid rate type'),
    handleValidationErrors,
  ],
  providerController.createProvider
);

// Update provider profile (authenticated providers only)
router.put(
  '/:providerId',
  authenticate,
  requireProviderRole,
  [
    param('providerId').isUUID().withMessage('Valid provider ID required'),
    body('businessName').optional().notEmpty().withMessage('Business name cannot be empty'),
    body('description').optional().notEmpty().withMessage('Description cannot be empty'),
    body('services').optional().isArray({ min: 1 }).withMessage('At least one service is required'),
    body('services.*').optional().isString().withMessage('Each service must be a string'),
    body('location.latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
    body('location.longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required'),
    body('location.address').optional().notEmpty().withMessage('Address cannot be empty'),
    body('location.city').optional().notEmpty().withMessage('City cannot be empty'),
    body('location.state').optional().notEmpty().withMessage('State cannot be empty'),
    body('location.zipCode').optional().notEmpty().withMessage('Zip code cannot be empty'),
    body('location.country').optional().notEmpty().withMessage('Country cannot be empty'),
    body('serviceRadius').optional().isFloat({ min: 1, max: 100 }).withMessage('Service radius must be between 1 and 100 km'),
    body('pricing.baseRate').optional().isFloat({ min: 0 }).withMessage('Base rate must be non-negative'),
    body('pricing.currency').optional().isString().withMessage('Currency must be a string'),
    body('pricing.rateType').optional().isIn(['hourly', 'fixed', 'quote']).withMessage('Invalid rate type'),
    handleValidationErrors,
  ],
  providerController.updateProvider
);

// Delete/deactivate provider profile (authenticated providers only)
router.delete(
  '/:providerId',
  authenticate,
  requireProviderRole,
  [
    param('providerId').isUUID().withMessage('Valid provider ID required'),
    handleValidationErrors,
  ],
  providerController.deleteProvider
);

// Upload portfolio images (authenticated providers only)
router.post(
  '/:providerId/portfolio',
  authenticate,
  requireProviderRole,
  [
    param('providerId').isUUID().withMessage('Valid provider ID required'),
    body('imageUrls').isArray({ min: 1 }).withMessage('At least one image URL is required'),
    body('imageUrls.*').isURL().withMessage('Each image URL must be valid'),
    handleValidationErrors,
  ],
  providerController.uploadPortfolio
);

// Verify provider (admin only)
router.post(
  '/:providerId/verify',
  authenticate,
  requireAdminRole,
  [
    param('providerId').isUUID().withMessage('Valid provider ID required'),
    body('isVerified').isBoolean().withMessage('Verification status must be boolean'),
    handleValidationErrors,
  ],
  providerController.verifyProvider
);

export default router;