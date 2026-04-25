import { MemoryDataSource, isMemoryEnabled } from '@/config/memoryDatabase';
import { memoryConfig } from '@/config/memory';
import { getEmbeddingProvider, formatEmbeddingForPg } from './EmbeddingService';
import logger from '@/config/logger';

export interface SemanticResult {
  id: string;
  content: string;
  score: number;
}

export interface EpisodicResult {
  id: string;
  summary: string;
  occurredAt: Date;
  score: number;
}

export interface ProceduralResult {
  id: string;
  promptFragment: string;
  confidence: number;
}

export interface RetrievedMemories {
  semantic: SemanticResult[];
  episodic: EpisodicResult[];
  procedural: ProceduralResult[];
  hasAny: boolean;
}

const EMPTY_RESULT: RetrievedMemories = { semantic: [], episodic: [], procedural: [], hasAny: false };

interface RawSemanticRow {
  id: string;
  content: string;
  confidence: string | number;
  access_count: string | number;
  last_accessed_at: string | null;
  similarity: string | number;
}

interface RawEpisodicRow {
  id: string;
  summary: string;
  occurred_at: string;
  importance: string | number;
  access_count: string | number;
  last_accessed_at: string | null;
  similarity: string | number;
}

interface RawProceduralRow {
  id: string;
  prompt_fragment: string;
  confidence: string | number;
}

export class MemoryRetriever {
  async retrieve(query: string, userId: string, workflowId: string): Promise<RetrievedMemories> {
    if (!isMemoryEnabled() || !MemoryDataSource.isInitialized) return EMPTY_RESULT;

    try {
      const embedding = await getEmbeddingProvider().embed(query);
      const pgEmbedding = formatEmbeddingForPg(embedding);

      const [semantic, episodic, procedural] = await Promise.all([
        this.fetchSemantic(pgEmbedding, userId),
        this.fetchEpisodic(pgEmbedding, userId),
        this.fetchProcedural(userId),
      ]);

      const result: RetrievedMemories = {
        semantic,
        episodic,
        procedural,
        hasAny: semantic.length > 0 || episodic.length > 0 || procedural.length > 0,
      };

      // Fire-and-forget: access stats + retrieval log must not delay the agent
      this.updateAccessStats(semantic.map(s => s.id), 'semantic_memories')
        .catch(err => logger.error('[MemoryRetriever] semantic access update failed', err));
      this.updateAccessStats(episodic.map(e => e.id), 'episodic_memories')
        .catch(err => logger.error('[MemoryRetriever] episodic access update failed', err));
      this.logRetrieval(userId, query, pgEmbedding, result, workflowId)
        .catch(err => logger.error('[MemoryRetriever] retrieval log failed', err));

      logger.debug(`[MemoryRetriever] query="${query.slice(0, 60)}" → ${semantic.length}s ${episodic.length}e ${procedural.length}p`);
      return result;
    } catch (err) {
      // Memory failures must never break the main workflow
      logger.error('[MemoryRetriever] retrieve failed — returning empty', err);
      return EMPTY_RESULT;
    }
  }

  /**
   * Hybrid scoring: weighted combination of similarity, recency, importance, and access popularity.
   *
   * Formula from ADR §Hybrid Retrieval Scoring Formula:
   *   score = α·sim + β·recency + γ·importance + δ·access_boost
   *
   * importance is normalised to [0,1] by capping raw value at 6.0
   * (= confidence=1.0 × (1 + log₂(1 + 30)) ≈ 5.9).
   */
  private hybridScore(
    sim: number,
    lastAccessedAt: string | null,
    confidence: number,
    accessCount: number,
    weights: { similarity: number; recency: number; importance: number; accessBoost: number },
  ): number {
    const λ = Math.log(2) / memoryConfig.retrieval.recencyHalfLifeDays;
    const daysSince = lastAccessedAt
      ? (Date.now() - new Date(lastAccessedAt).getTime()) / 86_400_000
      : 365;
    const recency = Math.exp(-λ * Math.max(daysSince, 0));
    const rawImportance = confidence * (1 + Math.log2(1 + accessCount));
    const normalizedImportance = Math.min(rawImportance / 6.0, 1.0);
    const accessBoost = Math.min(accessCount / 20, 1.0);

    return (
      sim * weights.similarity +
      recency * weights.recency +
      normalizedImportance * weights.importance +
      accessBoost * weights.accessBoost
    );
  }

