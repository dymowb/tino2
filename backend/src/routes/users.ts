import { Router } from 'express';
import UserController from '@/controllers/UserController';
import { authenticate } from '@/middleware/auth';
import { rateLimiters } from '@/middleware/security';

const router = Router();

// Apply authentication middleware to all user routes
router.use(authenticate);

// GET /api/users/profile - Get current user profile (FR-006, FR-008)
router.get('/profile', UserController.getProfile);

// PUT /api/users/profile - Update user profile (FR-006, FR-008)
router.put('/profile', rateLimiters.general, UserController.updateProfile);

// DELETE /api/users/profile - Delete user account (SEC-018)
router.delete('/profile', rateLimiters.strict, UserController.deleteProfile.bind(UserController));

// POST /api/users/profile/image - Upload profile image (FR-007)
// router.post('/profile/image',
//   rateLimiters.upload,
//   UserController.uploadProfileImage,
//   UserController.handleProfileImageUpload
// );

// GET /api/users/export - Portable copy of everything held about the caller (M6)
// Registered before `/:id`, which would otherwise swallow it and answer as though
// "export" were a user id — the shadowing that left two endpoints in the contract
// test asserting routes that did not exist.
router.get('/export', rateLimiters.strict, UserController.exportData.bind(UserController));

// GET /api/users/:id - Get user by ID (public profile view)
router.get('/:id', UserController.getUserById);

// PUT /api/users/settings - Update user settings (FR-010, FR-011)
router.put('/settings', rateLimiters.general, UserController.updateSettings);

export default router;
