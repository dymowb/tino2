import { Router } from 'express';
import { authController } from '@/controllers/AuthController';
import { userValidation, handleValidationErrors } from '@/middleware/validation';
import { authenticate, refreshTokenMiddleware } from '@/middleware/auth';
import { rateLimiters } from '@/middleware/security';

const router = Router();

router.get('/verify-email', authController.verifyEmail.bind(authController));

router.post('/resend-verification', rateLimiters.auth, authController.resendVerification.bind(authController));

router.post(
  '/register',
  rateLimiters.auth,
  userValidation.register,
  handleValidationErrors,
  authController.register.bind(authController)
);

router.post(
  '/login',
  rateLimiters.auth,
  userValidation.login,
  handleValidationErrors,
  authController.login.bind(authController)
);

router.post('/refresh', refreshTokenMiddleware, authController.refreshToken.bind(authController));

router.post('/logout', authenticate, authController.logout.bind(authController));

router.get('/profile', authenticate, authController.getProfile.bind(authController));

router.put(
  '/profile',
  authenticate,
  userValidation.updateProfile,
  handleValidationErrors,
  authController.updateProfile.bind(authController)
);

router.put(
  '/password',
  authenticate,
  userValidation.changePassword,
  handleValidationErrors,
  authController.changePassword.bind(authController)
);

export default router;
