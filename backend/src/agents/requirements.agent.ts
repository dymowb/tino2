import { getLanguageInstruction } from './utils/locale';
/**
 * Requirements Agent
 *
 * Gathers detailed service requirements from users through conversational flow.
 * Uses Claude Haiku for fast, cost-effective conversational responses.
 *
 * Responsibilities:
 * - Analyze initial user request
 * - Identify missing information
 * - Ask targeted follow-up questions
 * - Build comprehensive requirements summary
 */

import { Agent, AgentMetadata, AgentResult, ReflectionResult } from './types/agent.types';
import { WorkflowContext } from './types/workflow.types';
import { aiGateway } from './services/ai-gateway.service';
import { parseLlmJson } from './utils/llm-json';
import logger from '../config/logger';

/**
 * Input for Requirements Agent
 */
export interface RequirementsAgentInput {
  userRequest: string;
  conversationHistory: Array<{
    agentName: string;
    timestamp: Date;
    output: any;
  }>;
  /** Multi-turn dialog messages (agent questions + user answers) */
  conversationMessages?: Array<{
    role: 'user' | 'agent';
    content: string;
    timestamp: Date;
  }>;
  /** Formatted <memory> block from ContextInjector, prepended to system prompt when present */
  memoryContext?: string;
  /** Formatted <constraints> block from active procedural rules — takes precedence over defaults */
  constraintContext?: string;
  locale?: string;
  currentTurn?: number;
}

/**
 * Output from Requirements Agent
 */
export interface RequirementsAgentOutput {
  isComplete: boolean;
  followUpQuestion?: string;
  requirementsSummary?: {
    serviceType: string;
    /**
     * Provider-facing summary of the job written from the full conversation —
     * captures the specific problem and nuances ("blocked toilet in the upstairs
     * bathroom, started yesterday") that don't map to the structured fields
     * below. This is what gets sent as the quote-request description, so the
     * provider understands the actual issue, not just "need a plumber".
     */
    description?: string;
    location: {
      neighborhood?: string;
      address?: string;
      city?: string;
      state?: string;
      zipCode?: string;
    };
    timing: {
      preferredDate?: string;
      preferredTime?: string;
      isFlexible: boolean;
    };
    budget?: {
      min?: number;
      max?: number;
      hasFlexibility: boolean;
    };
    specialRequirements: string[];
    urgency: 'low' | 'medium' | 'high' | 'emergency';
  };
  extractedFacts: string[];
  missingInformation: string[];
}

/**
 * Requirements Agent
 *
 * Conversational agent that extracts complete service requirements.
 */
class RequirementsAgent implements Agent<RequirementsAgentInput, RequirementsAgentOutput> {
  readonly metadata: AgentMetadata = {
    name: 'requirements-agent',
    description: 'Gathers service requirements through conversational flow',
    model: 'fast',
    tools: [],
    maxTokens: 1024,
    temperature: 0.7,
    systemPrompt: this.buildSystemPrompt(),
  };

  /**
   * Build system prompt for requirements gathering
   */
  private buildSystemPrompt(locale?: string): string {
    const today = new Date();
    const todayISO = today.toISOString().split('T')[0];
    const todayWeekday = today.toLocaleDateString('en-US', { weekday: 'long' });
    // Dynamic example date (today + 7d) so the example never anchors the model to a past year.
    const exampleDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    return `You are a requirements gathering assistant for a domestic services platform.
${getLanguageInstruction(locale)}

**Today's date is ${todayISO} (${todayWeekday}).** Use this as the reference for resolving any relative dates.

Your job is to extract complete service booking requirements from users through natural conversation.

**Required Information:**
1. Service Type: What service do they need? (cleaning, plumbing, electrical, etc.)
2. Location: Where does the service need to be performed?
3. Timing: When do they need the service? (date, time, flexibility). Always convert relative dates ("hoje", "amanhã", "esta semana", "próximo sábado", "sexta-feira", "next Saturday") to ISO format YYYY-MM-DD using the today's date given above as the anchor. For a bare weekday, pick the NEXT future occurrence of that weekday (never a past date). Leave blank if truly unknown.
4. Budget: What is their budget range? (optional but helpful)
5. Special Requirements: Any specific needs, preferences, or constraints?
6. Urgency: How urgent is the request? (must be one of: "low", "medium", "high", "emergency")

**Your Response Format:**
You must respond with a JSON object in one of two formats:

If you need more information, ask no more than three focused follow-up questions. We want to balance between gathering complete requirements and avoiding overwhelming the user with too many questions at once.

If you need more information:
{
  "isComplete": false,
  "followUpQuestion": "What specific service do you need?",
  "extractedFacts": ["user mentioned their kitchen sink is clogged"],
  "missingInformation": ["service type", "location", "timing"]
}

If you have all required information:
{
  "isComplete": true,
  "requirementsSummary": {
    "serviceType": "Plumbing",
    "description": "Kitchen sink is badly clogged and water is backing up; the customer has already tried a plunger without success and wants a professional to clear the drain.",
    "location": { "neighborhood": "Mission District", "city": "San Francisco", "state": "CA" },
    "timing": { "preferredDate": "${exampleDate}", "isFlexible": true },
    "budget": { "max": 200, "hasFlexibility": true },
    "specialRequirements": ["emergency", "drain cleaning"],
    "urgency": "high"
  },
  "extractedFacts": ["kitchen sink clogged", "SF location", "flexible on exact time"],
  "missingInformation": []
}

**The "description" field** is a 1-3 sentence, provider-facing summary of the actual job, synthesized from the WHOLE conversation. Include the specific problem and any nuances the customer mentioned (what is broken, where, since when, symptoms, constraints, access notes). Do NOT restate the location, date/time, or budget — those travel in their own fields. Write it in the same language as the conversation. This is the text a provider reads to understand the job, so make it concrete and useful even when the customer's first message was vague (e.g. "need a plumber" → describe the clog they later clarified).

**Memory Usage:**
If a <memory> block appears at the top of this system prompt, treat those facts as already known — do NOT ask for information already present in memory.
- If memory says the user lives in Lagoa da Conceição, treat location as known; populate city/neighborhood from memory.
- If memory says the user has a budget of R$200, treat budget as known.
- If memory says the user prefers Saturday mornings, treat timing preference as known.
- Only ask about information that is genuinely missing from BOTH the conversation AND memory.
- It is fine to mark requirements as complete using memory-derived values even if the user hasn't explicitly stated them in THIS conversation.

**Conversation Style:**
- Be friendly and concise
- Ask ONE focused question at a time
- Acknowledge information the user provides
- Don't ask for information they've already given (in memory OR the current conversation)
- Prioritize the most important missing information

**IMPORTANT:**
- Always respond with valid JSON only
- No additional text outside the JSON structure
- Be conversational in the followUpQuestion field`;
  }

