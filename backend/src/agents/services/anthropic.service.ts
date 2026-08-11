/**
 * Anthropic Service
 *
 * Wrapper for Claude API calls with error handling and retry logic.
 * Provides a clean interface for agents to interact with Claude models.
 */

import Anthropic from '@anthropic-ai/sdk';
import config from '../../config/environment';
import logger from '../../config/logger';

/**
 * Request parameters for Claude API
 */
export interface ClaudeRequest {
  model: string;
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
  /** Cancels the in-flight request so a caller timeout stops the spend, not just the wait. */
  signal?: AbortSignal;
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
      logger.warn('ANTHROPIC_API_KEY not configured - Claude features will not work');
    }

    // Initialize Anthropic client
    this.client = new Anthropic({
      apiKey: this.apiKey,
    });

    logger.info('Anthropic service initialized');
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

    logger.debug(`Calling Claude ${request.model}...`);
    logger.debug(`System prompt: ${request.systemPrompt.substring(0, 100)}...`);
    logger.debug(`User message: ${request.userMessage.substring(0, 100)}...`);

    try {
      const startTime = Date.now();

      const response = await this.client.messages.create(
        {
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
        },
        { signal: request.signal }
      );

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

      logger.info(`Claude responded in ${duration}ms`);
      logger.info(`Tokens: ${result.usage.inputTokens} in, ${result.usage.outputTokens} out`);

      return result;
    } catch (error) {
      logger.error('Claude API error:', error);
      throw error;
    }
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

    logger.debug(`Starting Claude stream ${request.model}...`);

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
