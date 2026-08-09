import { Router } from 'express';
import adminController from '@/controllers/AdminController';
import { authenticate, requireAdminRole } from '@/middleware/auth';
import { rateLimiters } from '@/middleware/security';

const router = Router();

// Apply authentication and admin role middleware to all routes
router.use(authenticate);
router.use(requireAdminRole);

// GET /api/admin/dashboard - Admin dashboard overview (FR-076)
router.get('/dashboard', rateLimiters.general, adminController.getDashboard);

// GET /api/admin/users - Manage users (FR-074)
router.get('/users', rateLimiters.general, adminController.getUsers);

// PUT /api/admin/users/:id/status - Update user status (FR-074)
router.put('/users/:id/status', rateLimiters.adminStrict, adminController.updateUserStatus);

// GET /api/admin/providers/pending - Get pending provider verifications (FR-075)
router.get('/providers/pending', rateLimiters.general, adminController.getPendingProviders);

// POST /api/admin/providers/:id/verify - Verify provider (FR-075)
router.post('/providers/:id/verify', rateLimiters.adminStrict, adminController.verifyProvider);

// GET /api/admin/reviews/flagged - Get flagged reviews (FR-077, FR-081)
router.get('/reviews/flagged', rateLimiters.general, adminController.getFlaggedReviews);

// PUT /api/admin/reviews/:id/moderate - Moderate review (FR-081)
router.put('/reviews/:id/moderate', rateLimiters.adminStrict, adminController.moderateReview);

// GET /api/admin/analytics - Platform analytics (FR-076)
router.get('/analytics', rateLimiters.general, adminController.getAnalytics);

// GET /api/admin/disputes - Handle disputes (FR-077)
router.get('/disputes', rateLimiters.general, adminController.getDisputes);

// PUT /api/admin/disputes/:id/resolve - Resolve dispute (FR-077)
router.put('/disputes/:id/resolve', rateLimiters.adminStrict, adminController.resolveDispute);

// GET /api/admin/quote-requests - Inspect request targeting + recipients
router.get('/quote-requests', rateLimiters.general, adminController.getQuoteRequests);

router.get('/settings', rateLimiters.general, adminController.getSettings);
router.put('/settings/:key', rateLimiters.adminStrict, adminController.updateSetting);
router.get('/ai-configuration', rateLimiters.general, adminController.getAiConfiguration);
router.put(
  '/ai-configuration/:field',
  rateLimiters.adminStrict,
  adminController.updateAiConfiguration
);

export default router;