  /**
   * Execute the agent (implements Agent interface)
   */
  async execute(
    input: RequirementsAgentInput,
    context: WorkflowContext
  ): Promise<AgentResult<RequirementsAgentOutput>> {
    logger.info(`RequirementsAgent.process() called (turn ${input.currentTurn || 1})`);
    const startTime = Date.now();
    const MAX_REFLECTION_ITERATIONS = 3;

    // Build conversation context
    const conversationContext = this.buildConversationContext(input);

    // Call Claude Haiku for conversational response
    const userMessage = `Initial request: "${input.userRequest}"

${conversationContext}

Analyze the conversation and respond with JSON following the format specified in your system prompt.`;

    try {
      let iterationCount = 0;
      let bestOutput: RequirementsAgentOutput | null = null;
      let totalTokensUsed = 0;
      let finalExecutionTimeMs = 0;
      while (iterationCount < MAX_REFLECTION_ITERATIONS) {
        // Layer order: constraints (mandatory) → memory (informational) → base instructions
        let systemPrompt = this.buildSystemPrompt(input.locale);
        if (input.memoryContext) systemPrompt = `${input.memoryContext}\n\n${systemPrompt}`;
        if (input.constraintContext) systemPrompt = `${input.constraintContext}\n\n${systemPrompt}`;

        if (iterationCount === 0) {
          if (input.constraintContext)
            logger.info(`[RequirementsAgent] Constraints injected:\n${input.constraintContext}`);
          if (input.memoryContext)
            logger.info(`[RequirementsAgent] Memory injected:\n${input.memoryContext}`);
        }

        const { value: response } = await aiGateway.generate('fast', {
          systemPrompt,
          userMessage,
          maxTokens: this.metadata.maxTokens,
          temperature: this.metadata.temperature,
        });

        // Parse Claude's JSON response
        const output = this.parseClaudeResponse(response.text);
        bestOutput = output;
        const executionTimeMs = Date.now() - startTime;
        totalTokensUsed += response.usage.inputTokens + response.usage.outputTokens; // ← Add
        finalExecutionTimeMs = executionTimeMs; // ← Add
        const reflection = await this.reflect(output, input);
        logger.debug(
          `Reflection: needsImprovement=${reflection.needsImprovement}, confidence=${reflection.confidence}`
        );
        // If output is good enough, we're done
        if (!reflection.needsImprovement) {
          logger.debug('Reflection satisfied - breaking early');
          break;
        }

        // Otherwise, log that we're retrying
        logger.debug(
          `Reflection suggests improvements (attempt ${iterationCount + 1}/${MAX_REFLECTION_ITERATIONS})`
        );
        iterationCount++;
      }

      return {
        success: true,
        output: bestOutput!,
        metadata: {
          executionTimeMs: finalExecutionTimeMs,
          tokensUsed: totalTokensUsed,
          modelUsed: this.metadata.model,
          confidence: this.calculateConfidence(bestOutput!),
        },
        suggestedNextAgent: bestOutput!.isComplete ? 'search' : null, // Continue to search if complete
      };
    } catch (error: any) {
      logger.error('RequirementsAgent error:', error.message);

      return {
        success: false,
        output: this.getErrorOutput(),
        errors: [error.message],
        metadata: {
          executionTimeMs: Date.now() - startTime,
          tokensUsed: 0,
          modelUsed: this.metadata.model,
          confidence: 0,
        },
        suggestedNextAgent: null,
      };
    }
  }

