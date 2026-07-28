import cron from 'node-cron';
import { MemoryDataSource, isMemoryEnabled } from '@/config/memoryDatabase';
import { ProceduralRule } from '@/models/memory/ProceduralRule';
import { memoryConfig } from '@/config/memory';
import { reflectionAgent, EpisodeSummary } from '@/agents/memory/ReflectionAgent';
import { deduper, SemanticCandidate } from '@/services/memory/Deduper';
import { scrubPii } from '@/services/memory/PiiScrubber';
import { getEmbeddingProvider, formatEmbeddingForPg } from '@/services/memory/EmbeddingService';
import logger from '@/config/logger';

// ── Per-user reflection runner ─────────────────────────────────────────────────

export interface ReflectionRunResult {
  userId: string;
  episodesProcessed: number;
  semanticFactsWritten: number;
  rulesCreated: number;
  rulesQueued: number;
  rulesDiscarded: number;
}

export async function runReflectionForUser(userId: string): Promise<ReflectionRunResult> {
  const result: ReflectionRunResult = {
    userId,
    episodesProcessed: 0,
    semanticFactsWritten: 0,
    rulesCreated: 0,
    rulesQueued: 0,
    rulesDiscarded: 0,
  };

  if (!isMemoryEnabled() || !MemoryDataSource.isInitialized) return result;

  // Fetch unreflected episodes, newest-first up to the configured cap
  const rows: Array<{ id: string; summary: string; occurred_at: Date; importance: number }> =
    await MemoryDataSource.query(
      `SELECT id, summary, occurred_at, importance
         FROM episodic_memories
        WHERE user_id = $1
          AND is_active = TRUE
          AND reflected_at IS NULL
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY occurred_at DESC
        LIMIT $2`,
      [userId, memoryConfig.reflection.maxEpisodesPerRun]
    );

  if (rows.length < memoryConfig.reflection.minEpisodesForReflection) {
    logger.debug(
      `[ReflectionJob] user=${userId}: ${rows.length} unreflected episodes — below threshold (${memoryConfig.reflection.minEpisodesForReflection}), skipping`
    );
    return result;
  }

  result.episodesProcessed = rows.length;
  const episodes: EpisodeSummary[] = rows.map((r) => ({
    id: r.id,
    summary: r.summary,
    occurredAt: r.occurred_at,
    importance: r.importance,
  }));

  const episodeIds = episodes.map((e) => e.id);

  // ── Call the reflection agent ──────────────────────────────────────────────
  const output = await reflectionAgent.analyze(episodes, userId);

  // ── Semantic facts → dedup pipeline (same path as ExtractionAgent) ─────────
  for (const fact of output.semanticFacts) {
    try {
      const scrubbed = scrubPii(fact.content);
      const candidate: SemanticCandidate = {
        content: scrubbed.text,
        confidence: fact.confidence,
        importance: fact.importance,
      };
      const dedupResult = await deduper.process(candidate, userId, fact.content);
      if (dedupResult.action !== 'discarded') {
        result.semanticFactsWritten++;
      }
    } catch (err) {
      logger.error(`[ReflectionJob] semantic fact write failed for user ${userId}`, err);
    }
  }

  // ── Procedural rules ───────────────────────────────────────────────────────
  const { autoApproveThreshold, queueThreshold } = memoryConfig.procedural;

  for (const rule of output.proceduralRules) {
    try {
      if (rule.confidence < queueThreshold) {
        result.rulesDiscarded++;
        logger.debug(
          `[ReflectionJob] rule discarded (conf=${rule.confidence.toFixed(2)} < ${queueThreshold}): "${rule.ruleText.slice(0, 60)}"`
        );
        continue;
      }

      // Dedup: check if a similar rule already exists for this user
      const existing = await findSimilarRule(userId, rule.promptFragment);
      if (existing) {
        // Update confidence and re-activate if deprecated
        const newConf = Math.min(1, existing.confidence * 0.6 + rule.confidence * 0.4);
        const repo = MemoryDataSource.getRepository(ProceduralRule);
        await repo.update(existing.id, {
          confidence: newConf,
          sourceEpisodeIds: mergeIds(existing.sourceEpisodeIds, rule.sourceEpisodeIds),
          version: existing.version + 1,
          ...(existing.status === 'deprecated' ? { status: 'pending', deprecatedAt: null } : {}),
        });
        logger.debug(`[ReflectionJob] merged rule ${existing.id} (new conf=${newConf.toFixed(2)})`);
        result.rulesQueued++;
        continue;
      }

      // Insert new rule
      const status = rule.confidence >= autoApproveThreshold ? 'active' : 'pending';
      const autoApproved = rule.confidence >= autoApproveThreshold;

      // Embed the prompt fragment for future similarity searches
      const embedding = await getEmbeddingProvider().embed(rule.promptFragment);
      const pgEmbedding = formatEmbeddingForPg(embedding);

      const inserted: { id: string }[] = await MemoryDataSource.query(
        `INSERT INTO procedural_rules
                (user_id, rule_text, prompt_fragment, embedding, confidence, status,
                 source_episode_ids, auto_approved, approval_threshold_used,
                 activated_at)
         VALUES ($1, $2, $3, $4::vector, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          userId,
          rule.ruleText,
          rule.promptFragment,
          pgEmbedding,
          rule.confidence,
          status,
          rule.sourceEpisodeIds.length > 0 ? rule.sourceEpisodeIds : null,
          autoApproved,
          autoApproveThreshold,
          autoApproved ? new Date() : null,
        ]
      );

      logger.info(
        `[ReflectionJob] rule ${inserted[0].id} ${status} (conf=${rule.confidence.toFixed(2)}, autoApproved=${autoApproved}): "${rule.ruleText.slice(0, 80)}"`
      );

      if (autoApproved) {
        result.rulesCreated++;
      } else {
        result.rulesQueued++;
      }
    } catch (err) {
      logger.error(`[ReflectionJob] rule write failed for user ${userId}`, err);
    }
  }

  // ── Stamp processed episodes ───────────────────────────────────────────────
  // Stamp after writing so a crash before this point re-processes the batch safely.
  if (episodeIds.length > 0) {
    await MemoryDataSource.query(
      `UPDATE episodic_memories SET reflected_at = NOW() WHERE id = ANY($1::uuid[])`,
      [episodeIds]
    );
  }

  logger.info(
    `[ReflectionJob] user=${userId} episodes=${result.episodesProcessed} ` +
      `semanticFacts=${result.semanticFactsWritten} ` +
      `rulesCreated=${result.rulesCreated} rulesQueued=${result.rulesQueued} rulesDiscarded=${result.rulesDiscarded}`
  );

  return result;
}

// ── All-users runner ───────────────────────────────────────────────────────────

export async function runReflectionAll(): Promise<ReflectionRunResult[]> {
  if (!isMemoryEnabled() || !MemoryDataSource.isInitialized) return [];

  // Find users who have enough unreflected episodes to warrant a run
  const eligible: Array<{ user_id: string; count: string }> = await MemoryDataSource.query(
    `SELECT user_id, COUNT(*) AS count
       FROM episodic_memories
      WHERE is_active = TRUE
        AND reflected_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())
      GROUP BY user_id
     HAVING COUNT(*) >= $1`,
    [memoryConfig.reflection.minEpisodesForReflection]
  );

  if (eligible.length === 0) {
    logger.info('[ReflectionJob] No users with enough unreflected episodes — nothing to do');
    return [];
  }

  logger.info(`[ReflectionJob] Starting reflection run for ${eligible.length} user(s)`);

  const results: ReflectionRunResult[] = [];
  for (const { user_id } of eligible) {
    try {
      const r = await runReflectionForUser(user_id);
      results.push(r);
    } catch (err) {
      logger.error(`[ReflectionJob] Failed for user ${user_id}`, err);
    }
  }

  const totals = results.reduce(
    (acc, r) => ({
      episodes: acc.episodes + r.episodesProcessed,
      facts: acc.facts + r.semanticFactsWritten,
      created: acc.created + r.rulesCreated,
      queued: acc.queued + r.rulesQueued,
    }),
    { episodes: 0, facts: 0, created: 0, queued: 0 }
  );

  logger.info(
    `[ReflectionJob] Run complete — users=${results.length} ` +
      `episodes=${totals.episodes} semanticFacts=${totals.facts} ` +
      `rulesCreated=${totals.created} rulesQueued=${totals.queued}`
  );

  return results;
}

// ── Cron registration ─────────────────────────────────────────────────────────

export function startReflectionJob(): void {
  if (!isMemoryEnabled()) {
    logger.info('Reflection job disabled (MEMORY_DATABASE_URL not set)');
    return;
  }

  // 3am nightly — offset from auto-capture (2am) to avoid DB contention
  cron.schedule('0 3 * * *', async () => {
    logger.info('[ReflectionJob] Nightly run triggered');
    await runReflectionAll();
  });

  logger.info('Reflection cron job scheduled (daily at 03:00)');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface ExistingRule {
  id: string;
  confidence: number;
  status: string;
  version: number;
  sourceEpisodeIds: string[] | null;
  similarity: number;
}

async function findSimilarRule(
  userId: string,
  promptFragment: string
): Promise<ExistingRule | null> {
  const embedding = await getEmbeddingProvider().embed(promptFragment);
  const pgEmbedding = formatEmbeddingForPg(embedding);

  const rows: ExistingRule[] = await MemoryDataSource.query(
    `SELECT id, confidence, status, version, source_episode_ids AS "sourceEpisodeIds",
            1 - (embedding <=> $1::vector) AS similarity
       FROM procedural_rules
      WHERE user_id = $2
        AND status != 'rejected'
      ORDER BY embedding <=> $1::vector
      LIMIT 1`,
    [pgEmbedding, userId]
  );

  const best = rows[0];
  // Use a lower threshold than semantic dedup — rules are longer and more specific
  return best && best.similarity >= 0.88 ? best : null;
}

function mergeIds(existing: string[] | null, incoming: string[]): string[] {
  const set = new Set([...(existing ?? []), ...incoming]);
  return Array.from(set).slice(0, 20); // cap to avoid unbounded growth
}
