import { Response } from 'express';
import { MemoryDataSource, isMemoryEnabled } from '@/config/memoryDatabase';
import { AppDataSource } from '@/config/database';
import { AuthenticatedRequest } from '@/types';
import { memoryRetriever } from '@/services/memory/MemoryRetriever';
import logger from '@/config/logger';
import { t } from '@/i18n';

type MemoryType = 'semantic' | 'episodic' | 'procedural';

class MemoryController {
  getMyMemories = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;

    if (!isMemoryEnabled() || !MemoryDataSource.isInitialized) {
      res.json({
        success: true,
        data: {
          semantic: [],
          episodic: [],
          procedural: [],
          isOptedOut: false,
          memoryDisabled: true,
        },
      });
      return;
    }

    try {
      const userRow = await AppDataSource.query(`SELECT settings FROM users WHERE id = $1`, [
        userId,
      ]);
      const isOptedOut = userRow[0]?.settings?.memoryOptOut ?? false;

      const [semantic, episodic, procedural] = await Promise.all([
        MemoryDataSource.query(
          `SELECT id, content, confidence, access_count, created_at, last_accessed_at
             FROM semantic_memories
            WHERE user_id = $1 AND is_active = TRUE
            ORDER BY created_at DESC`,
          [userId]
        ),
        MemoryDataSource.query(
          `SELECT id, summary, importance, access_count, occurred_at, created_at
             FROM episodic_memories
            WHERE user_id = $1 AND is_active = TRUE
            ORDER BY occurred_at DESC`,
          [userId]
        ),
        MemoryDataSource.query(
          `SELECT id, rule_text, prompt_fragment, confidence, status, created_at
             FROM procedural_rules
            WHERE user_id = $1 AND status = 'active'
            ORDER BY confidence DESC`,
          [userId]
        ),
      ]);

      res.json({ success: true, data: { semantic, episodic, procedural, isOptedOut } });
    } catch (err) {
      logger.error('[MemoryController] getMyMemories failed', err);
      res.status(500).json({ success: false, error: t(req, 'memory.retrieve_failed') });
    }
  };

  deleteMemory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { type, id } = req.params;

    if (!isMemoryEnabled() || !MemoryDataSource.isInitialized) {
      res.status(503).json({ success: false, error: t(req, 'memory.unavailable') });
      return;
    }

    try {
      let rowsAffected = 0;

      switch (type as MemoryType) {
        case 'semantic':
          const sr = await MemoryDataSource.query(
            `UPDATE semantic_memories SET is_active = FALSE WHERE id = $1 AND user_id = $2`,
            [id, userId]
          );
          rowsAffected = sr[1];
          break;
        case 'episodic':
          const er = await MemoryDataSource.query(
            `UPDATE episodic_memories SET is_active = FALSE WHERE id = $1 AND user_id = $2`,
            [id, userId]
          );
          rowsAffected = er[1];
          break;
        case 'procedural':
          const pr = await MemoryDataSource.query(
            `UPDATE procedural_rules SET status = 'deprecated', deprecated_at = NOW() WHERE id = $1 AND user_id = $2`,
            [id, userId]
          );
          rowsAffected = pr[1];
          break;
        default:
          res.status(400).json({ success: false, error: t(req, 'memory.invalid_type') });
          return;
      }

      if (rowsAffected === 0) {
        res.status(404).json({ success: false, error: t(req, 'memory.not_found') });
        return;
      }

      logger.info(`[MemoryController] user=${userId} deleted ${type} memory ${id}`);
      res.json({ success: true });
    } catch (err) {
      logger.error('[MemoryController] deleteMemory failed', err);
      res.status(500).json({ success: false, error: t(req, 'memory.delete_failed') });
    }
  };

  setOptOut = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { optOut } = req.body;

    if (typeof optOut !== 'boolean') {
      res.status(400).json({ success: false, error: t(req, 'memory.optout_boolean') });
      return;
    }

    try {
      await AppDataSource.query(
        `UPDATE users SET settings = COALESCE(settings, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
        [JSON.stringify({ memoryOptOut: optOut }), userId]
      );

      // When opting out, deactivate all existing memories so they're no longer retrieved
      if (optOut && isMemoryEnabled() && MemoryDataSource.isInitialized) {
        await Promise.all([
          MemoryDataSource.query(
            `UPDATE semantic_memories SET is_active = FALSE WHERE user_id = $1`,
            [userId]
          ),
          MemoryDataSource.query(
            `UPDATE episodic_memories SET is_active = FALSE WHERE user_id = $1`,
            [userId]
          ),
          MemoryDataSource.query(
            `UPDATE procedural_rules SET status = 'deprecated', deprecated_at = NOW() WHERE user_id = $1 AND status = 'active'`,
            [userId]
          ),
        ]);
        logger.info(`[MemoryController] user=${userId} opted out — all memories deactivated`);
      }

      res.json({ success: true, optOut });
    } catch (err) {
      logger.error('[MemoryController] setOptOut failed', err);
      res.status(500).json({ success: false, error: t(req, 'memory.optout_update_failed') });
    }
  };

  // ── Stats ─────────────────────────────────────────────────────────────────

  getMyStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;

    if (!isMemoryEnabled() || !MemoryDataSource.isInitialized) {
      res.json({ success: true, data: null });
      return;
    }

    try {
      const [counts, retrievalRows, writeRows] = await Promise.all([
        // Active memory counts
        MemoryDataSource.query(
          `SELECT
             (SELECT COUNT(*) FROM semantic_memories  WHERE user_id=$1 AND is_active=TRUE)::int   AS semantic,
             (SELECT COUNT(*) FROM episodic_memories  WHERE user_id=$1 AND is_active=TRUE)::int   AS episodic,
             (SELECT COUNT(*) FROM procedural_rules   WHERE user_id=$1 AND status='active')::int  AS procedural`,
          [userId]
        ),
        // Retrieval stats — last 30 days
        MemoryDataSource.query(
          `SELECT
             COUNT(*)::int                                                                       AS total_queries,
             COUNT(*) FILTER (
               WHERE jsonb_array_length(results->'semanticIds')  > 0
                  OR jsonb_array_length(results->'episodicIds')   > 0
                  OR jsonb_array_length(results->'proceduralIds') > 0
             )::int                                                                             AS queries_with_hits,
             ROUND(AVG(latency_ms))::int                                                        AS avg_latency_ms,
             ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms))::int              AS p95_latency_ms
           FROM memory_retrieval_log
           WHERE user_id=$1 AND retrieved_at > NOW() - INTERVAL '30 days'`,
          [userId]
        ),
        // Write decisions — last 30 days
        MemoryDataSource.query(
          `SELECT action, COUNT(*)::int AS count
             FROM memory_write_log
            WHERE user_id=$1 AND created_at > NOW() - INTERVAL '30 days'
            GROUP BY action`,
          [userId]
        ),
      ]);

      const retrieval = retrievalRows[0] ?? {};
      const hitRate =
        retrieval.total_queries > 0
          ? Math.round((retrieval.queries_with_hits / retrieval.total_queries) * 100)
          : 0;

      const writeCounts: Record<string, number> = {};
      for (const row of writeRows) writeCounts[row.action] = Number(row.count);

      res.json({
        success: true,
        data: {
          counts: {
            semantic: Number(counts[0]?.semantic ?? 0),
            episodic: Number(counts[0]?.episodic ?? 0),
            procedural: Number(counts[0]?.procedural ?? 0),
          },
          retrieval: {
            totalQueries: Number(retrieval.total_queries ?? 0),
            queriesWithHits: Number(retrieval.queries_with_hits ?? 0),
            hitRatePct: hitRate,
            avgLatencyMs: retrieval.avg_latency_ms ?? null,
            p95LatencyMs: retrieval.p95_latency_ms ?? null,
          },
          writes: {
            created: writeCounts['created'] ?? 0,
            merged: writeCounts['merged'] ?? 0,
            discarded: writeCounts['discarded'] ?? 0,
          },
        },
      });
    } catch (err) {
      logger.error('[MemoryController] getMyStats failed', err);
      res.status(500).json({ success: false, error: t(req, 'memory.stats_failed') });
    }
  };

  getSystemStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!isMemoryEnabled() || !MemoryDataSource.isInitialized) {
      res.json({ success: true, data: null });
      return;
    }

    try {
      const [totals, retrievalGlobal, writeGlobal, topUsers] = await Promise.all([
        MemoryDataSource.query(
          `SELECT
             (SELECT COUNT(*) FROM semantic_memories  WHERE is_active=TRUE)::int  AS semantic,
             (SELECT COUNT(*) FROM episodic_memories  WHERE is_active=TRUE)::int  AS episodic,
             (SELECT COUNT(*) FROM procedural_rules   WHERE status='active')::int AS procedural,
             (SELECT COUNT(DISTINCT user_id) FROM semantic_memories)::int         AS users_with_memory`
        ),
        MemoryDataSource.query(
          `SELECT
             COUNT(*)::int                                                                       AS total_queries,
             COUNT(*) FILTER (
               WHERE jsonb_array_length(results->'semanticIds')  > 0
                  OR jsonb_array_length(results->'episodicIds')   > 0
                  OR jsonb_array_length(results->'proceduralIds') > 0
             )::int                                                                             AS queries_with_hits,
             ROUND(AVG(latency_ms))::int                                                        AS avg_latency_ms,
             ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY latency_ms))::int              AS p50_latency_ms,
             ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms))::int              AS p95_latency_ms
           FROM memory_retrieval_log
           WHERE retrieved_at > NOW() - INTERVAL '30 days'`
        ),
        MemoryDataSource.query(
          `SELECT action, COUNT(*)::int AS count
             FROM memory_write_log
            WHERE created_at > NOW() - INTERVAL '30 days'
            GROUP BY action`
        ),
        // Top 5 users by memory count
        MemoryDataSource.query(
          `SELECT user_id, COUNT(*)::int AS count
             FROM semantic_memories
            WHERE is_active=TRUE
            GROUP BY user_id
            ORDER BY count DESC
            LIMIT 5`
        ),
      ]);

      const r = retrievalGlobal[0] ?? {};
      const hitRate =
        r.total_queries > 0 ? Math.round((r.queries_with_hits / r.total_queries) * 100) : 0;

      const writeCounts: Record<string, number> = {};
      for (const row of writeGlobal) writeCounts[row.action] = Number(row.count);

      res.json({
        success: true,
        data: {
          totals: {
            semantic: Number(totals[0]?.semantic ?? 0),
            episodic: Number(totals[0]?.episodic ?? 0),
            procedural: Number(totals[0]?.procedural ?? 0),
            usersWithMemory: Number(totals[0]?.users_with_memory ?? 0),
          },
          retrieval: {
            totalQueries: Number(r.total_queries ?? 0),
            queriesWithHits: Number(r.queries_with_hits ?? 0),
            hitRatePct: hitRate,
            avgLatencyMs: r.avg_latency_ms ?? null,
            p50LatencyMs: r.p50_latency_ms ?? null,
            p95LatencyMs: r.p95_latency_ms ?? null,
          },
          writes: {
            created: writeCounts['created'] ?? 0,
            merged: writeCounts['merged'] ?? 0,
            discarded: writeCounts['discarded'] ?? 0,
          },
          topUsersByMemory: topUsers,
        },
      });
    } catch (err) {
      logger.error('[MemoryController] getSystemStats failed', err);
      res.status(500).json({ success: false, error: t(req, 'memory.system_stats_failed') });
    }
  };

  // ── Eval / recall test ────────────────────────────────────────────────────

  testRecall = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const requestingUserId = req.user!.userId;
    const { query, userId } = req.body as { query: string; userId?: string };

    if (!query || typeof query !== 'string') {
      res.status(400).json({ success: false, error: t(req, 'memory.query_required') });
      return;
    }

    // Admin may query for any user; regular users can only query their own memories
    const targetUserId = userId && req.user!.userType === 'admin' ? userId : requestingUserId;

    if (!isMemoryEnabled() || !MemoryDataSource.isInitialized) {
      res.status(503).json({ success: false, error: t(req, 'memory.unavailable') });
      return;
    }

    try {
      const t0 = Date.now();
      const result = await memoryRetriever.retrieve(query, targetUserId, 'eval-recall');
      const latencyMs = Date.now() - t0;

      res.json({
        success: true,
        data: {
          query,
          userId: targetUserId,
          latencyMs,
          hasAny: result.hasAny,
          semantic: result.semantic,
          episodic: result.episodic,
          procedural: result.procedural,
        },
      });
    } catch (err) {
      logger.error('[MemoryController] testRecall failed', err);
      res.status(500).json({ success: false, error: t(req, 'memory.recall_failed') });
    }
  };
}

export default new MemoryController();
