import { MemoryDataSource } from '@/config/memoryDatabase';
import { MemoryWriteLog } from '@/models/memory';
import { memoryConfig } from '@/config/memory';
import { getEmbeddingProvider, formatEmbeddingForPg } from './EmbeddingService';
import logger from '@/config/logger';

export interface SemanticCandidate {
  content: string;
  confidence: number;
  importance: number;
}

export type DedupAction = 'created' | 'merged' | 'discarded';

export interface DedupResult {
  action: DedupAction;
  memoryId?: string;
}

interface NearestMemory {
  id: string;
  content: string;
  confidence: number;
  importance: number;
  access_count: number;
  similarity: number;
}

export class Deduper {
  async process(candidate: SemanticCandidate, userId: string, sourceContent?: string): Promise<DedupResult> {
    const { threshold, minConfidence } = memoryConfig.dedup;

    if (candidate.confidence < minConfidence) {
      await this.log({
        userId,
        action: 'discarded',
        sourceContent: sourceContent ?? candidate.content,
        extractedContent: candidate.content,
        dedupDecision: { reason: 'confidence_below_minimum', threshold: minConfidence, actual: candidate.confidence },
      });
      return { action: 'discarded' };
    }

    const embedding = await getEmbeddingProvider().embed(candidate.content);
    const pgEmbedding = formatEmbeddingForPg(embedding);

    // Parentheses around the OR are required — AND binds tighter
    const nearest: NearestMemory[] = await MemoryDataSource.query(
      `SELECT id, content, confidence, importance, access_count,
              1 - (embedding <=> $1::vector) AS similarity
         FROM semantic_memories
        WHERE user_id = $2
          AND is_active = TRUE
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY embedding <=> $1::vector
        LIMIT 5`,
      [pgEmbedding, userId],
    );

    const best = nearest[0];

    if (best && best.similarity >= threshold) {
      const newConfidence = best.confidence * 0.6 + candidate.confidence * 0.4;
      const newImportance = Math.max(best.importance, candidate.importance);

      await MemoryDataSource.query(
        `UPDATE semantic_memories
            SET confidence = $1, importance = $2, last_accessed_at = NOW(),
                access_count = access_count + 1
          WHERE id = $3`,
        [newConfidence, newImportance, best.id],
      );

      await this.log({
        userId,
        memoryId: best.id,
        action: 'merged',
        sourceContent: sourceContent ?? candidate.content,
        extractedContent: candidate.content,
        dedupDecision: {
          matchedId: best.id,
          matchedContent: best.content,
          similarity: best.similarity,
          threshold,
          oldConfidence: best.confidence,
          newConfidence,
        },
      });

      logger.debug(`[Deduper] merged "${candidate.content.slice(0, 60)}" → ${best.id} (sim=${best.similarity.toFixed(3)})`);
      return { action: 'merged', memoryId: best.id };
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + memoryConfig.ttl.semanticDays);

    const rows: { id: string }[] = await MemoryDataSource.query(
      `INSERT INTO semantic_memories
              (user_id, content, embedding, confidence, importance, source_type, expires_at)
       VALUES ($1, $2, $3::vector, $4, $5, 'extraction', $6)
       RETURNING id`,
      [userId, candidate.content, pgEmbedding, candidate.confidence, candidate.importance, expiresAt],
    );

    const memoryId = rows[0].id;

    await this.log({
      userId,
      memoryId,
      action: 'created',
      sourceContent: sourceContent ?? candidate.content,
      extractedContent: candidate.content,
      dedupDecision: best
        ? { nearestSimilarity: best.similarity, threshold, reason: 'below_threshold' }
        : { reason: 'no_existing_memories' },
    });

    logger.debug(`[Deduper] created memory ${memoryId}: "${candidate.content.slice(0, 60)}"`);
    return { action: 'created', memoryId };
  }

  private async log(params: {
    userId: string;
    memoryId?: string;
    action: DedupAction;
    sourceContent: string;
    extractedContent: string;
    dedupDecision: Record<string, unknown>;
  }): Promise<void> {
    try {
      const repo = MemoryDataSource.getRepository(MemoryWriteLog);
      await repo.save(
        repo.create({
          userId: params.userId,
          memoryType: 'semantic',
          action: params.action,
          memoryId: params.memoryId ?? null,
          sourceContent: params.sourceContent,
          extractedContent: params.extractedContent,
          dedupDecision: params.dedupDecision,
        }),
      );
    } catch (err) {
      logger.error('[Deduper] Failed to write memory log', err);
    }
  }
}

export const deduper = new Deduper();
