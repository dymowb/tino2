/**
 * Coordinator Agent
 *
 * The "brain" of the multi-agent system. Orchestrates workflow execution by:
 * 1. Deciding which agent to call next (state machine routing)
 * 2. Executing agents sequentially
 * 3. Updating workflow state after each agent
 * 4. Handling errors and edge cases
 *
 * Design Decision: State machine for Phase 1
 * - Fast (<1ms routing decisions)
 * - Predictable and debuggable
 * - No LLM call overhead
 *
 * Future Enhancement (Phase 2+): Hybrid approach
 * - State machine for normal flow
 * - LLM call for unexpected situations (marked with TODO comments)
 */

import { Agent, AgentResult, AgentActivity, AgentStatus } from './types/agent.types';
import {
  WorkflowState,
  WorkflowStatus,
  WorkflowContext,
  WorkflowConfig,
  DEFAULT_WORKFLOW_CONFIG,
} from './types/workflow.types';
import { workflowStateService } from './services/state.service';
import logger from '@/config/logger';
import { requirementsAgent } from './requirements.agent';
import { searchAgent } from './search.agent';
import { analysisAgent } from './analysis.agent';
import { recommendationAgent } from './recommendation.agent';
import { verificationAgent } from './verification.agent';
import { extractionAgent } from './memory/ExtractionAgent';
import { memoryRetriever } from '../services/memory/MemoryRetriever';
import { contextInjector } from '../services/memory/ContextInjector';

/**
 * Agent registry
 *
 * Maps agent names to their implementations.
 * Coordinator uses this to look up and execute agents.
 *
 * Note: Using 'any' for now since agent interface is still evolving
 */
interface AgentRegistry {
  [agentName: string]: any;
}

/**
 * Coordinator Agent
 *
 * Orchestrates the workflow by routing between specialist agents.
 */
export class CoordinatorAgent {
  /**
   * Registry of all available agents
   * Populated during initialization
   */
  private agents: AgentRegistry = {};

  /**
   * Workflow configuration
   */
  private config: WorkflowConfig;

  constructor(config: Partial<WorkflowConfig> = {}) {
    this.config = { ...DEFAULT_WORKFLOW_CONFIG, ...config };

    this.registerAgent('requirements', requirementsAgent);

    // Register search agent for Phase 3
    this.registerAgent('search', searchAgent);

    // Register analysis agent for Phase 4
    this.registerAgent('analysis', analysisAgent);

    // Register recommendation agent for Phase 5
    this.registerAgent('recommendation', recommendationAgent);

    // Register verification agent for Phase 6
    this.registerAgent('verification', verificationAgent);
  }

  /**
   * Register an agent with the coordinator
   *
   * @param name - Agent identifier (e.g., 'requirements', 'search')
   * @param agent - Agent implementation
   */
  registerAgent(name: string, agent: any): void {
    this.agents[name] = agent;
    logger.debug(`Registered agent: ${name}`);
  }

  /**
   * Execute the workflow from start to finish
   *
   * This is the main entry point. It runs agents sequentially
   * until workflow completes or fails.
   *
   * @param workflowId - Workflow to execute
   */
  /**
   * Human-readable progress messages emitted before each agent runs.
   * Keyed by agent name so the controller can surface them over SSE.
   */
  static readonly STAGE_MESSAGES: Record<string, string> = {
    requirements: 'Understanding your requirements...',
    search: 'Searching for providers...',
    analysis: 'Analysing provider matches...',
    recommendation: 'Ranking results...',
    verification: 'Verifying recommendations...',
  };

