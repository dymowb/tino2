import { Router } from 'express';
import { body, param, query } from 'express-validator';
import reviewController from '../controllers/ReviewController';
import { authenticate } from '../middleware/auth';
import { handleValidationErrors } from '../middleware/validation';

const router = Router();

// Validation rules
const createReviewValidation = [
  body('bookingId').isUUID().withMessage('Booking ID must be a valid UUID'),
  body('rating').isFloat({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment')
    .optional()
    .isString()
    .isLength({ max: 2000 })
    .withMessage('Comment must be a string with maximum 2000 characters'),
  body('images')
    .optional()
    .isArray({ max: 10 })
    .withMessage('Images must be an array with maximum 10 items'),
  body('images.*').optional().isString().withMessage('Each image must be a string'),
  body('criteria').optional().isObject().withMessage('Criteria must be an object'),
  body('criteria.quality')
    .optional()
    .isFloat({ min: 1, max: 5 })
    .withMessage('Quality rating must be between 1 and 5'),
  body('criteria.timeliness')
    .optional()
    .isFloat({ min: 1, max: 5 })
    .withMessage('Timeliness rating must be between 1 and 5'),
  body('criteria.communication')
    .optional()
    .isFloat({ min: 1, max: 5 })
    .withMessage('Communication rating must be between 1 and 5'),
  body('criteria.professionalism')
    .optional()
    .isFloat({ min: 1, max: 5 })
    .withMessage('Professionalism rating must be between 1 and 5'),
  body('criteria.valueForMoney')
    .optional()
    .isFloat({ min: 1, max: 5 })
    .withMessage('Value for money rating must be between 1 and 5'),
];

const updateReviewValidation = [
  param('id').isUUID().withMessage('Review ID must be a valid UUID'),
  body('rating')
    .optional()
    .isFloat({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('comment')
    .optional()
    .isString()
    .isLength({ max: 2000 })
    .withMessage('Comment must be a string with maximum 2000 characters'),
  body('images')
    .optional()
    .isArray({ max: 10 })
    .withMessage('Images must be an array with maximum 10 items'),
  body('images.*').optional().isString().withMessage('Each image must be a string'),
  body('criteria').optional().isObject().withMessage('Criteria must be an object'),
];

const providerResponseValidation = [
  param('id').isUUID().withMessage('Review ID must be a valid UUID'),
  body('response')
    .isString()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Response must be a string between 1 and 1000 characters'),
];

const flagReviewValidation = [
  param('id').isUUID().withMessage('Review ID must be a valid UUID'),
  body('reason')
    .isString()
    .isLength({ min: 10, max: 500 })
    .withMessage('Flag reason must be between 10 and 500 characters'),
];

const reviewSearchValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  query('minRating')
    .optional()
    .isFloat({ min: 1, max: 5 })
    .withMessage('Minimum rating must be between 1 and 5'),
  query('maxRating')
    .optional()
    .isFloat({ min: 1, max: 5 })
    .withMessage('Maximum rating must be between 1 and 5'),
  query('sortBy')
    .optional()
    .isIn(['createdAt', 'rating', 'updatedAt'])
    .withMessage('Sort by must be one of: createdAt, rating, updatedAt'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
];

const uuidParamValidation = [param('id').isUUID().withMessage('ID must be a valid UUID')];

const providerIdValidation = [
  param('providerId').isUUID().withMessage('Provider ID must be a valid UUID'),
];

// NOTE: the literal `/provider/my` MUST be registered before `/provider/:providerId`,
// otherwise Express matches the param route first and "my" fails UUID validation (→ 400).
// It carries its own `authenticate` since it sits above the global `router.use(authenticate)`.
router.get(
  '/provider/my',
  authenticate,
  reviewSearchValidation,
  handleValidationErrors,
  reviewController.getMyProviderReviews
);

// Public routes (no authentication required)
router.get(
  '/provider/:providerId',
  providerIdValidation,
  reviewSearchValidation,
  handleValidationErrors,
  reviewController.getProviderReviews
);

router.get(
  '/search',
  reviewSearchValidation,
  handleValidationErrors,
  reviewController.searchReviews
);

router.get('/:id', uuidParamValidation, handleValidationErrors, reviewController.getReviewById);

router.get(
  '/analytics/:providerId',
  providerIdValidation,
  handleValidationErrors,
  reviewController.getReviewAnalytics
);

// Protected routes (authentication required)
router.use(authenticate);

// Customer routes
router.post('/', createReviewValidation, handleValidationErrors, reviewController.createReview);

router.put('/:id', updateReviewValidation, handleValidationErrors, reviewController.updateReview);

router.delete('/:id', uuidParamValidation, handleValidationErrors, reviewController.deleteReview);

router.get(
  '/customer/my',
  reviewSearchValidation,
  handleValidationErrors,
  reviewController.getMyCustomerReviews
);

// Provider routes
router.post(
  '/:id/response',
  providerResponseValidation,
  handleValidationErrors,
  reviewController.addProviderResponse
);

router.post(
  '/:id/draft-response',
  uuidParamValidation,
  handleValidationErrors,
  reviewController.draftReviewResponse
);

// General authenticated routes
router.post('/:id/flag', flagReviewValidation, handleValidationErrors, reviewController.flagReview);

export default router;
