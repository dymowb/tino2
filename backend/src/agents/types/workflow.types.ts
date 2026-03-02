/**
 * Workflow Type Definitions
 *
 * This file defines how agents work together in a coordinated workflow.
 * While agent.types.ts defines individual agents, this file defines the
 * orchestration layer.
 *
 * Key Concepts:
 * - WorkflowState: Current state of the entire workflow
 * - WorkflowContext: Data passed between agents
 * - WorkflowStatus: Progress tracking for the workflow
 */

import { RequirementsAgentOutput } from '../requirements.agent';
import { AgentActivity } from './agent.types';

/**
 * Workflow Status
 *
 * Tracks the overall state of the workflow (not individual agents).
 */
export enum WorkflowStatus {
  PENDING = 'pending',       // Workflow created but not started
  ACTIVE = 'active',         // Currently processing
  WAITING_FOR_USER = 'waiting_for_user', // Paused, waiting for user input
  COMPLETED = 'completed',   // Successfully finished
  FAILED = 'failed',         // Encountered unrecoverable error
  CANCELLED = 'cancelled',   // User or system cancelled
}

/**
 * Workflow Context
 *
 * Shared data that flows through all agents in the workflow.
 * Each agent reads from and writes to this context.
 *
 * Design Decision: Strict typing with extensions (no index signature)
 * Agents extend this for their specific needs.
 */
export interface WorkflowContext {
  /** Unique identifier for this workflow */
  readonly workflowId: string;

  /** User who initiated this workflow */
  readonly userId: string;

  /** When workflow was created */
  readonly createdAt: Date;

  /** Original user request that started the workflow */
  userRequest: string;

  /** Conversational messages between user and agents (for multi-turn dialogs) */
  conversationMessages?: Array<{
    role: 'user' | 'agent';
    content: string;
    timestamp: Date;
  }>;

  /**
   * Requirements gathered by Requirements Agent
   * Undefined until Requirements Agent completes
   */
  requirements?: RequirementsAgentOutput;

  /**
   * Providers found by Search Agent
   * Undefined until Search Agent completes
   */
  searchResults?: ProviderSearchResult[];

  /**
   * Analysis results from Analysis Agent
   * Undefined until Analysis Agent completes
   */
  analysisResults?: ProviderAnalysis[];

  /**
   * Final recommendations from Recommendation Agent
   * Undefined until Recommendation Agent completes
   */
  recommendations?: Recommendation[];

  /**
   * Verification report from Verification Agent
   * Undefined until Verification Agent completes
   */
  verification?: VerificationReport;

  /**
   * Mock response for Phase 1 UAT testing
   * Undefined until Mock Agent completes (Phase 1 only)
   */
  mockResponse?: {
    response: string;
    testData: {
      processedAt: Date;
      inputLength: number;
    };
  };
}

/**
 * Requirements Summary (output from Requirements Agent)
 */
export interface RequirementsSummary {
  serviceType: string;
  urgency: 'emergency' | 'same-day' | 'within-24h' | 'this-week' | 'flexible';
  location: {
    address?: string;
    city: string;
    state: string;
    zipCode?: string;
    coordinates?: { lat: number; lng: number };
  };
  budget?: {
    min?: number;
    max?: number;
    currency: string;
  };
  requirements: string[]; // e.g., ["Licensed", "Insured", "Background check"]
  additionalDetails?: string;
}

/**
 * Provider Search Result (output from Search Agent)
 */
export interface ProviderSearchResult {
  providerId: string;
  businessName: string;
  rating: number;
  totalReviews: number;
  services: string[];
  distance?: number; // miles from user location
  pricing?: {
    baseRate?: number;
    hourlyRate?: number; // legacy alias
    currency: string;
    rateType?: string;
  };
  availability?: {
    emergency: boolean;
    averageResponseTime?: number; // minutes
  };
  // Fields from search.agent.ts output
  matchScore?: number;
  completedJobs?: number;
  availableHours?: Record<string, { start: string; end: string; available: boolean }>;
  location?: { city: string; state: string; distanceFromUser?: number };
  isBackgroundChecked?: boolean;
  isInsured?: boolean;
}

/**
 * Provider Analysis (output from Analysis Agent)
 */
export interface ProviderAnalysis {
  providerId: string;
  matchScore: number; // 0-1 scale
  strengths: string[];
  concerns: string[];
  reviewSentiment: string;
  uniqueValue?: string;
  riskFactors?: string[];
}

/**
 * Recommendation (output from Recommendation Agent)
 */
export interface Recommendation {
  rank: number; // 1, 2, 3
  provider: ProviderSearchResult;
  analysis: ProviderAnalysis;
  reasoning: string;
  tradeoffs?: string[];
  bestFor?: string;
}

/**
 * Individual check result from Verification Agent
 */
export interface CheckResult {
  passed: boolean;
  notes: string; // One-sentence explanation
}

/**
 * Verification Report (output from Verification Agent)
 */
export interface VerificationReport {
  passed: boolean;          // true only if ALL checks passed
  qualityScore: number;     // 0-10 scale
  requirementsCoverage: CheckResult;
  recommendationQuality: CheckResult;
  completeness: CheckResult;
  suggestions: string[];
  timedOut?: boolean;       // true when verification was skipped due to timeout
}

/**
 * Workflow State
 *
 * Complete state of the workflow, including history and current progress.
 * This is what gets stored in the state management service.
 */
export interface WorkflowState {
  /** Unique identifier */
  readonly id: string;

  /** User who owns this workflow */
  readonly userId: string;

  /** Current status */
  status: WorkflowStatus;

  /**
   * Current agent being executed
   * null if workflow not started or completed
   */
  currentAgent: string | null;

  /**
   * Complete history of all agent activities
   * This is the "audit log" of the workflow
   */
  agentHistory: AgentActivity[];

  /**
   * Shared context passed between agents
   * This accumulates data as agents complete
   */
  context: WorkflowContext;

  /** When workflow was created */
  readonly createdAt: Date;

  /** When workflow was last updated */
  updatedAt: Date;

  /**
   * When workflow completed (success or failure)
   * Undefined if still in progress
   */
  completedAt?: Date;

  /**
   * Error information if workflow failed
   */
  error?: {
    message: string;
    code?: string;
    agentName?: string; // Which agent caused the failure
    stack?: string;
  };
}

/**
 * Workflow Configuration
 *
 * Settings that control how the workflow executes.
 */
export interface WorkflowConfig {
  /** Maximum time workflow can run (milliseconds) */
  timeout: number;

  /**
   * Maximum iterations for reflection loops
   * Prevents infinite loops if agent keeps finding improvements
   */
  maxReflectionIterations: number;

  /**
   * Whether to log detailed agent activity
   * Turn off in production to reduce storage
   */
  detailedLogging: boolean;

  /**
   * Whether to store conversation history for learning
   * Used by Memory MCP later
   */
  enableLearning: boolean;
}

/**
 * Default workflow configuration
 */
export const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  timeout: 300000, // 5 minutes
  maxReflectionIterations: 3,
  detailedLogging: true,
  enableLearning: true,
};

/**
 * Type guard for WorkflowState
 */
export function isWorkflowState(value: unknown): value is WorkflowState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'status' in value &&
    'context' in value &&
    'agentHistory' in value
  );
}
