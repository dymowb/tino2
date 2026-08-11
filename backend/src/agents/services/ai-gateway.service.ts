import OpenAI from 'openai';
import logger from '../../config/logger';
import { anthropicService } from './anthropic.service';
import { getAiSetting } from '@/services/AiConfigurationService';

export type AiProviderName = 'anthropic' | 'openai';
export type AiProfileName = 'fast' | 'reasoning' | 'synthesis';

export interface AiModelTarget {
  provider: AiProviderName;
  model: string;
}

export interface AiTextRequest {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
  /**
   * Cancels the in-flight provider request. Without this a caller-side timeout
   * only stops *waiting* — the model call keeps running and billing, and any
   * resource the caller frees on timeout (a lock, a queue slot) can be taken
   * while the abandoned call is still burning tokens.
   */
  signal?: AbortSignal;
}

export interface AiTextResponse {
  text: string;
  finishReason: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface AiProviderAdapter {
  isConfigured(): boolean;
  generate(model: string, request: AiTextRequest): Promise<AiTextResponse>;
  stream(model: string, request: AiTextRequest): AsyncIterable<string>;
}

export interface AiGatewayResult<T> {
  value: T;
  provider: AiProviderName;
  model: string;
  attempts: number;
}

export function parseModelChain(value?: string): AiModelTarget[] {
  const raw = value?.trim();
  if (!raw) {
    throw new Error(
      'REBOOK_AI_MODEL_CHAIN is required and must contain at least one provider:model'
    );
  }
  const targets = raw.split(',').map((entry) => {
    const separator = entry.indexOf(':');
    if (separator < 1 || separator === entry.length - 1) {
      throw new Error(`Invalid AI model target "${entry.trim()}"; expected provider:model`);
    }
    const provider = entry.slice(0, separator).trim().toLowerCase();
    const model = entry.slice(separator + 1).trim();
    if (provider !== 'anthropic' && provider !== 'openai') {
      throw new Error(`Unsupported AI provider "${provider}"`);
    }
    return { provider, model } as AiModelTarget;
  });
  if (!targets.length) throw new Error('AI model chain cannot be empty');
  return targets;
}

class AnthropicAdapter implements AiProviderAdapter {
  isConfigured(): boolean {
    return anthropicService.isConfigured();
  }

  async generate(model: string, request: AiTextRequest): Promise<AiTextResponse> {
    const response = await anthropicService.callClaude({
      ...request,
      model,
    });
    return {
      text: response.text,
      finishReason: response.stopReason,
      usage: response.usage,
    };
  }

  async *stream(model: string, request: AiTextRequest): AsyncIterable<string> {
    yield* anthropicService.stream({ ...request, model });
  }
}

class OpenAiAdapter implements AiProviderAdapter {
  private client?: OpenAI;

  isConfigured(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  async generate(model: string, request: AiTextRequest): Promise<AiTextResponse> {
    if (!this.isConfigured()) throw new Error('OPENAI_API_KEY not configured');
    this.client ||= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await this.client.responses.create(
      {
        model,
        instructions: request.systemPrompt,
        input: request.userMessage,
        max_output_tokens: request.maxTokens,
      },
      { signal: request.signal }
    );
    return {
      text: response.output_text,
      finishReason: response.status || 'unknown',
      usage: {
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
      },
    };
  }

  async *stream(model: string, request: AiTextRequest): AsyncIterable<string> {
    if (!this.isConfigured()) throw new Error('OPENAI_API_KEY not configured');
    this.client ||= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const stream = await this.client.responses.create({
      model,
      instructions: request.systemPrompt,
      input: request.userMessage,
      max_output_tokens: request.maxTokens,
      stream: true,
    });
    for await (const event of stream) {
      if (event.type === 'response.output_text.delta') yield event.delta;
    }
  }
}

export class AiGateway {
  constructor(
    private readonly adapters: Record<AiProviderName, AiProviderAdapter> = {
      anthropic: new AnthropicAdapter(),
      openai: new OpenAiAdapter(),
    }
  ) {}

  async generate(
    profile: AiProfileName,
    request: AiTextRequest
  ): Promise<AiGatewayResult<AiTextResponse>> {
    return this.execute({
      request,
      targets: getAiProfileChain(profile),
      validate: (response) => response,
    });
  }

  async *stream(profile: AiProfileName, request: AiTextRequest): AsyncIterable<string> {
    const targets = getAiProfileChain(profile);
    let lastError: unknown;
    for (const target of targets) {
      const adapter = this.adapters[target.provider];
      if (!adapter.isConfigured()) continue;
      let emitted = false;
      try {
        for await (const chunk of adapter.stream(target.model, request)) {
          emitted = true;
          yield chunk;
        }
        return;
      } catch (error) {
        lastError = error;
        logger.warn('AI gateway stream failed', {
          provider: target.provider,
          model: target.model,
          emitted,
          error: error instanceof Error ? error.message : String(error),
        });
        if (emitted) throw error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('No configured AI stream provider');
  }

  async execute<T>(options: {
    request: AiTextRequest;
    targets: AiModelTarget[];
    validate: (response: AiTextResponse) => T;
    retriesPerModel?: number;
    timeoutMs?: number;
  }): Promise<AiGatewayResult<T>> {
    const retries = Math.max(
      0,
      options.retriesPerModel ?? Number(process.env.AI_GATEWAY_RETRIES_PER_MODEL || 0)
    );
    const timeoutMs = Math.max(
      1000,
      options.timeoutMs ?? Number(process.env.AI_GATEWAY_TIMEOUT_MS || 30000)
    );
    let attempts = 0;
    let lastError: unknown;

    for (const target of options.targets) {
      const adapter = this.adapters[target.provider];
      if (!adapter.isConfigured()) {
        logger.warn(`Skipping unconfigured AI provider ${target.provider}`);
        continue;
      }
      for (let retry = 0; retry <= retries; retry += 1) {
        attempts += 1;
        try {
          const response = await this.withTimeout(
            adapter.generate(target.model, options.request),
            timeoutMs
          );
          const value = options.validate(response);
          logger.info('AI gateway request succeeded', {
            provider: target.provider,
            model: target.model,
            attempts,
          });
          return { value, provider: target.provider, model: target.model, attempts };
        } catch (error) {
          lastError = error;
          logger.warn('AI gateway attempt failed', {
            provider: target.provider,
            model: target.model,
            attempt: retry + 1,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('No configured AI provider completed the request');
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`AI request timed out after ${timeoutMs}ms`)),
            timeoutMs
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

export const aiGateway = new AiGateway();

export function getAiProfileChain(profile: AiProfileName): AiModelTarget[] {
  const value = getAiSetting(profile);
  if (!value?.trim()) throw new Error(`${profile} AI model chain is required`);
  return parseModelChain(value);
}

export function getRebookModelChain(): AiModelTarget[] {
  return parseModelChain(getAiSetting('rebook'));
}

export function validateAiConfiguration(): void {
  (['fast', 'reasoning', 'synthesis'] as AiProfileName[]).forEach(getAiProfileChain);
}
