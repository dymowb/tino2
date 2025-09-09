import { Router } from 'express';
import { BrowserController } from '@/controllers/BrowserController';
import { authenticate } from '@/middleware/auth';
import { handleValidationErrors } from '@/middleware/validation';
import { body, param } from 'express-validator';

const router = Router();
const browserController = new BrowserController();

// Validation schemas
const createSessionValidation = [
  body('timeout')
    .optional()
    .isInt({ min: 10000, max: 3600000 })
    .withMessage('Timeout must be between 10 seconds and 1 hour'),
  body('keepAlive')
    .optional()
    .isBoolean()
    .withMessage('Keep alive must be a boolean'),
  body('browserSettings')
    .optional()
    .isObject()
    .withMessage('Browser settings must be an object'),
];

const sessionIdValidation = [
  param('sessionId')
    .notEmpty()
    .isLength({ min: 1, max: 100 })
    .withMessage('Session ID is required and must be valid'),
];

// Routes
router.post('/sessions', 
  authenticate,
  createSessionValidation,
  handleValidationErrors,
  browserController.createSession.bind(browserController)
);

router.get('/sessions/:sessionId',
  authenticate,
  sessionIdValidation,
  handleValidationErrors,
  browserController.getSession.bind(browserController)
);

router.delete('/sessions/:sessionId',
  authenticate,
  sessionIdValidation,
  handleValidationErrors,
  browserController.endSession.bind(browserController)
);

router.get('/sessions',
  authenticate,
  browserController.listSessions.bind(browserController)
);

router.get('/stats',
  authenticate,
  browserController.getSessionStats.bind(browserController)
);

router.post('/cleanup',
  authenticate,
  browserController.cleanupSessions.bind(browserController)
);

export default router;