  private async fetchSemantic(pgEmbedding: string, userId: string): Promise<SemanticResult[]> {
    const { topK, weights } = memoryConfig.retrieval.semantic;
    const rows: RawSemanticRow[] = await MemoryDataSource.query(
      `SELECT id, content, confidence, access_count, last_accessed_at,
              1 - (embedding <=> $1::vector) AS similarity
         FROM semantic_memories
        WHERE user_id = $2
          AND is_active = TRUE
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY embedding <=> $1::vector
        LIMIT $3`,
      [pgEmbedding, userId, topK * 3],
    );

    return rows
      .map(r => ({
        id: r.id,
        content: r.content,
        score: this.hybridScore(
          Number(r.similarity),
          r.last_accessed_at,
          Number(r.confidence),
          Number(r.access_count),
          weights,
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  private async fetchEpisodic(pgEmbedding: string, userId: string): Promise<EpisodicResult[]> {
    const { topK, weights } = memoryConfig.retrieval.episodic;
    const rows: RawEpisodicRow[] = await MemoryDataSource.query(
      `SELECT id, summary, occurred_at, importance, access_count, last_accessed_at,
              1 - (embedding <=> $1::vector) AS similarity
         FROM episodic_memories
        WHERE user_id = $2
          AND is_active = TRUE
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY embedding <=> $1::vector
        LIMIT $3`,
      [pgEmbedding, userId, topK * 3],
    );

    return rows
      .map(r => ({
        id: r.id,
        summary: r.summary,
        occurredAt: new Date(r.occurred_at),
        score: this.hybridScore(
          Number(r.similarity),
          r.last_accessed_at,
          Number(r.importance),
          Number(r.access_count),
          weights,
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  private async fetchProcedural(userId: string): Promise<ProceduralResult[]> {
    const rows: RawProceduralRow[] = await MemoryDataSource.query(
      `SELECT id, prompt_fragment, confidence
         FROM procedural_rules
        WHERE user_id = $1
          AND status = 'active'
        ORDER BY confidence DESC`,
      [userId],
    );
    return rows.map(r => ({
      id: r.id,
      promptFragment: r.prompt_fragment,
      confidence: Number(r.confidence),
    }));
  }

  private async updateAccessStats(ids: string[], table: string): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    await MemoryDataSource.query(
      `UPDATE ${table}
          SET access_count = access_count + 1, last_accessed_at = NOW()
        WHERE id IN (${placeholders})`,
      ids,
    );
  }

  private async logRetrieval(
    userId: string,
    queryText: string,
    queryEmbedding: string,
    result: RetrievedMemories,
    workflowId: string,
  ): Promise<void> {
    const results = {
      semanticIds: result.semantic.map(s => s.id),
      episodicIds: result.episodic.map(e => e.id),
      proceduralIds: result.procedural.map(p => p.id),
      scores: {
        semantic: result.semantic.map(s => ({ id: s.id, score: s.score })),
        episodic: result.episodic.map(e => ({ id: e.id, score: e.score })),
      },
    };
    await MemoryDataSource.query(
      `INSERT INTO memory_retrieval_log
              (user_id, query_text, query_embedding, memory_type, results, workflow_id)
       VALUES ($1, $2, $3::vector, 'hybrid', $4, $5)`,
      [userId, queryText, queryEmbedding, JSON.stringify(results), workflowId],
    );
  }
}

export const memoryRetriever = new MemoryRetriever();
