/**
 * Agent Type Definitions
 *
 * This file defines the core contracts that ALL agents must follow.
 * Think of this as the "interface" in OOP - it defines WHAT agents can do,
 * not HOW they do it.
 *
 * Key Design Principles:
 * 1. Generic Types: Agent<TInput, TOutput> allows flexibility while maintaining type safety
 * 2. Single Responsibility: Each agent has ONE clear job
 * 3. Observable: All agent actions are logged for transparency
 * 4. Composable: Agents can be chained together via coordinator
 */

/**
 * Agent Status
 *
 * Q: Why enum instead of string literals?
 * A: Enums provide autocomplete and prevent typos. Compare:
 *    ✅ status = AgentStatus.COMPLETED (autocomplete!)
 *    ❌ status = 'completed' (typo risk: 'complted')
 */
export enum AgentStatus {
  IDLE = 'idle', // Agent initialized but not started
  THINKING = 'thinking', // Agent is processing (LLM call in progress)
  ACTING = 'acting', // Agent is using tools (MCP calls)
  REFLECTING = 'reflecting', // Agent is evaluating its own output
  COMPLETED = 'completed', // Agent finished successfully
  FAILED = 'failed', // Agent encountered an error
}

/**
 * Agent Activity
 *
 * This is your "logs and traces" concept! Every agent action is recorded
 * so we can debug issues and show users what's happening.
 *
 * Q: Why track timestamps?
 * A: Performance monitoring. If an agent takes 30 seconds, we need to know!
 */
export interface AgentActivity {
  /** Agent that performed this activity */
  readonly agentName: string;

  /** What the agent was doing (e.g., "Generating follow-up questions") */
  readonly action: string;

  /** Current status of this activity */
  status: AgentStatus;

  /**
   * Input data for this activity (optional for privacy/size)
   * Q: Why optional?
   * A: Some inputs are huge (entire provider database). We log action, not always data.
   */
  input?: unknown;

  /**
   * Output data from this activity (optional for same reason)
   */
  output?: unknown;

  /**
   * Reflection output (if agent used reflection pattern)
   * Example: { needsImprovement: true, improvements: ["Ask about budget"] }
   */
  reflection?: {
    needsImprovement: boolean;
    improvements: string[];
    confidence: number; // 0-1 scale
  };

  /** When this activity started */
  readonly startTime: Date;

  /** When this activity ended (undefined if still in progress) */
  endTime?: Date;

  /** How long it took in milliseconds (calculated after completion) */
  durationMs?: number;

  /**
   * Any errors that occurred
   * Q: Why separate from status?
   * A: Status tells us WHAT happened, error tells us WHY it failed
   */
  error?: {
    message: string;
    code?: string;
    stack?: string; // For debugging, not shown to users
  };
}

/**
 * Agent Metadata
 *
 * Configuration for each agent. This is their "job description."
 *
 * Q: Why separate metadata from agent class?
 * A: So we can change config without changing code. Also makes testing easier.
 */
export interface AgentMetadata {
  /** Unique identifier (e.g., "requirements-agent") */
  readonly name: string;

  /** Human-readable description */
  readonly description: string;

  /** Which Claude model to use */
  readonly model: 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6' | 'claude-opus-4-6';

  /**
   * Which MCP tools this agent can use
   * Empty array = agent doesn't use tools (pure reasoning)
   */
  readonly tools: string[]; // e.g., ['ide', 'browser', 'websearch']

  /**
   * Maximum tokens for LLM responses
   * Q: Why limit?
   * A: Cost control! Opus is expensive, we don't want 10,000 token responses.
   */
  readonly maxTokens: number;

  /**
   * Temperature for LLM (0-1)
   * 0 = deterministic (good for analysis)
   * 1 = creative (good for brainstorming)
   */
  readonly temperature: number;

  /**
   * System prompt for this agent
   * This defines the agent's personality and instructions
   */
  readonly systemPrompt: string;
}

/**
 * Reflection Result
 *
 * Result from an agent's self-evaluation (reflection pattern).
 * Used to determine if the agent's output needs improvement.
 */
export interface ReflectionResult {
  /** Whether the output needs improvement */
  needsImprovement: boolean;

  /** List of suggested improvements (empty if no improvement needed) */
  improvements: string[];

  /** Confidence in the output quality (0-1 scale) */
  confidence: number;

  /** Optional reasoning for why improvements are needed */
  reasoning?: string;
}

/**
 * Generic Agent Interface
 *
 * THIS IS THE KEY! All agents implement this interface.
 *
 * The <TInput, TOutput> syntax is TypeScript generics:
 * - TInput: What type of data this agent accepts
 * - TOutput: What type of data this agent returns
 *
 * Example:
 *   RequirementsAgent implements Agent<UserRequest, RequirementsSummary>
 *   SearchAgent implements Agent<RequirementsSummary, Provider[]>
 *
 * Q: Why generics instead of 'any'?
 * A: Type safety! Compiler catches:
 *    ❌ searchAgent.execute("wrong type") // Compile error!
 *    ✅ searchAgent.execute(requirementsSummary) // Works!
 */
