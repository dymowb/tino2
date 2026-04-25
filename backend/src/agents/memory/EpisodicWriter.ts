import { MemoryDataSource, isMemoryEnabled } from '@/config/memoryDatabase';
import { MemoryWriteLog } from '@/models/memory';
import { memoryConfig } from '@/config/memory';
import { getEmbeddingProvider, formatEmbeddingForPg } from '@/services/memory/EmbeddingService';
import logger from '@/config/logger';

export interface EpisodicWriteParams {
  userId: string;
  workflowId: string;
  summary: string;
  importance: number;
  bookingId?: string | null;
  occurredAt?: Date;
}

export class EpisodicWriter {
  /**
   * Embed an episodic summary and persist it to the episodic_memories table.
   * Returns the new episode ID, or null if the write was skipped/failed.
   */
  async write(params: EpisodicWriteParams): Promise<string | null> {
    if (!isMemoryEnabled() || !MemoryDataSource.isInitialized) return null;
    if (!params.summary.trim()) return null;

    try {
      const embedding = await getEmbeddingProvider().embed(params.summary);
      const pgEmbedding = formatEmbeddingForPg(embedding);

      const occurredAt = params.occurredAt ?? new Date();
      const expiresAt = new Date(occurredAt);
      expiresAt.setDate(expiresAt.getDate() + memoryConfig.ttl.episodicDays);

      const rows: { id: string }[] = await MemoryDataSource.query(
        `INSERT INTO episodic_memories
                (user_id, summary, embedding, workflow_id, booking_id, importance, occurred_at, expires_at)
         VALUES ($1, $2, $3::vector, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          params.userId,
          params.summary,
          pgEmbedding,
          params.workflowId,
          params.bookingId ?? null,
          Math.min(1, Math.max(0, params.importance)),
          occurredAt,
          expiresAt,
        ],
      );

      const episodeId = rows[0].id;

      await this.log(params.userId, episodeId, params.summary, params.workflowId);

      logger.debug(`[EpisodicWriter] created episode ${episodeId} for user ${params.userId}: "${params.summary.slice(0, 80)}"`);
      return episodeId;
    } catch (err) {
      logger.error('[EpisodicWriter] write failed', err);
      return null;
    }
  }

  private async log(userId: string, episodeId: string, summary: string, workflowId: string): Promise<void> {
    try {
      const repo = MemoryDataSource.getRepository(MemoryWriteLog);
      await repo.save(
        repo.create({
          userId,
          memoryType: 'episodic',
          action: 'created',
          memoryId: episodeId,
          sourceContent: workflowId,
          extractedContent: summary,
          dedupDecision: { reason: 'episodic_write' },
        }),
      );
    } catch (err) {
      logger.error('[EpisodicWriter] Failed to write memory log', err);
    }
  }
}

export const episodicWriter = new EpisodicWriter();
