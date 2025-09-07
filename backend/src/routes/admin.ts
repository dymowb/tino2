import { Router } from 'express';
import AdminController from '@/controllers/AdminController';
import { authenticate, requireAdminRole } from '@/middleware/auth';
import { rateLimiters } from '@/middleware/security';

const router = Router();

// Apply authentication and admin role middleware to all routes
router.use(authenticate);
router.use(requireAdminRole);

// GET /api/admin/dashboard - Admin dashboard overview (FR-076)
router.get('/dashboard', rateLimiters.general, AdminController.getDashboard);

// GET /api/admin/users - Manage users (FR-074)
router.get('/users', rateLimiters.general, AdminController.getUsers);

// PUT /api/admin/users/:id/status - Update user status (FR-074)
router.put('/users/:id/status', rateLimiters.strict, AdminController.updateUserStatus);

// GET /api/admin/providers/pending - Get pending provider verifications (FR-075)
router.get('/providers/pending', rateLimiters.general, AdminController.getPendingProviders);

// POST /api/admin/providers/:id/verify - Verify provider (FR-075)
router.post('/providers/:id/verify', rateLimiters.strict, AdminController.verifyProvider);

// GET /api/admin/reviews/flagged - Get flagged reviews (FR-077, FR-081)
router.get('/reviews/flagged', rateLimiters.general, AdminController.getFlaggedReviews);

// PUT /api/admin/reviews/:id/moderate - Moderate review (FR-081)
router.put('/reviews/:id/moderate', rateLimiters.strict, AdminController.moderateReview);

// GET /api/admin/analytics - Platform analytics (FR-076)
router.get('/analytics', rateLimiters.general, AdminController.getAnalytics);

// GET /api/admin/disputes - Handle disputes (FR-077)
router.get('/disputes', rateLimiters.general, AdminController.getDisputes);

// PUT /api/admin/disputes/:id/resolve - Resolve dispute (FR-077)
router.put('/disputes/:id/resolve', rateLimiters.strict, AdminController.resolveDispute);

export default router;