  /**
   * Reflect on the requirements output quality
   * Note: Parameters are (output, input) per Agent interface
   */
  async reflect(
    output: RequirementsAgentOutput,
    input: RequirementsAgentInput
  ): Promise<ReflectionResult> {
    logger.debug('RequirementsAgent.reflect() called');

    // If requirements are incomplete, no need to reflect deeply
    if (!output.isComplete) {
      return {
        needsImprovement: false,
        confidence: 0.8,
        reasoning: 'Requirements gathering in progress - conversation continuing normally',
        improvements: [],
      };
    }

    // Check if requirements summary has all critical fields
    const summary = output.requirementsSummary!;
    const criticalFieldsMissing: string[] = [];

    if (!summary.serviceType) criticalFieldsMissing.push('serviceType');
    if (!summary.location.city && !summary.location.zipCode) {
      criticalFieldsMissing.push('location');
    }
    if (!summary.timing.preferredDate && !summary.timing.isFlexible) {
      criticalFieldsMissing.push('timing');
    }

    const needsImprovement = criticalFieldsMissing.length > 0;
    const confidence = 1.0 - criticalFieldsMissing.length * 0.2;

    if (needsImprovement) {
      return {
        needsImprovement: true,
        confidence,
        reasoning: `Requirements marked as complete but missing critical fields: ${criticalFieldsMissing.join(', ')}`,
        improvements: criticalFieldsMissing.map(
          (field) => `Gather ${field} information before marking complete`
        ),
      };
    }

    return {
      needsImprovement: false,
      confidence: 0.95,
      reasoning: 'Requirements summary contains all critical information',
      improvements: [],
    };
  }

  /**
   * Build conversation context from history
   */
  private buildConversationContext(input: RequirementsAgentInput): string {
    // Prefer the richer conversationMessages (agent questions + user answers)
    if (input.conversationMessages && input.conversationMessages.length > 0) {
      const dialog = input.conversationMessages
        .map((msg) => `${msg.role === 'agent' ? 'Agent' : 'User'}: ${msg.content}`)
        .join('\n');
      return `Conversation so far:\n${dialog}`;
    }

    if (input.conversationHistory.length === 0) {
      return 'This is the first interaction.';
    }

    const history = input.conversationHistory
      .filter((entry) => entry.agentName === this.metadata.name)
      .map((entry, index) => {
        const output = entry.output as RequirementsAgentOutput;
        if (!output.isComplete && output.followUpQuestion) {
          return `Turn ${index + 1}: Asked "${output.followUpQuestion}"`;
        }
        return `Turn ${index + 1}: Gathered information`;
      })
      .join('\n');

    return `Conversation history:\n${history}`;
  }

  /**
   * Parse Claude's JSON response
   */
  private parseClaudeResponse(text: string): RequirementsAgentOutput {
    try {
      // Robust extraction: tolerate code fences, surrounding prose, trailing commas
      const parsed = parseLlmJson<any>(text, 'object');
      if (!parsed) {
        throw new Error('No parseable JSON found in Claude response');
      }

      // Validate structure
      if (typeof parsed.isComplete !== 'boolean') {
        throw new Error('Invalid response: missing isComplete field');
      }

      // Normalise: Claude sometimes returns followUpQuestions (array) instead of followUpQuestion (string)
      if (
        !parsed.followUpQuestion &&
        Array.isArray(parsed.followUpQuestions) &&
        parsed.followUpQuestions.length > 0
      ) {
        parsed.followUpQuestion = parsed.followUpQuestions[0];
      }

      return parsed as RequirementsAgentOutput;
    } catch (error: any) {
      logger.error('Failed to parse Claude response:', text);
      throw new Error(`JSON parsing failed: ${error.message}`);
    }
  }

  /**
   * Calculate confidence based on output completeness
   */
  private calculateConfidence(output: RequirementsAgentOutput): number {
    if (!output.isComplete) {
      return 0.7; // Medium confidence for follow-up questions
    }

    // Calculate based on how much information we have
    const summary = output.requirementsSummary!;
    let score = 0;

    if (summary.serviceType) score += 0.3;
    if (summary.location.city || summary.location.zipCode) score += 0.25;
    if (summary.timing.preferredDate) score += 0.2;
    if (summary.budget && summary.budget.max) score += 0.1;
    if (summary.specialRequirements.length > 0) score += 0.1;
    if (summary.urgency) score += 0.05;

    return Math.min(score, 1.0);
  }

  /**
   * Get error output when Claude API fails
   */
  private getErrorOutput(): RequirementsAgentOutput {
    return {
      isComplete: false,
      followUpQuestion:
        'I apologize, but I encountered an error. Could you please repeat your service request?',
      extractedFacts: [],
      missingInformation: ['all information'],
    };
  }
}

// Export singleton instance
export const requirementsAgent = new RequirementsAgent();
