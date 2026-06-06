/**
 * Workflow State Management Service
 *
 * This service manages in-memory workflow state with:
 * - Immutable updates for consistency
 * - Concurrency protection via per-workflow locks
 * - TTL-based cleanup for zombie workflows
 * - TTL-based cleanup for completed workflows
 *
 * Design Decisions (based on requirements analysis):
 * 1. In-memory storage (Map) for low latency (<1ms)
 * 2. Immutable updates to prevent partial state corruption
 * 3. Per-workflow locks to handle concurrent API requests
 * 4. TTL of 30 minutes to clean up abandoned workflows
 * 5. Completed workflows kept for 5 min (frontend polling), then cleaned up
 *
 * Future Enhancement (Phase 2+):
 * - Async persistence to DB for learning (eventual consistency)
 * - Memory MCP integration for compressed storage
 */

import { v4 as uuidv4 } from 'uuid';
import { WorkflowState, WorkflowStatus, WorkflowContext } from '../types/workflow.types';
import { AgentActivity } from '../types/agent.types';
import { RequirementsAgentOutput } from '../requirements.agent';
import logger from '../../config/logger';

/**
 * Configuration for workflow lifecycle
 */
interface WorkflowConfig {
  /** How long before abandoned workflow is cleaned up (milliseconds) */
  ttl: number;

  /** How long to keep completed/failed/cancelled workflows in memory (milliseconds) */
  completedTtl: number;

  /** How often to run cleanup task (milliseconds) */
  cleanupInterval: number;

  /** Whether to log cleanup operations */
  logCleanup: boolean;
}

const DEFAULT_CONFIG: WorkflowConfig = {
  ttl: 30 * 60 * 1000,           // 30 minutes
  completedTtl: 5 * 60 * 1000,   // 5 minutes — enough for frontend polling
  cleanupInterval: 60 * 1000,    // 1 minute
  logCleanup: true,
};

/**
 * Workflow State Service
 *
 * Thread-safety: Each workflow update is protected by a per-workflow lock
 * Memory management: TTL-based cleanup + immediate deletion on completion
 */
export class WorkflowStateService {
  /**
   * In-memory storage of all active workflows
   *
   * Why Map instead of object?
   * - Faster lookups O(1)
   * - Can use any key type (not just strings)
   * - Has size property
   * - Better iteration performance
   */
  private workflows: Map<string, WorkflowState> = new Map();

  /**
   * Per-workflow locks for concurrency control
   *
   * Why per-workflow instead of global lock?
   * - Different workflows can update in parallel (better performance)
   * - Only same workflow updates are serialized (necessary)
   *
   * Example:
   *   Workflow A updating → Workflow B can update simultaneously ✅
   *   Workflow A updating → Workflow A API request waits ✅
   */
  private locks: Map<string, Promise<void>> = new Map();

  /**
   * Cleanup timer reference
   * Stored so we can clear it in tests or shutdown
   */
  private cleanupTimer?: NodeJS.Timeout;

  /**
   * Service configuration
   */
  private config: WorkflowConfig;

  constructor(config: Partial<WorkflowConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Start background cleanup task
    this.startCleanupTask();
  }

  /**
   * Create a new workflow
   *
   * @param userId - User who initiated this workflow
   * @param userRequest - Initial request message
   * @param locale - Preferred locale for agent responses
   * @param seededRequirements - Pre-extracted requirements (re-run path): when
   *   provided, the requirements are seeded as already-complete so the
   *   coordinator skips the requirements agent and routes straight to search.
   * @returns Newly created workflow state
   */
  async createWorkflow(
    userId: string,
    userRequest: string,
    locale?: string,
    seededRequirements?: NonNullable<RequirementsAgentOutput['requirementsSummary']>
  ): Promise<WorkflowState> {
    const workflowId = uuidv4();
    const now = new Date();

    const workflow: WorkflowState = {
      id: workflowId,
      userId,
      status: WorkflowStatus.PENDING,
      currentAgent: null,
      agentHistory: [],
      context: {
        workflowId,
        userId,
        createdAt: now,
        userRequest,
        locale: locale || 'pt',
        ...(seededRequirements && {
          requirements: {
            isComplete: true,
            requirementsSummary: seededRequirements,
            extractedFacts: [],
            missingInformation: [],
          },
        }),
      },
      createdAt: now,
      updatedAt: now,
    };

    // Store in memory
    this.workflows.set(workflowId, workflow);

    return workflow;
  }

  /**
   * Get workflow by ID
   *
   * @param workflowId - Workflow identifier
   * @returns Workflow state or undefined if not found
   */
  async getWorkflow(workflowId: string): Promise<WorkflowState | undefined> {
    return this.workflows.get(workflowId);
  }

