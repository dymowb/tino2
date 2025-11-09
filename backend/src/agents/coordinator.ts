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
import { mockAgent } from './mock.agent';
import { requirementsAgent } from './requirements.agent';

/**
 * Agent registry
 *
 * Maps agent names to their implementations.
 * Coordinator uses this to look up and execute agents.
 *
 * Note: Using 'any' for now since agent interface is still evolving
 * TODO Phase 2+: Update agent.types.ts to match actual implementation
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

    // Register mock agent for Phase 1 testing
    this.registerAgent('mock', mockAgent);

    // Register requirements agent for Phase 2
    this.registerAgent('requirements', requirementsAgent);
  }

  /**
   * Register an agent with the coordinator
   *
   * @param name - Agent identifier (e.g., 'requirements', 'search')
   * @param agent - Agent implementation
   */
  registerAgent(name: string, agent: any): void {
    this.agents[name] = agent;
    console.log(`✅ Registered agent: ${name}`);
  }

  /**
   * Execute the workflow from start to finish
   *
   * This is the main entry point. It runs agents sequentially
   * until workflow completes or fails.
   *
   * @param workflowId - Workflow to execute
   */
  async executeWorkflow(workflowId: string): Promise<void> {
    try {
      // Mark workflow as active
      await workflowStateService.updateWorkflow(workflowId, () => ({
        status: WorkflowStatus.ACTIVE,
      }));

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

        // If no next agent, workflow is complete
        if (!nextAgentName) {
          await workflowStateService.completeWorkflow(workflowId);
          console.log(`✅ Workflow ${workflowId} completed successfully`);
          return;
        }

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

    // Check if last agent suggested a different route
    // (Enables agent-driven routing for edge cases)
    if (agentHistory.length > 0) {
      const lastActivity = agentHistory[agentHistory.length - 1];

      // TODO Phase 2+: If agent suggested something unusual, consult LLM
      // const suggestion = lastActivity.output?.suggestedNextAgent;
      // if (suggestion && !this.isExpectedRoute(suggestion, context)) {
      //   return await this.llmDecideRoute(workflow, suggestion);
      // }
    }

    // State machine: Check what's missing and route accordingly
    // Step 1: Requirements gathering
    if (!context.requirements) {
      return 'requirements';
    }

    // Step 2: Provider search
    if (!context.searchResults) {
      return 'search';
    }

    // Edge case: No providers found - end workflow early
    if (context.searchResults.length === 0) {
      console.log(`⚠️  No providers found for workflow ${workflow.id}`);
      // TODO Phase 2+: LLM could suggest alternative actions here
      // return await this.llmHandleNoResults(workflow);
      return null; // End workflow
    }

    // Step 3: Provider analysis
    if (!context.analysisResults) {
      return 'analysis';
    }

    // Step 4: Generate recommendations
    if (!context.recommendations) {
      return 'recommendation';
    }

    // Step 5: Quality verification
    if (!context.verification) {
      return 'verification';
    }

    // Edge case: Verification failed - might need to loop back
    if (context.verification && !context.verification.passed) {
      console.log(`⚠️  Verification failed for workflow ${workflow.id}`);
      // TODO Phase 2+: LLM decides whether to retry or fail
      // return await this.llmHandleVerificationFailure(workflow);

      // For now: Just complete anyway (Phase 1 simplification)
      return null;
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

    console.log(`🤖 Executing agent: ${agentName} for workflow ${workflowId}`);

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

      console.log(
        `✅ Agent ${agentName} completed in ${completedActivity.durationMs}ms`
      );
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
      case 'mock':
        // Mock agent just needs the user's message
        return { message: workflow.context.userRequest };

      case 'requirements':
        // Requirements agent needs user request and any previous conversation
        return {
          userRequest: workflow.context.userRequest,
          conversationHistory: workflow.agentHistory.map(activity => ({
            agentName: activity.agentName,
            timestamp: activity.startTime,
            output: activity.output,
          })),
        };

      case 'search':
        // Search agent needs the gathered requirements
        return {
          requirements: workflow.context.requirements,
        };

      case 'analysis':
        // Analysis agent needs search results
        return {
          providers: workflow.context.searchResults,
          requirements: workflow.context.requirements,
        };

      case 'recommendation':
        // Recommendation agent needs analysis
        return {
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
      case 'mock':
        // Store mock agent response for Phase 1 UAT testing
        contextUpdates.mockResponse = result.output;
        break;
      case 'requirements':
        contextUpdates.requirements = result.output;
        break;
      case 'search':
        contextUpdates.searchResults = result.output;
        break;
      case 'analysis':
        contextUpdates.analysisResults = result.output;
        break;
      case 'recommendation':
        contextUpdates.recommendations = result.output;
        break;
      case 'verification':
        contextUpdates.verification = result.output;
        break;
      default:
        console.warn(`Unknown agent: ${agentName}, output not mapped to context`);
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
    console.error(`❌ Workflow ${workflowId} failed:`, error.message);

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
