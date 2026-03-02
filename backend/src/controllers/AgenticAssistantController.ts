/**
 * Agentic Assistant Controller
 *
 * Handles HTTP requests for the multi-agent service discovery system.
 */

import { Response } from 'express';
import { AuthenticatedRequest } from '@/types';
import logger from '@/config/logger';
import { coordinator } from '@/agents/coordinator';
import { workflowStateService } from '@/agents/services/state.service';
import { WorkflowStatus } from '@/agents/types/workflow.types';

class AgenticAssistantController {
  /**
   * POST /api/v1/agentic-assistant/workflows
   * Start a new workflow
   */
  public async startWorkflow(req: AuthenticatedRequest, res: Response): Promise<void> {
    logger.debug('New workflow request', { body: req.body, userId: req.user?.userId });

    try {
      const { initialMessage } = req.body;
      const userId = req.user?.userId;

      if (!initialMessage || typeof initialMessage !== 'string') {
        res.status(400).json({
          success: false,
          error: 'initialMessage is required and must be a string'
        });
        return;
      }

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
        return;
      }

      const workflow = await workflowStateService.createWorkflow(userId, initialMessage);

      coordinator.executeWorkflow(workflow.id).catch((error) => {
        logger.error(`Workflow ${workflow.id} execution failed:`, error);
      });

      logger.info(`Workflow ${workflow.id} started for user ${userId}`);

      res.status(201).json({
        success: true,
        data: {
          workflowId: workflow.id,
          status: workflow.status,
          message: 'Workflow started successfully',
        },
      });
    } catch (error) {
      logger.error('Error starting workflow:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * GET /api/v1/agentic-assistant/workflows/:id
   * Get workflow status and results
   */
  public async getWorkflow(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
        return;
      }

      // Get workflow
      const workflow = await workflowStateService.getWorkflow(id);

      if (!workflow) {
        res.status(404).json({
          success: false,
          error: 'Workflow not found',
        });
        return;
      }

      // Check ownership
      if (workflow.userId !== userId) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
        });
        return;
      }

      logger.info(`Workflow ${id} retrieved for user ${userId}`);

      res.json({
        success: true,
        data: {
          workflow,
        },
      });
    } catch (error) {
      logger.error('Error retrieving workflow:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * POST /api/v1/agentic-assistant/workflows/:id/messages
   * Send a user message to continue the conversation
   */
  public async sendMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { message } = req.body;
      const userId = req.user?.userId;

      // Validate request
      if (!message || typeof message !== 'string') {
        res.status(400).json({
          success: false,
          error: 'message is required and must be a string',
        });
        return;
      }

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
        return;
      }

      // Get workflow
      const workflow = await workflowStateService.getWorkflow(id);

      if (!workflow) {
        res.status(404).json({
          success: false,
          error: 'Workflow not found',
        });
        return;
      }

      // Check ownership
      if (workflow.userId !== userId) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
        });
        return;
      }

      // Check if workflow can accept messages
      const acceptableStatuses = [WorkflowStatus.ACTIVE, WorkflowStatus.PENDING, WorkflowStatus.WAITING_FOR_USER];
      if (!acceptableStatuses.includes(workflow.status)) {
        res.status(400).json({
          success: false,
          error: `Cannot send message to ${workflow.status} workflow`,
        });
        return;
      }

      // Append user message to conversation history in context
      const existingMessages = workflow.context.conversationMessages ?? [];
      const contextUpdate: any = {
        conversationMessages: [
          ...existingMessages,
          { role: 'user', content: message, timestamp: new Date() },
        ],
      };

      // If requirements had a follow-up question, clear it so the coordinator
      // knows the user has answered and re-runs the requirements agent
      if (workflow.context.requirements?.followUpQuestion) {
        contextUpdate.requirements = {
          ...workflow.context.requirements,
          followUpQuestion: undefined,
        };
      }

      await workflowStateService.updateContext(id, contextUpdate);

      // If workflow was paused waiting for the user, resume it
      if (workflow.status === WorkflowStatus.WAITING_FOR_USER) {
        coordinator.executeWorkflow(id).catch((error) => {
          logger.error(`Workflow ${id} resume failed:`, error);
        });
      }

      // Return the current workflow state so client can poll
      const updatedWorkflow = await workflowStateService.getWorkflow(id);
      logger.info(`Message sent to workflow ${id} by user ${userId}`);

      res.json({
        success: true,
        data: {
          workflow: updatedWorkflow,
        },
      });
    } catch (error) {
      logger.error('Error sending message to workflow:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * DELETE /api/v1/agentic-assistant/workflows/:id
   * Cancel a workflow
   */
  public async cancelWorkflow(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
        return;
      }

      // Get workflow
      const workflow = await workflowStateService.getWorkflow(id);

      if (!workflow) {
        res.status(404).json({
          success: false,
          error: 'Workflow not found',
        });
        return;
      }

      // Check ownership
      if (workflow.userId !== userId) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
        });
        return;
      }

      // Cancel workflow
      await workflowStateService.failWorkflow(id, {
        message: 'Workflow cancelled by user',
      });

      logger.info(`Workflow ${id} cancelled by user ${userId}`);

      res.json({
        success: true,
        data: {
          message: 'Workflow cancelled successfully',
        },
      });
    } catch (error) {
      logger.error('Error cancelling workflow:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * GET /api/v1/agentic-assistant/stats
   * Get system statistics
   */
  public async getStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
        return;
      }

      // Get stats from coordinator
      const stats = await coordinator.getStats();

      logger.info(`Stats retrieved by user ${userId}`);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Error retrieving stats:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
}

export default new AgenticAssistantController();
