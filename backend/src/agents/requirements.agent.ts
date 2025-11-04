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

import {
  Agent,
  AgentMetadata,
  AgentResult,
  ReflectionResult,
} from './types/agent.types';
import { WorkflowContext } from './types/workflow.types';
import { anthropicService, ClaudeModel } from './services/anthropic.service';

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
    location: {
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
    model: 'claude-3-haiku-20240307',
    tools: [],
    maxTokens: 1024,
    temperature: 0.7,
    systemPrompt: this.buildSystemPrompt(),
  };

  /**
   * Build system prompt for requirements gathering
   */
  private buildSystemPrompt(): string {
    return `You are a requirements gathering assistant for a domestic services platform.

Your job is to extract complete service booking requirements from users through natural conversation.

**Required Information:**
1. Service Type: What service do they need? (cleaning, plumbing, electrical, etc.)
2. Location: Where does the service need to be performed?
3. Timing: When do they need the service? (date, time, flexibility)
4. Budget: What is their budget range? (optional but helpful)
5. Special Requirements: Any specific needs, preferences, or constraints?
6. Urgency: How urgent is the request?

**Your Response Format:**
You must respond with a JSON object in one of two formats:

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
    "location": { "city": "San Francisco", "state": "CA" },
    "timing": { "preferredDate": "2024-11-15", "isFlexible": true },
    "budget": { "max": 200, "hasFlexibility": true },
    "specialRequirements": ["emergency", "drain cleaning"],
    "urgency": "high"
  },
  "extractedFacts": ["kitchen sink clogged", "SF location", "flexible on exact time"],
  "missingInformation": []
}

**Conversation Style:**
- Be friendly and concise
- Ask ONE focused question at a time
- Acknowledge information the user provides
- Don't ask for information they've already given
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
    console.log(`📋 RequirementsAgent.process() called (turn ${input.currentTurn || 1})`);
    const startTime = Date.now();

    // Build conversation context
    const conversationContext = this.buildConversationContext(input);

    // Call Claude Haiku for conversational response
    const userMessage = `Initial request: "${input.userRequest}"

${conversationContext}

Analyze the conversation and respond with JSON following the format specified in your system prompt.`;

    try {
      const response = await anthropicService.callClaude({
        model: ClaudeModel.HAIKU,
        systemPrompt: this.metadata.systemPrompt,
        userMessage,
        maxTokens: this.metadata.maxTokens,
        temperature: this.metadata.temperature,
      });

      // Parse Claude's JSON response
      const output = this.parseClaudeResponse(response.text);
      const executionTimeMs = Date.now() - startTime;

      console.log(`✅ RequirementsAgent completed in ${executionTimeMs}ms`);
      console.log(`📊 Requirements ${output.isComplete ? 'COMPLETE' : 'INCOMPLETE'}`);
      if (!output.isComplete) {
        console.log(`❓ Follow-up: "${output.followUpQuestion?.substring(0, 80)}..."`);
      }

      return {
        success: true,
        output,
        metadata: {
          executionTimeMs,
          tokensUsed: response.usage.inputTokens + response.usage.outputTokens,
          modelUsed: ClaudeModel.HAIKU,
          confidence: this.calculateConfidence(output),
        },
        suggestedNextAgent: output.isComplete ? 'search' : null, // Continue to search if complete
      };
    } catch (error: any) {
      console.error('❌ RequirementsAgent error:', error.message);

      return {
        success: false,
        output: this.getErrorOutput(),
        errors: [error.message],
        metadata: {
          executionTimeMs: Date.now() - startTime,
          tokensUsed: 0,
          modelUsed: ClaudeModel.HAIKU,
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
    console.log('🔍 RequirementsAgent.reflect() called');

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
    const confidence = 1.0 - (criticalFieldsMissing.length * 0.2);

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
      // Extract JSON from response (Claude might add markdown code blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Claude response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate structure
      if (typeof parsed.isComplete !== 'boolean') {
        throw new Error('Invalid response: missing isComplete field');
      }

      return parsed as RequirementsAgentOutput;
    } catch (error: any) {
      console.error('❌ Failed to parse Claude response:', text);
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
      followUpQuestion: 'I apologize, but I encountered an error. Could you please repeat your service request?',
      extractedFacts: [],
      missingInformation: ['all information'],
    };
  }
}

// Export singleton instance
export const requirementsAgent = new RequirementsAgent();
