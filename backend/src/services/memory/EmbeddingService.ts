import { VoyageAIClient } from 'voyageai';
import { memoryConfig } from '@/config/memory';
import logger from '@/config/logger';

// ── Provider interface ────────────────────────────────────────────────────────
// Abstraction so we can swap Voyage for any other provider without touching
// call sites. The only contract: text in, float[] out.

export interface EmbeddingProvider {
  readonly dimensions: number;
  readonly model: string;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

// ── Cosine similarity utility ─────────────────────────────────────────────────
// Used by the Deduper and MemoryRetriever. Pure function, no I/O.

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('Vector dimension mismatch');
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Format embedding for pgvector ─────────────────────────────────────────────
// pgvector expects the string '[0.1,0.2,...]' format

export function formatEmbeddingForPg(embedding: number[]): string {
  return '[' + embedding.join(',') + ']';
}

// ── Voyage AI implementation ──────────────────────────────────────────────────

class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 1024;
  readonly model: string;
  private client: VoyageAIClient;

  constructor() {
    this.model = memoryConfig.embedding.model;
    this.client = new VoyageAIClient({ apiKey: memoryConfig.embedding.apiKey });
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const { batchSize } = memoryConfig.embedding;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const chunk = texts.slice(i, i + batchSize);
      logger.debug(`Embedding batch ${i / batchSize + 1}: ${chunk.length} texts via ${this.model}`);
      allEmbeddings.push(...(await this.embedWithBackoff(chunk)));
    }

    return allEmbeddings;
  }

  private async embedWithBackoff(texts: string[], attempt = 1): Promise<number[][]> {
    try {
      const response = await this.client.embed({ model: this.model, input: texts });
      const embeddings = response.data?.map((item: any) => item.embedding as number[]);
      if (!embeddings) throw new Error('Voyage API returned no embeddings');
      return embeddings;
    } catch (err: any) {
      // Retry on 429 rate limit with exponential backoff (max 3 attempts)
      if (attempt < 3 && (err?.statusCode === 429 || err?.rawResponse?.status === 429)) {
        const delayMs = Math.pow(2, attempt) * 1000; // 2s, 4s
        logger.warn(
          `[EmbeddingService] rate limited, retrying in ${delayMs}ms (attempt ${attempt})`
        );
        await new Promise((r) => setTimeout(r, delayMs));
        return this.embedWithBackoff(texts, attempt + 1);
      }
      throw err;
    }
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────
// Lazily initialized so tests can construct with a mock provider.

let _provider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!_provider) {
    if (!memoryConfig.embedding.apiKey) {
      throw new Error('VOYAGE_API_KEY is not set — memory embedding unavailable');
    }
    _provider = new VoyageEmbeddingProvider();
  }
  return _provider;
}

// Allows tests to inject a mock provider
export function setEmbeddingProvider(provider: EmbeddingProvider): void {
  _provider = provider;
}
