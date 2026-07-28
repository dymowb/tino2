import { Request, Response, NextFunction } from 'express';
import { validationResult, body, param, query } from 'express-validator';
import { ApiResponse } from '@/types';

export const handleValidationErrors = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors: Record<string, string[]> = {};

    errors.array().forEach((error) => {
      const field = error.type === 'field' ? error.path : 'general';
      if (!formattedErrors[field]) {
        formattedErrors[field] = [];
      }
      formattedErrors[field].push(error.msg);
    });

    const response: ApiResponse = {
      success: false,
      message: 'Validation failed',
      errors: formattedErrors,
    };

    res.status(400).json(response);
    return;
  }

  next();
};

export const userValidation = {
  register: [
    body('email')
      .isEmail()
      .withMessage('Valid email is required')
      .normalizeEmail()
      .isLength({ max: 255 })
      .withMessage('Email must be less than 255 characters'),
    body('password')
      .isLength({ min: 8, max: 128 })
      .withMessage('Password must be between 8 and 128 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/)
      .withMessage(
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      ),
    body('firstName')
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('First name is required and must be less than 50 characters')
      .matches(/^[a-zA-Z\s-']+$/)
      .withMessage('First name can only contain letters, spaces, hyphens, and apostrophes'),
    body('lastName')
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Last name is required and must be less than 50 characters')
      .matches(/^[a-zA-Z\s-']+$/)
      .withMessage('Last name can only contain letters, spaces, hyphens, and apostrophes'),
    body('phone')
      .optional()
      .matches(/^[+]?[\d\s\-()]{10,20}$/)
      .withMessage('Valid phone number is required'),
    body('userType')
      .isIn(['customer', 'provider'])
      .withMessage('User type must be either customer or provider'),
  ],

  login: [
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').isLength({ min: 1 }).withMessage('Password is required'),
  ],

  updateProfile: [
    body('firstName')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('First name must be between 1 and 50 characters')
      .matches(/^[a-zA-Z\s-']+$/)
      .withMessage('First name can only contain letters, spaces, hyphens, and apostrophes'),
    body('lastName')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Last name must be between 1 and 50 characters')
      .matches(/^[a-zA-Z\s-']+$/)
      .withMessage('Last name can only contain letters, spaces, hyphens, and apostrophes'),
    body('phone')
      .optional()
      .matches(/^[+]?[\d\s\-()]{10,20}$/)
      .withMessage('Valid phone number is required'),
  ],

  changePassword: [
    body('currentPassword').isLength({ min: 1 }).withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8, max: 128 })
      .withMessage('New password must be between 8 and 128 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/)
      .withMessage(
        'New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      ),
  ],
};

export const providerValidation = {
  create: [
    body('businessName')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Business name is required and must be between 2 and 100 characters'),
    body('description')
      .trim()
      .isLength({ min: 10, max: 1000 })
      .withMessage('Description is required and must be between 10 and 1000 characters'),
    body('services').isArray({ min: 1 }).withMessage('At least one service is required'),
    body('services.*').isString().withMessage('Each service must be a string'),
    body('location.latitude')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Valid latitude is required'),
    body('location.longitude')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Valid longitude is required'),
    body('location.address')
      .trim()
      .isLength({ min: 5, max: 200 })
      .withMessage('Valid address is required'),
    body('serviceRadius')
      .isFloat({ min: 1, max: 100 })
      .withMessage('Service radius must be between 1 and 100 kilometers'),
  ],

  update: [
    body('businessName')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Business name must be between 2 and 100 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ min: 10, max: 1000 })
      .withMessage('Description must be between 10 and 1000 characters'),
    body('services').optional().isArray({ min: 1 }).withMessage('At least one service is required'),
    body('serviceRadius')
      .optional()
      .isFloat({ min: 1, max: 100 })
      .withMessage('Service radius must be between 1 and 100 kilometers'),
  ],
};

export const bookingValidation = {
  create: [
    body('serviceType')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Service type is required'),
    body('description')
      .trim()
      .isLength({ min: 10, max: 1000 })
      .withMessage('Description is required and must be between 10 and 1000 characters'),
    body('location.latitude')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Valid latitude is required'),
    body('location.longitude')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Valid longitude is required'),
    body('location.address')
      .trim()
      .isLength({ min: 5, max: 200 })
      .withMessage('Valid address is required'),
    body('scheduledDate')
      .isISO8601()
      .withMessage('Valid scheduled date is required')
      .custom((value) => {
        const date = new Date(value);
        const now = new Date();
        if (date <= now) {
          throw new Error('Scheduled date must be in the future');
        }
        return true;
      }),
    body('estimatedDuration')
      .isInt({ min: 15, max: 480 })
      .withMessage('Estimated duration must be between 15 and 480 minutes'),
  ],

  update: [
    body('status')
      .optional()
      .isIn(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'])
      .withMessage('Valid status is required'),
    body('scheduledDate').optional().isISO8601().withMessage('Valid scheduled date is required'),
    body('estimatedDuration')
      .optional()
      .isInt({ min: 15, max: 480 })
      .withMessage('Estimated duration must be between 15 and 480 minutes'),
  ],
};

export const quoteValidation = {
  request: [
    body('serviceType')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Service type is required'),
    body('description')
      .trim()
      .isLength({ min: 10, max: 1000 })
      .withMessage('Description is required and must be between 10 and 1000 characters'),
    body('location.latitude')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Valid latitude is required'),
    body('location.longitude')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Valid longitude is required'),
    body('urgency')
      .isIn(['low', 'medium', 'high', 'urgent'])
      .withMessage('Valid urgency level is required'),
    body('budget.min')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Minimum budget must be a positive number'),
    body('budget.max')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Maximum budget must be a positive number'),
  ],

  submit: [
    body('estimatedPrice').isFloat({ min: 0 }).withMessage('Valid estimated price is required'),
    body('estimatedDuration')
      .isInt({ min: 15 })
      .withMessage('Estimated duration must be at least 15 minutes'),
    body('validUntil')
      .isISO8601()
      .withMessage('Valid expiration date is required')
      .custom((value) => {
        const date = new Date(value);
        const now = new Date();
        if (date <= now) {
          throw new Error('Quote expiration date must be in the future');
        }
        return true;
      }),
    body('description')
      .trim()
      .isLength({ min: 10, max: 1000 })
      .withMessage('Quote description is required and must be between 10 and 1000 characters'),
  ],
};

export const messageValidation = {
  send: [
    body('receiverId').isUUID().withMessage('Valid receiver ID is required'),
    body('message')
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Message is required and must be less than 1000 characters'),
    body('messageType')
      .optional()
      .isIn(['text', 'image', 'file', 'location'])
      .withMessage('Valid message type is required'),
  ],
};

export const reviewValidation = {
  create: [
    body('rating').isFloat({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('comment')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Comment must be less than 1000 characters'),
  ],
};

export const paginationValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer').toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  query('sortBy').optional().isString().withMessage('Sort by must be a string'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be either asc or desc'),
];

export const idParamValidation = [param('id').isUUID().withMessage('Valid ID is required')];

export const paymentValidation = {
  createIntent: [
    body('bookingId').isUUID().withMessage('Valid booking ID is required'),
    body('amount')
      .isFloat({ min: 0.5, max: 999999.99 })
      .withMessage('Payment amount must be between $0.50 and $999,999.99'),
    body('currency')
      .optional()
      .isIn(['usd', 'eur', 'gbp', 'cad', 'aud'])
      .withMessage('Supported currencies: USD, EUR, GBP, CAD, AUD'),
    body('paymentMethod')
      .optional()
      .isIn(['credit_card', 'debit_card', 'bank_transfer', 'paypal', 'apple_pay', 'google_pay'])
      .withMessage('Valid payment method is required'),
  ],

  confirmPayment: [param('id').isUUID().withMessage('Valid payment ID is required')],

  refund: [
    param('id').isUUID().withMessage('Valid payment ID is required'),
    body('amount')
      .optional()
      .isFloat({ min: 0.01 })
      .withMessage('Refund amount must be greater than 0'),
    body('reason')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Refund reason must be less than 500 characters'),
  ],

  getHistory: [
    query('status')
      .optional()
      .isIn([
        'pending',
        'processing',
        'succeeded',
        'failed',
        'cancelled',
        'refunded',
        'partially_refunded',
      ])
      .withMessage('Valid payment status is required'),
    query('startDate').optional().isISO8601().withMessage('Valid start date is required'),
    query('endDate').optional().isISO8601().withMessage('Valid end date is required'),
    ...paginationValidation,
  ],
};
