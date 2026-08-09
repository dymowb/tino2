/**
 * Agentic Assistant Controller
 *
 * Handles HTTP requests for the multi-agent service discovery system.
 */

import { Response } from 'express';
import { AuthenticatedRequest } from '@/types';
import logger from '@/config/logger';
import { coordinator, CoordinatorAgent } from '@/agents/coordinator';
import { workflowStateService } from '@/agents/services/state.service';
import { WorkflowStatus } from '@/agents/types/workflow.types';
import { aiGateway } from '@/agents/services/ai-gateway.service';
import { memoryRetriever } from '@/services/memory/MemoryRetriever';
import { contextInjector } from '@/services/memory/ContextInjector';
import { runReflectionForUser } from '@/jobs/reflection.job';

class AgenticAssistantController {
  /**
   * POST /api/v1/agentic-assistant/workflows
   * Start a new workflow. Supports ?stream=true for SSE streaming mode.
   */
  public async startWorkflow(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (req.query.stream === 'true') {
      return this.startWorkflowStream(req, res);
    }

    logger.debug('New workflow request', { body: req.body, userId: req.user?.userId });

    try {
      const { initialMessage, locale } = req.body;
      const userId = req.user?.userId;

      if (!initialMessage || typeof initialMessage !== 'string') {
        res.status(400).json({
          success: false,
          error: 'initialMessage is required and must be a string',
        });
        return;
      }

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'User not authenticated',
        });
        return;
      }

      const workflow = await workflowStateService.createWorkflow(userId, initialMessage, locale);

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
   * POST /api/v1/agentic-assistant/workflows?stream=true
   * Streaming variant — runs the pipeline synchronously and emits SSE events:
   *   { type: 'started',  workflowId }
   *   { type: 'progress', stage, message }   ← one per agent, before it runs
   *   { type: 'token',    text }             ← narrative chunks (typewriter effect)
   *   { type: 'complete', workflowId, data } ← final structured result
   *   { type: 'error',    message }          ← on failure
   */
  private async startWorkflowStream(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { initialMessage, locale, requirements: seededRequirements } = req.body;
    const userId = req.user?.userId;

    // `seededRequirements` is the re-run path: the user edited the structured
    // requirements panel, so we seed those directly and skip extraction.
    // In that case the free-text message is optional.
    if (!seededRequirements && (!initialMessage || typeof initialMessage !== 'string')) {
      res
        .status(400)
        .json({ success: false, error: 'initialMessage is required and must be a string' });
      return;
    }
    if (!userId) {
      res.status(401).json({ success: false, error: 'User not authenticated' });
      return;
    }

    // SSE headers — keep connection alive for the duration of the pipeline
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const emit = (event: object) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const workflow = await workflowStateService.createWorkflow(
        userId,
        typeof initialMessage === 'string' ? initialMessage : '',
        locale,
        seededRequirements
      );
      emit({ type: 'started', workflowId: workflow.id });

      // Run pipeline synchronously — onProgress fires before each agent
      await coordinator.executeWorkflow(workflow.id, (stage, message) => {
        emit({ type: 'progress', stage, message });
      });

      // Fetch final state so we can include it in the complete event and build the narrative
      const finalWorkflow = await workflowStateService.getWorkflow(workflow.id);
      const topRec = finalWorkflow?.context.recommendations?.[0];
      const requirements = finalWorkflow?.context.requirements;

      // Stream a short narrative intro if we have a recommendation to talk about
      if (topRec && requirements) {
        emit({ type: 'progress', stage: 'narrative', message: 'Writing your recommendation...' });

        const narrativePrompt = `You are summarising provider search results for a customer.
Write 2-3 warm, direct sentences introducing the top recommendation and what makes them stand out for this customer's needs.
Do NOT list all providers. Do NOT use markdown.

Customer needs: ${JSON.stringify(requirements.requirementsSummary)}
Top recommendation: ${topRec.provider.businessName ?? topRec.provider.providerId} — ${topRec.reasoning}`;

        for await (const chunk of aiGateway.stream('fast', {
          systemPrompt: 'You are a helpful assistant summarising service provider recommendations.',
          userMessage: narrativePrompt,
          maxTokens: 200,
          temperature: 0.7,
        })) {
          emit({ type: 'token', text: chunk });
        }
      }

      emit({ type: 'complete', workflowId: workflow.id, data: finalWorkflow });
      logger.info(`Streaming workflow ${workflow.id} completed for user ${userId}`);
    } catch (error) {
      logger.error('Streaming workflow error:', error);
      emit({ type: 'error', message: 'An error occurred while processing your request' });
    } finally {
      res.end();
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
          error: 'User not authenticated',
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
          error: 'User not authenticated',
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
      const acceptableStatuses = [
        WorkflowStatus.ACTIVE,
        WorkflowStatus.PENDING,
        WorkflowStatus.WAITING_FOR_USER,
      ];
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
          error: 'User not authenticated',
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
   * GET /api/v1/agentic-assistant/memory-debug?query=...
   * Dev-only: show the memory block that would be injected for this user + query.
   * Returns structured memories, the formatted <memory> XML block, and a preview
   * of the full system prompt that the requirements agent would receive.
   */
  public async memoryDebug(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Not authenticated' });
        return;
      }

      const query =
        typeof req.query.query === 'string' && req.query.query.trim()
          ? req.query.query.trim()
          : 'Preciso de uma faxineira';

      const memories = await memoryRetriever.retrieve(query, userId, 'debug');
      const memoryBlock = contextInjector.format(memories);

      const BASE_PROMPT_EXCERPT = `You are a requirements gathering assistant for a domestic services platform.\nRespond ONLY in Brazilian Portuguese (pt-BR).\n[...full base prompt omitted for brevity...]`;

      res.json({
        success: true,
        data: {
          query,
          userId,
          memories: {
            semantic: memories.semantic.map((m) => ({
              content: m.content,
              score: m.score.toFixed(4),
            })),
            episodic: memories.episodic.map((e) => ({
              summary: e.summary,
              occurredAt: e.occurredAt,
              score: e.score.toFixed(4),
            })),
            procedural: memories.procedural.map((p) => ({
              promptFragment: p.promptFragment,
              confidence: p.confidence,
            })),
          },
          memoryBlock: memoryBlock ?? '(no memories — empty)',
          fullSystemPromptPreview: memoryBlock
            ? `${memoryBlock}\n\n${BASE_PROMPT_EXCERPT}`
            : BASE_PROMPT_EXCERPT,
          hasMemory: memories.hasAny,
        },
      });
    } catch (error) {
      logger.error('Error in memory-debug:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  /**
   * POST /api/v1/agentic-assistant/reflection/run
   * Trigger the reflection job for the current user (dev / on-demand).
   */
  public async runReflection(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Not authenticated' });
        return;
      }

      const result = await runReflectionForUser(userId);

      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error in reflection run:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
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
          error: 'User not authenticated',
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