export interface Agent<TInput = unknown, TOutput = unknown> {
  /** Agent configuration and metadata */
  readonly metadata: AgentMetadata;

  /**
   * Execute the agent's main function
   *
   * This is the "makeSound()" of your Animal interface analogy!
   * All agents have execute(), but each does something different.
   *
   * @param input - Data needed for this agent to work
   * @param context - Shared context across all agents in workflow
   * @returns Promise of agent's output
   *
   * Q: Why Promise?
   * A: All agent work is async (LLM calls, MCP tools, etc.)
   */
  execute(input: TInput, context: WorkflowContext): Promise<AgentResult<TOutput>>;

  /**
   * Optional: Validate input before executing
   *
   * Q: Why separate validation?
   * A: Fail fast! If input is invalid, don't waste time/money on LLM call.
   *
   * Example:
   *   if (!input.userRequest) {
   *     throw new ValidationError('User request is required');
   *   }
   */
  validateInput?(input: TInput): void | Promise<void>;

  /**
   * Reflect on output quality (REQUIRED)
   *
   * This is the REFLECTION PATTERN!
   * Agent evaluates its own output and decides if it needs improvement.
   *
   * Design Decision: Made REQUIRED because LLM outputs are non-deterministic.
   * Every agent must evaluate its own quality.
   *
   * Optimization: If agent is satisfied, return needsImprovement: false
   * to avoid unnecessary iterations.
   *
   * @returns Reflection result with improvement suggestions
   *
   * Example:
   *   // Simple agent that's always satisfied:
   *   async reflect() {
   *     return { needsImprovement: false, improvements: [], confidence: 1.0 };
   *   }
   *
   *   // Complex agent with quality checks:
   *   async reflect(output, input) {
   *     if (output.questions.length < 3) {
   *       return {
   *         needsImprovement: true,
   *         improvements: ["Ask more detailed questions"],
   *         confidence: 0.6
   *       };
   *     }
   *     return { needsImprovement: false, improvements: [], confidence: 0.9 };
   *   }
   */
  reflect(output: TOutput, input: TInput): Promise<ReflectionResult>;
}

/**
 * Agent Result
 *
 * Wrapper around agent output that includes metadata about execution.
 *
 * Q: Why wrap the output instead of returning it directly?
 * A: So we can include execution metadata (timing, tokens, confidence) without
 *    mixing it with the actual result data.
 *
 * Design Decision: Coordinator manages AgentActivity lifecycle separately.
 * Agents return simple success/output/metadata, coordinator creates activity records.
 *
 * Think of it like HTTP responses:
 *   - success: The status code (200 OK, 500 Error)
 *   - output: The response body (actual data)
 *   - metadata: Performance metrics (timing, tokens)
 */
export interface AgentResult<TOutput> {
  /** Whether the agent execution was successful */
  success: boolean;

  /** The actual output data from the agent */
  output: TOutput;

  /** Execution metadata (timing, tokens, confidence) */
  metadata: {
    executionTimeMs: number;
    tokensUsed: number;
    modelUsed: string;
    confidence: number;
  };

  /** Any errors that occurred (present if success is false) */
  errors?: string[];

  /**
   * Suggested next agent (HINT ONLY - coordinator decides)
   *
   * Design Decision: Renamed from "nextAgent" to clarify this is advisory only.
   * The coordinator maintains control of routing (centralized control).
   *
   * Use case: Agent encountered an issue and suggests remediation.
   * Example: Verification agent finds issues, suggests returning to Requirements agent.
   *
   * The coordinator may consider this hint but is not required to follow it.
   */
  suggestedNextAgent?: string | null;
}

/**
 * WorkflowContext (forward declaration for Agent interface)
 *
 * Full definition in workflow.types.ts
 * This is the shared data that flows through all agents.
 *
 * Design Decision: Strict interface (no index signature)
 * - Type safety: Prevents typos and ensures all fields are known
 * - Extensibility: Agents can extend this interface for their specific needs
 *
 * Q: Why forward declare instead of importing?
 * A: Avoid circular dependencies. workflow.types.ts imports this file.
 *
 * Example extension:
 *   interface RequirementsContext extends WorkflowContext {
 *     userRequest: string;
 *     conversationHistory: Message[];
 *   }
 */
export interface WorkflowContext {
  workflowId: string;
  userId: string;
  createdAt: Date;
}

/**
 * Type Guards (Utility)
 *
 * Helper functions to check types at runtime.
 * Q: Why needed?
 * A: TypeScript types disappear at runtime. Type guards let us validate actual data.
 */

export function isAgentResult<T>(value: unknown): value is AgentResult<T> {
  return typeof value === 'object' && value !== null && 'output' in value && 'activity' in value;
}

export function isAgentActivity(value: unknown): value is AgentActivity {
  return (
    typeof value === 'object' &&
    value !== null &&
    'agentName' in value &&
    'action' in value &&
    'status' in value &&
    'startTime' in value
  );
}
