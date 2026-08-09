import OpenAI from 'openai';
import { VoyageAIClient } from 'voyageai';
import logger from '@/config/logger';
import { getAiSetting } from '@/services/AiConfigurationService';

export type EmbeddingProviderName = 'openai' | 'voyage';

export interface EmbeddingTarget {
  provider: EmbeddingProviderName;
  model: string;
}

export interface EmbeddingProvider {
  readonly dimensions: number;
  readonly model: string;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface EmbeddingAdapter {
  isConfigured(): boolean;
  embed(model: string, texts: string[], dimensions: number): Promise<number[][]>;
}

export function parseEmbeddingChain(value?: string): EmbeddingTarget[] {
  const raw = value?.trim();
  if (!raw) throw new Error('AI_EMBEDDING_CHAIN is required when memory is enabled');
  return raw.split(',').map((entry) => {
    const separator = entry.indexOf(':');
    if (separator < 1 || separator === entry.length - 1) {
      throw new Error(`Invalid embedding target "${entry.trim()}"; expected provider:model`);
    }
    const provider = entry.slice(0, separator).trim().toLowerCase();
    const model = entry.slice(separator + 1).trim();
    if (provider !== 'openai' && provider !== 'voyage') {
      throw new Error(`Unsupported embedding provider "${provider}"`);
    }
    return { provider, model } as EmbeddingTarget;
  });
}

export function getEmbeddingDimensions(): number {
  const dimensions = Number(process.env.AI_EMBEDDING_DIMENSIONS);
  if (!Number.isInteger(dimensions) || dimensions < 1) {
    throw new Error('AI_EMBEDDING_DIMENSIONS must be a positive integer');
  }
  return dimensions;
}

class VoyageAdapter implements EmbeddingAdapter {
  private client?: VoyageAIClient;

  isConfigured(): boolean {
    return !!process.env.VOYAGE_API_KEY;
  }

  async embed(model: string, texts: string[], _dimensions: number): Promise<number[][]> {
    if (!this.isConfigured()) throw new Error('VOYAGE_API_KEY not configured');
    this.client ||= new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY });
    const response = await this.client.embed({ model, input: texts });
    const embeddings = response.data?.map((item: any) => item.embedding as number[]);
    if (!embeddings) throw new Error('Voyage API returned no embeddings');
    return embeddings;
  }
}

class OpenAiEmbeddingAdapter implements EmbeddingAdapter {
  private client?: OpenAI;

  isConfigured(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  async embed(model: string, texts: string[], dimensions: number): Promise<number[][]> {
    if (!this.isConfigured()) throw new Error('OPENAI_API_KEY not configured');
    this.client ||= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await this.client.embeddings.create({ model, input: texts, dimensions });
    return response.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
  }
}

export class EmbeddingGateway implements EmbeddingProvider {
  readonly dimensions: number;
  readonly model: string;
  private readonly targets: EmbeddingTarget[];
  private readonly batchSize: number;

  constructor(
    targets = parseEmbeddingChain(getAiSetting('embedding')),
    dimensions = getEmbeddingDimensions(),
    private readonly adapters: Record<EmbeddingProviderName, EmbeddingAdapter> = {
      openai: new OpenAiEmbeddingAdapter(),
      voyage: new VoyageAdapter(),
    }
  ) {
    this.targets = targets;
    this.dimensions = dimensions;
    this.model = targets.map((target) => `${target.provider}:${target.model}`).join(',');
    this.batchSize = Math.max(1, Number(process.env.AI_EMBEDDING_BATCH_SIZE || 8));
  }

  async embed(text: string): Promise<number[]> {
    return (await this.embedBatch([text]))[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    const output: number[][] = [];
    for (let index = 0; index < texts.length; index += this.batchSize) {
      output.push(...(await this.embedChunk(texts.slice(index, index + this.batchSize))));
    }
    return output;
  }

  private async embedChunk(texts: string[]): Promise<number[][]> {
    const retries = Math.max(0, Number(process.env.AI_EMBEDDING_RETRIES_PER_MODEL || 0));
    const timeoutMs = Math.max(1000, Number(process.env.AI_EMBEDDING_TIMEOUT_MS || 30000));
    let lastError: unknown;

    for (const target of this.targets) {
      const adapter = this.adapters[target.provider];
      if (!adapter.isConfigured()) {
        logger.warn(`Skipping unconfigured embedding provider ${target.provider}`);
        continue;
      }
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          const embeddings = await this.withTimeout(
            adapter.embed(target.model, texts, this.dimensions),
            timeoutMs
          );
          if (embeddings.length !== texts.length) throw new Error('Embedding count mismatch');
          if (embeddings.some((embedding) => embedding.length !== this.dimensions)) {
            throw new Error(`Embedding dimensions must equal ${this.dimensions}`);
          }
          logger.info('Embedding gateway request succeeded', {
            provider: target.provider,
            model: target.model,
            count: texts.length,
            attempt: attempt + 1,
          });
          return embeddings;
        } catch (error) {
          lastError = error;
          logger.warn('Embedding gateway attempt failed', {
            provider: target.provider,
            model: target.model,
            attempt: attempt + 1,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('No configured embedding provider completed the request');
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Embedding request timed out after ${timeoutMs}ms`)),
            timeoutMs
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('Vector dimension mismatch');
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
}

export function formatEmbeddingForPg(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

let provider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  provider ||= new EmbeddingGateway();
  return provider;
}

export function setEmbeddingProvider(nextProvider: EmbeddingProvider): void {
  provider = nextProvider;
}

export function resetEmbeddingProvider(): void {
  provider = null;
}

export function validateEmbeddingConfiguration(): void {
  parseEmbeddingChain(getAiSetting('embedding'));
  getEmbeddingDimensions();
}
