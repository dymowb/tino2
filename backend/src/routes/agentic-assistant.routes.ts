/**
 * Agentic Assistant Routes
 *
 * REST API endpoints for the multi-agent service discovery assistant.
 */

import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { rateLimiters } from '@/middleware/security';
import AgenticAssistantController from '@/controllers/AgenticAssistantController';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * POST /api/v1/agentic-assistant/workflows
 * Start a new workflow
 */
router.post(
  '/workflows',
  rateLimiters.general,
  AgenticAssistantController.startWorkflow.bind(AgenticAssistantController)
);

/**
 * GET /api/v1/agentic-assistant/workflows/:id
 * Get workflow status and results
 */
router.get(
  '/workflows/:id',
  AgenticAssistantController.getWorkflow.bind(AgenticAssistantController)
);

/**
 * POST /api/v1/agentic-assistant/workflows/:id/messages
 * Send a user message to continue the conversation
 */
router.post(
  '/workflows/:id/messages',
  rateLimiters.general,
  AgenticAssistantController.sendMessage.bind(AgenticAssistantController)
);

/**
 * DELETE /api/v1/agentic-assistant/workflows/:id
 * Cancel a workflow
 */
router.delete(
  '/workflows/:id',
  AgenticAssistantController.cancelWorkflow.bind(AgenticAssistantController)
);

/**
 * GET /api/v1/agentic-assistant/memory-debug?query=...
 * Dev: show the <memory> block + scored memories that would be injected for this user
 */
router.get(
  '/memory-debug',
  AgenticAssistantController.memoryDebug.bind(AgenticAssistantController)
);

/**
 * POST /api/v1/agentic-assistant/reflection/run
 * Trigger reflection for the current user (on-demand)
 */
router.post(
  '/reflection/run',
  AgenticAssistantController.runReflection.bind(AgenticAssistantController)
);

/**
 * GET /api/v1/agentic-assistant/stats
 * Get system statistics
 */
router.get(
  '/stats',
  AgenticAssistantController.getStats.bind(AgenticAssistantController)
);

export default router;