  /**
   * Update workflow state immutably
   *
   * Design Decision: Immutable updates prevent partial state corruption
   *
   * Example of problem this solves:
   *   // BAD (mutable):
   *   workflow.status = 'completed';
   *   throw new Error();  // Status updated but requirements missing!
   *   workflow.context.requirements = req;
   *
   *   // GOOD (immutable):
   *   const updated = { ...workflow, status: 'completed', context: {...} };
   *   // Either ALL fields update, or NONE do
   *
   * @param workflowId - Workflow to update
   * @param updater - Function that transforms old state to new state
   * @returns Updated workflow state
   * @throws Error if workflow not found
   */
  async updateWorkflow(
    workflowId: string,
    updater: (current: WorkflowState) => Partial<WorkflowState>
  ): Promise<WorkflowState> {
    // Wait for any in-progress update on this workflow
    await this.locks.get(workflowId);

    // Create lock for this update
    const updatePromise = this.performUpdate(workflowId, updater);
    this.locks.set(workflowId, updatePromise);

    try {
      await updatePromise;
      // Return updated workflow
      const updated = this.workflows.get(workflowId);
      if (!updated) {
        throw new Error(`Workflow ${workflowId} not found after update`);
      }
      return updated;
    } finally {
      // Release lock
      this.locks.delete(workflowId);
    }
  }

  /**
   * Internal update implementation
   * Should only be called through updateWorkflow (which handles locking)
   */
  private async performUpdate(
    workflowId: string,
    updater: (current: WorkflowState) => Partial<WorkflowState>
  ): Promise<void> {
    const current = this.workflows.get(workflowId);
    if (!current) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // Apply update function to get changes
    const changes = updater(current);

    // Create new state object (immutable update)
    const updated: WorkflowState = {
      ...current,
      ...changes,
      updatedAt: new Date(), // Always update timestamp
    };

    // Store updated state
    this.workflows.set(workflowId, updated);
  }

  /**
   * Add activity to workflow history
   *
   * This is called after each agent execution to maintain audit log
   *
   * @param workflowId - Workflow to update
   * @param activity - Agent activity to append
   */
  async addActivity(workflowId: string, activity: AgentActivity): Promise<WorkflowState> {
    return this.updateWorkflow(workflowId, (current) => ({
      agentHistory: [...current.agentHistory, activity],
    }));
  }

  /**
   * Update workflow context (data passed between agents)
   *
   * Example: Requirements Agent adds requirements to context
   *
   * @param workflowId - Workflow to update
   * @param contextUpdates - Partial context updates
   */
  async updateContext(
    workflowId: string,
    contextUpdates: Partial<WorkflowContext>
  ): Promise<WorkflowState> {
    return this.updateWorkflow(workflowId, (current) => ({
      context: {
        ...current.context,
        ...contextUpdates,
      },
    }));
  }

  /**
   * Mark workflow as completed and clean up
   *
   * Design Decision: Immediate deletion after completion
   * Completed workflows are read-only, no need to keep in fast memory
   *
   * Future Enhancement: Async save to DB before deletion
   *
   * @param workflowId - Workflow to complete
   */
  async completeWorkflow(workflowId: string): Promise<void> {
    await this.updateWorkflow(workflowId, () => ({
      status: WorkflowStatus.COMPLETED,
      currentAgent: null,
      completedAt: new Date(),
    }));

    // Keep in memory for completedTtl so frontend can poll for results
    // Cleanup task will remove it after the TTL expires

    if (this.config.logCleanup) {
      logger.info(`Workflow ${workflowId} completed (will be cleaned up after ${this.config.completedTtl / 1000}s)`);
    }
  }

  /**
   * Mark workflow as failed and clean up
   *
   * @param workflowId - Workflow that failed
   * @param error - Error information
   */
  async failWorkflow(
    workflowId: string,
    error: { message: string; code?: string; agentName?: string; stack?: string }
  ): Promise<void> {
    await this.updateWorkflow(workflowId, () => ({
      status: WorkflowStatus.FAILED,
      currentAgent: null,
      completedAt: new Date(),
      error,
    }));

    // Keep in memory for completedTtl so frontend can poll for error details

    if (this.config.logCleanup) {
      logger.error(`Workflow ${workflowId} failed: ${error.message} (will be cleaned up after ${this.config.completedTtl / 1000}s)`);
    }
  }

  /**
   * Cancel workflow (user-initiated)
   *
   * @param workflowId - Workflow to cancel
   */
  async cancelWorkflow(workflowId: string): Promise<void> {
    await this.updateWorkflow(workflowId, () => ({
      status: WorkflowStatus.CANCELLED,
      currentAgent: null,
      completedAt: new Date(),
    }));

    // Keep in memory briefly so frontend gets the cancelled status

    if (this.config.logCleanup) {
      logger.info(`Workflow ${workflowId} cancelled by user (will be cleaned up after ${this.config.completedTtl / 1000}s)`);
    }
  }