  async executeWorkflow(
    workflowId: string,
    onProgress?: (stage: string, message: string) => void,
  ): Promise<void> {
    try {
      // Mark workflow as active
      await workflowStateService.updateWorkflow(workflowId, () => ({
        status: WorkflowStatus.ACTIVE,
      }));

      // Retrieve memories before the agent loop — blocking so context is ready for the
      // requirements agent on its first turn. Failures are swallowed and return empty.
      const initWorkflow = await workflowStateService.getWorkflow(workflowId);
      if (!initWorkflow) throw new Error(`Workflow ${workflowId} not found`);
      const memories = await memoryRetriever.retrieve(
        initWorkflow.context.userRequest,
        initWorkflow.userId,
        workflowId,
      );
      const memoryBlock = contextInjector.format(memories);
      if (memoryBlock) {
        await workflowStateService.updateContext(workflowId, { memoryContext: memoryBlock });
        logger.info(`[Coordinator] Memory injected for workflow ${workflowId}: ${memories.semantic.length}s ${memories.episodic.length}e ${memories.procedural.length}p`);
      } else {
        logger.warn(`[Coordinator] No memory context for workflow ${workflowId} (hasAny=${memories.hasAny})`);
      }

      // Execute agents in sequence until done
      let iterations = 0;
      const maxIterations = 20; // Prevent infinite loops

      while (iterations < maxIterations) {
        iterations++;

        // Get current workflow state
        const workflow = await workflowStateService.getWorkflow(workflowId);
        if (!workflow) {
          throw new Error(`Workflow ${workflowId} not found`);
        }

        // Decide which agent to execute next
        const nextAgentName = this.decideNextAgent(workflow);

        // If no next agent, workflow is done (either completed or waiting for user)
        if (!nextAgentName) {
          // Check if we're waiting for user input
          if (
            workflow.context.requirements &&
            !workflow.context.requirements.isComplete &&
            workflow.context.requirements.followUpQuestion
          ) {
            // Workflow is paused, waiting for user response
            await workflowStateService.updateWorkflow(workflowId, () => ({
              status: WorkflowStatus.WAITING_FOR_USER,
            }));
            logger.info(`Workflow ${workflowId} paused - waiting for user response`);
            return;
          }

          // Otherwise, workflow is complete
          await workflowStateService.completeWorkflow(workflowId);
          logger.info(`Workflow ${workflowId} completed successfully`);

          // Fire memory extraction async — non-blocking, must not delay the user response.
          // The extraction runs after the workflow state is marked complete so it
          // never blocks the SSE stream. Any error is swallowed (logged).
          // Always include userRequest as the first turn — conversationMessages only holds
          // multi-turn follow-ups and would be empty for single-turn completions.
          const turns = [
            { role: 'user' as const, content: workflow.context.userRequest, timestamp: workflow.context.createdAt },
            ...(workflow.context.conversationMessages ?? []).map(m => ({
              role: m.role as 'user' | 'agent',
              content: m.content,
              timestamp: m.timestamp,
            })),
          ];
          extractionAgent
            .extractAndWrite(turns, workflow.userId, workflowId)
            .catch(err =>
              logger.error(`[ExtractionAgent] async write failed workflow=${workflowId}`, err),
            );

          return;
        }

        // Emit progress before running the agent so the client gets immediate feedback
        const message = CoordinatorAgent.STAGE_MESSAGES[nextAgentName] ?? `Running ${nextAgentName}...`;
        onProgress?.(nextAgentName, message);

        // Execute the agent
        await this.executeAgent(workflowId, nextAgentName);
      }

      // If we hit max iterations, something is wrong
      throw new Error(`Workflow ${workflowId} exceeded max iterations (${maxIterations})`);
    } catch (error) {
      // Handle workflow failure
      await this.handleWorkflowError(workflowId, error as Error);
    }
  }

  /**
   * Decide which agent to execute next
   *
   * Design: State machine approach (Phase 1)
   * - Checks workflow context to determine state
   * - Returns next agent name based on what's missing
   * - Returns null if workflow is complete
   *
   * Future Enhancement: Hybrid approach (Phase 2+)
   * - Try state machine first
   * - If state machine can't decide (edge case), call LLM
   * - LLM analyzes situation and suggests next agent
   *
   * @param workflow - Current workflow state
   * @returns Next agent name, or null if complete
   */
  private decideNextAgent(workflow: WorkflowState): string | null {
    const { context, agentHistory } = workflow;

    // Phase 2+: Could use lastActivity.output?.suggestedNextAgent for LLM-driven routing

    // State machine: Check what's missing and route accordingly
    // Step 1: Requirements gathering
    if (!context.requirements) {
      // No requirements yet - run requirements agent for first time
      return 'requirements';
    }

    if (context.requirements && !context.requirements.isComplete) {
      // Requirements incomplete - check if waiting for user response
      if (context.requirements.followUpQuestion) {
        // Agent is waiting for user to answer follow-up question
        // Pause workflow until user provides more information
        return null; // Stop execution, await user input
      }
      // No follow-up question but incomplete - run requirements agent again
      return 'requirements';
    }

    // Step 2: Provider search
    if (!context.searchResults) {
      return 'search';
    }

    // Edge case: No providers found - end workflow early
    if (context.searchResults.length === 0) {
      logger.warn(`No providers found for workflow ${workflow.id}`);
      return null;
    }

    // Step 3: Provider analysis
    if (!context.analysisResults) {
      return 'analysis';
    }

    // Step 4: Generate recommendations (Phase 5)
    if (!context.recommendations) {
      return 'recommendation';
    }

    // Step 5: Quality verification (Phase 6)
    if (!context.verification) {
      return 'verification';
    }

    // All steps complete
    return null;
  }

