/**
 * Anthropic Service
 *
 * Wrapper for Claude API calls with error handling and retry logic.
 * Provides a clean interface for agents to interact with Claude models.
 */

import Anthropic from '@anthropic-ai/sdk';
import config from '../../config/environment';

/**
 * Claude Model Options
 */
export enum ClaudeModel {
  HAIKU = 'claude-haiku-4-5-20251001',     // Fast, cheap - for conversations
  SONNET = 'claude-sonnet-4-6',            // Balanced - for analysis
  OPUS = 'claude-opus-4-6',               // Powerful - for synthesis
}

/**
 * Request parameters for Claude API
 */
export interface ClaudeRequest {
  model: ClaudeModel;
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Response from Claude API
 */
export interface ClaudeResponse {
  text: string;
  stopReason: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Anthropic Service
 *
 * Handles all interactions with Claude API.
 */
class AnthropicService {
  private client: Anthropic;
  private apiKey: string;

  constructor() {
    // Get API key from config
    this.apiKey = config.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY || '';

    if (!this.apiKey) {
      console.warn('⚠️  ANTHROPIC_API_KEY not configured - Claude features will not work');
    }

    // Initialize Anthropic client
    this.client = new Anthropic({
      apiKey: this.apiKey,
    });

    console.log('✅ Anthropic service initialized');
  }

  /**
   * Call Claude API
   *
   * @param request - Request parameters
   * @returns Claude's response
   */
  async callClaude(request: ClaudeRequest): Promise<ClaudeResponse> {
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    console.log(`🤖 Calling Claude ${request.model}...`);
    console.log(`📝 System prompt: ${request.systemPrompt.substring(0, 100)}...`);
    console.log(`💬 User message: ${request.userMessage.substring(0, 100)}...`);

    try {
      const startTime = Date.now();

      const response = await this.client.messages.create({
        model: request.model,
        system: request.systemPrompt,
        messages: [
          {
            role: 'user',
            content: request.userMessage,
          },
        ],
        max_tokens: request.maxTokens || 1024,
        temperature: request.temperature || 1.0,
      });

      const duration = Date.now() - startTime;

      // Extract text from response
      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => (block as any).text)
        .join('\n');

      const result: ClaudeResponse = {
        text,
        stopReason: response.stop_reason || 'unknown',
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };

      console.log(`✅ Claude responded in ${duration}ms`);
      console.log(`📊 Tokens: ${result.usage.inputTokens} in, ${result.usage.outputTokens} out`);
      console.log(`💰 Estimated cost: $${this.estimateCost(result.usage, request.model)}`);

      return result;
    } catch (error) {
      console.error('❌ Claude API error:', error);
      throw error;
    }
  }

  /**
   * Estimate cost of API call
   *
   * Based on Anthropic's pricing (as of Nov 2024):
   * - Haiku: $0.25 per 1M input tokens, $1.25 per 1M output tokens
   * - Sonnet: $3 per 1M input tokens, $15 per 1M output tokens
   * - Opus: $15 per 1M input tokens, $75 per 1M output tokens
   */
  private estimateCost(
    usage: { inputTokens: number; outputTokens: number },
    model: ClaudeModel
  ): string {
    let inputCostPer1M = 0;
    let outputCostPer1M = 0;

    switch (model) {
      case ClaudeModel.HAIKU:
        inputCostPer1M = 0.80;
        outputCostPer1M = 4.0;
        break;
      case ClaudeModel.SONNET:
        inputCostPer1M = 3.0;
        outputCostPer1M = 15.0;
        break;
      case ClaudeModel.OPUS:
        inputCostPer1M = 15.0;
        outputCostPer1M = 75.0;
        break;
    }

    const inputCost = (usage.inputTokens / 1_000_000) * inputCostPer1M;
    const outputCost = (usage.outputTokens / 1_000_000) * outputCostPer1M;
    const totalCost = inputCost + outputCost;

    return totalCost.toFixed(6);
  }

  /**
   * Stream Claude API response token-by-token
   *
   * @param request - Request parameters (same as callClaude)
   * @yields Text chunks as they arrive from the model
   */
  async *stream(request: ClaudeRequest): AsyncIterable<string> {
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    console.log(`🚀 Starting Claude stream ${request.model}...`);

    const stream = this.client.messages.stream({
      model: request.model,
      system: request.systemPrompt,
      messages: [{ role: 'user', content: request.userMessage }],
      max_tokens: request.maxTokens || 1024,
      temperature: request.temperature || 1.0,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }

  /**
   * Check if Anthropic service is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}


// Export singleton instance
export const anthropicService = new AnthropicService();


