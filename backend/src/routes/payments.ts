import { Router } from 'express';
import PaymentController from '@/controllers/PaymentController';
import { authenticate, requireCustomerRole, requireProviderRole } from '@/middleware/auth';
import { rateLimiters } from '@/middleware/security';
import { paymentValidation, handleValidationErrors, idParamValidation } from '@/middleware/validation';
import { param } from 'express-validator';
import express from 'express';

const router = Router();

// Stripe webhook endpoint (no auth required, uses signature verification)
router.post('/webhook/stripe', 
  express.raw({ type: 'application/json' }), 
  PaymentController.handleStripeWebhook
);

// Apply authentication middleware to all other payment routes
router.use(authenticate);

// GET /api/payments - Get user payments (FR-064)
router.get('/', 
  rateLimiters.general, 
  paymentValidation.getHistory,
  handleValidationErrors,
  PaymentController.getPayments
);

// GET /api/payments/:id - Get payment by ID (FR-064)
router.get('/:id', 
  idParamValidation,
  handleValidationErrors,
  PaymentController.getPaymentById
);

// POST /api/payments/setup-intent - Create SetupIntent to save card (no charge)
router.post('/setup-intent',
  rateLimiters.general,
  PaymentController.createSetupIntent
);

// POST /api/payments/save-method - Persist confirmed payment method ID
router.post('/save-method',
  rateLimiters.general,
  PaymentController.savePaymentMethod
);

// POST /api/payments/intent - Create payment intent (FR-057, FR-058, FR-059)
router.post('/intent',
  PaymentController.createPaymentIntent
);

// POST /api/payments/:id/confirm - Confirm payment (capture escrow funds)
router.post('/:id/confirm', 
  PaymentController.confirmPayment
);

// POST /api/payments/:id/refund - Process refund (FR-063)
router.post('/:id/refund', 
  PaymentController.refundPayment
);

// GET /api/payments/customer/:customerId - Get customer payments
router.get('/customer/:customerId', 
  rateLimiters.general,
  param('customerId').isUUID().withMessage('Valid customer ID is required'),
  handleValidationErrors,
  PaymentController.getCustomerPayments
);

// GET /api/payments/provider/:providerId - Get provider payments
router.get('/provider/:providerId', 
  rateLimiters.general,
  param('providerId').isUUID().withMessage('Valid provider ID is required'),
  handleValidationErrors,
  PaymentController.getProviderPayments
);

export default router;