  /**
   * Execute a specific agent
   *
   * @param workflowId - Workflow to execute against
   * @param agentName - Which agent to run
   */
  private async executeAgent(workflowId: string, agentName: string): Promise<void> {
    const startTime = new Date();

    // Get agent implementation
    const agent = this.agents[agentName];
    if (!agent) {
      throw new Error(`Agent '${agentName}' not registered`);
    }

    // Get current workflow
    const workflow = await workflowStateService.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // Update workflow: Agent is now running
    await workflowStateService.updateWorkflow(workflowId, () => ({
      currentAgent: agentName,
    }));

    logger.info(`Executing agent: ${agentName} for workflow ${workflowId}`);

    try {
      // Create activity record (started)
      const activity: AgentActivity = {
        agentName,
        action: `Executing ${agentName} agent`,
        status: AgentStatus.THINKING,
        startTime,
      };

      // Add activity to workflow
      await workflowStateService.addActivity(workflowId, activity);

      // Execute the agent
      // Note: For Phase 1 mock agent, we pass the user's initial request
      // For Phase 2+ agents, they'll extract what they need from context
      const input = this.prepareAgentInput(agentName, workflow);
      const result = await agent.execute(input, workflow.context);

      // Agent completed successfully
      const endTime = new Date();
      const completedActivity: AgentActivity = {
        ...activity,
        status: AgentStatus.COMPLETED,
        output: result.output,
        endTime,
        durationMs: endTime.getTime() - startTime.getTime(),
      };

      // Update activity in workflow
      await workflowStateService.addActivity(workflowId, completedActivity);

      // Update workflow context with agent's output
      await this.updateContextFromResult(workflowId, agentName, result);

      logger.info(`Agent ${agentName} completed in ${completedActivity.durationMs}ms`);
    } catch (error) {
      // Agent failed
      const endTime = new Date();
      const failedActivity: AgentActivity = {
        agentName,
        action: `Executing ${agentName} agent`,
        status: AgentStatus.FAILED,
        startTime,
        endTime,
        durationMs: endTime.getTime() - startTime.getTime(),
        error: {
          message: (error as Error).message,
          stack: (error as Error).stack,
        },
      };

      await workflowStateService.addActivity(workflowId, failedActivity);

      // Re-throw to be caught by executeWorkflow
      throw error;
    }
  }

  /**
   * Prepare input for an agent based on workflow state
   *
   * @param agentName - Which agent to prepare input for
   * @param workflow - Current workflow state
   * @returns Input object for the agent
   */
  private prepareAgentInput(agentName: string, workflow: WorkflowState): any {
    switch (agentName) {
      case 'requirements':
        return {
          userRequest: workflow.context.userRequest,
          conversationHistory: workflow.agentHistory.map(activity => ({
            agentName: activity.agentName,
            timestamp: activity.startTime,
            output: activity.output,
          })),
          conversationMessages: workflow.context.conversationMessages,
          memoryContext: workflow.context.memoryContext,
        };

      case 'search':
        // Search agent needs the gathered requirements
        return {
          requirements: workflow.context.requirements?.requirementsSummary || null,
          workflowId: workflow.id, // Pass workflow ID for potential database access
          userId: workflow.userId, // Pass user ID for personalized search
        };

      case 'analysis':
        // Analysis agent needs search results
        return {
          providers: workflow.context.searchResults,
          requirements: workflow.context.requirements,
        };

      case 'recommendation':
        // Recommendation agent needs search results + analysis + requirements
        return {
          providers: workflow.context.searchResults,
          analysisResults: workflow.context.analysisResults,
          requirements: workflow.context.requirements,
        };

      case 'verification':
        // Verification agent needs recommendations
        return {
          recommendations: workflow.context.recommendations,
          requirements: workflow.context.requirements,
        };

      default:
        // Unknown agent - pass entire context
        return workflow.context;
    }
  }

  /**
   * Update workflow context based on agent result
   *
   * Maps agent output to the correct context field
   *
   * @param workflowId - Workflow to update
   * @param agentName - Which agent produced this output
   * @param result - Agent's result
   */
  private async updateContextFromResult(
    workflowId: string,
    agentName: string,
    result: AgentResult<any>
  ): Promise<void> {
    // Map agent name to context field
    const contextUpdates: Partial<WorkflowContext> = {};

    switch (agentName) {
      case 'requirements':
        contextUpdates.requirements = result.output;
        // If requirements agent asked a follow-up, record it in conversation messages
        if (!result.output.isComplete && result.output.followUpQuestion) {
          const workflow = await workflowStateService.getWorkflow(workflowId);
          const existing = workflow?.context.conversationMessages ?? [];
          contextUpdates.conversationMessages = [
            ...existing,
            { role: 'agent', content: result.output.followUpQuestion, timestamp: new Date() },
          ];
        }
        break;
      case 'search':
        contextUpdates.searchResults = result.output.providers;
        break;
      case 'analysis':
        contextUpdates.analysisResults = result.output.analyses;
        break;
      case 'recommendation':
        contextUpdates.recommendations = result.output.recommendations;
        break;
      case 'verification':
        // result.output is VerificationAgentOutput { report, timedOut }
        // context.verification only stores the VerificationReport itself
        contextUpdates.verification = result.output.report;
        break;
      default:
        logger.warn(`Unknown agent: ${agentName}, output not mapped to context`);
    }

    // Update workflow context
    await workflowStateService.updateContext(workflowId, contextUpdates);
  }

  /**
   * Handle workflow errors
   *
   * @param workflowId - Workflow that failed
   * @param error - Error that occurred
   */
  private async handleWorkflowError(workflowId: string, error: Error): Promise<void> {
    logger.error(`Workflow ${workflowId} failed: ${error.message}`);

    await workflowStateService.failWorkflow(workflowId, {
      message: error.message,
      stack: error.stack,
    });
  }

  /**
   * Get coordinator statistics
   *
   * @returns Current state of all workflows
   */
  async getStats() {
    return workflowStateService.getStats();
  }
}

/**
 * Singleton coordinator instance
 */
export const coordinator = new CoordinatorAgent();
