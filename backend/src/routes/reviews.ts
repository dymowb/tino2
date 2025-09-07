import { Router } from 'express';
import ReviewController from '@/controllers/ReviewController';
import { authenticate, requireCustomerRole, requireProviderRole, optionalAuth } from '@/middleware/auth';
import { rateLimiters } from '@/middleware/security';

const router = Router();

// GET /api/reviews - Get all reviews with filters (public, with optional auth)
router.get('/', optionalAuth, ReviewController.getReviews);

// GET /api/reviews/:id - Get review by ID (public)
router.get('/:id', ReviewController.getReviewById);

// GET /api/reviews/provider/:providerId - Get provider reviews (public)
router.get('/provider/:providerId', ReviewController.getProviderReviews);

// Apply authentication middleware for protected routes
router.use(authenticate);

// POST /api/reviews - Create new review (FR-066, FR-067, FR-068)
router.post('/', 
  rateLimiters.general, 
  requireCustomerRole, 
  ReviewController.createReview
);

// POST /api/reviews/:id/images - Upload review images (FR-068)
router.post('/:id/images', 
  rateLimiters.upload,
  requireCustomerRole,
  ReviewController.uploadReviewImages,
  ReviewController.handleReviewImageUpload
);

// PUT /api/reviews/:id - Update review (customer can edit before provider responds)
router.put('/:id', 
  rateLimiters.general, 
  requireCustomerRole, 
  ReviewController.updateReview
);

// DELETE /api/reviews/:id - Delete review (customer can delete their own review)
router.delete('/:id', 
  rateLimiters.strict, 
  requireCustomerRole, 
  ReviewController.deleteReview
);

// POST /api/reviews/:id/response - Provider response to review (FR-069)
router.post('/:id/response', 
  rateLimiters.general, 
  requireProviderRole, 
  ReviewController.respondToReview
);

// GET /api/reviews/customer/:customerId - Get customer reviews (protected)
router.get('/customer/:customerId', 
  rateLimiters.general, 
  ReviewController.getCustomerReviews
);

export default router;