  /**
   * Get all workflows for a user
   *
   * @param userId - User ID to filter by
   * @returns Array of workflow states
   */
  async getUserWorkflows(userId: string): Promise<WorkflowState[]> {
    const userWorkflows: WorkflowState[] = [];

    for (const workflow of this.workflows.values()) {
      if (workflow.userId === userId) {
        userWorkflows.push(workflow);
      }
    }

    return userWorkflows;
  }

  /**
   * Get memory statistics
   *
   * Useful for monitoring and alerting
   *
   * @returns Current memory usage stats
   */
  getStats(): {
    totalWorkflows: number;
    byStatus: Record<WorkflowStatus, number>;
    oldestWorkflow?: { id: string; age: number };
  } {
    const stats = {
      totalWorkflows: this.workflows.size,
      byStatus: {
        [WorkflowStatus.PENDING]: 0,
        [WorkflowStatus.ACTIVE]: 0,
        [WorkflowStatus.WAITING_FOR_USER]: 0,
        [WorkflowStatus.COMPLETED]: 0,
        [WorkflowStatus.FAILED]: 0,
        [WorkflowStatus.CANCELLED]: 0,
      },
      oldestWorkflow: undefined as { id: string; age: number } | undefined,
    };

    let oldestTime = Date.now();
    let oldestId = '';

    for (const [id, workflow] of this.workflows) {
      // Count by status
      stats.byStatus[workflow.status]++;

      // Track oldest
      const age = workflow.createdAt.getTime();
      if (age < oldestTime) {
        oldestTime = age;
        oldestId = id;
      }
    }

    if (oldestId) {
      stats.oldestWorkflow = {
        id: oldestId,
        age: Date.now() - oldestTime,
      };
    }

    return stats;
  }

  /**
   * Start background cleanup task
   *
   * Design Decision: TTL-based cleanup for zombie workflows
   *
   * Prevents memory leak from:
   * - Users who start workflow but never complete it
   * - Malicious spam attacks
   * - Long-running workflows that get stuck
   *
   * TTL: 30 minutes (configurable)
   * Cleanup frequency: 1 minute (configurable)
   */
  private startCleanupTask(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupZombieWorkflows();
    }, this.config.cleanupInterval);

    // Don't prevent Node.js from exiting
    this.cleanupTimer.unref();
  }

  /**
   * Clean up workflows that exceeded TTL
   *
   * Two categories:
   * 1. Zombie workflows (pending/active that exceeded main TTL) — abandoned by users
   * 2. Completed workflows (completed/failed/cancelled past completedTtl) — already consumed by frontend
   */
  private cleanupZombieWorkflows(): void {
    const now = Date.now();
    const toDelete: string[] = [];
    const terminalStatuses = [WorkflowStatus.COMPLETED, WorkflowStatus.FAILED, WorkflowStatus.CANCELLED];

    for (const [id, workflow] of this.workflows) {
      const isTerminal = terminalStatuses.includes(workflow.status);

      if (isTerminal && workflow.completedAt) {
        // Completed workflows: use shorter completedTtl
        const completedAge = now - workflow.completedAt.getTime();
        if (completedAge > this.config.completedTtl) {
          toDelete.push(id);
        }
      } else {
        // Active/pending workflows: use main TTL for zombie detection
        const age = now - workflow.createdAt.getTime();
        if (age > this.config.ttl) {
          toDelete.push(id);
        }
      }
    }

    for (const id of toDelete) {
      this.workflows.delete(id);

      if (this.config.logCleanup) {
        logger.debug(`Cleaned up workflow ${id}`);
      }
    }

    if (toDelete.length > 0 && this.config.logCleanup) {
      logger.debug(`Cleanup complete: removed ${toDelete.length} workflows`);
    }
  }

  /**
   * Stop cleanup task (for tests or shutdown)
   */
  stopCleanupTask(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Clear all workflows (for tests)
   */
  clearAll(): void {
    this.workflows.clear();
    this.locks.clear();
  }

  /**
   * Shutdown service gracefully
   */
  async shutdown(): Promise<void> {
    this.stopCleanupTask();

    // TODO Phase 2: Flush any pending DB writes

    this.clearAll();

    logger.info('WorkflowStateService shut down gracefully');
  }
}

/**
 * Singleton instance
 *
 * Q: Why singleton?
 * A: Only one state manager should exist per server process
 *    Multiple instances would have different views of state!
 */
export const workflowStateService = new WorkflowStateService();
