import { Response } from 'express';
import { MemoryDataSource, isMemoryEnabled } from '@/config/memoryDatabase';
import { AppDataSource } from '@/config/database';
import { AuthenticatedRequest } from '@/types';
import logger from '@/config/logger';

type MemoryType = 'semantic' | 'episodic' | 'procedural';

class MemoryController {
  getMyMemories = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;

    if (!isMemoryEnabled() || !MemoryDataSource.isInitialized) {
      res.json({ success: true, data: { semantic: [], episodic: [], procedural: [], isOptedOut: false, memoryDisabled: true } });
      return;
    }

    try {
      const userRow = await AppDataSource.query(
        `SELECT settings FROM users WHERE id = $1`,
        [userId],
      );
      const isOptedOut = userRow[0]?.settings?.memoryOptOut ?? false;

      const [semantic, episodic, procedural] = await Promise.all([
        MemoryDataSource.query(
          `SELECT id, content, confidence, access_count, created_at, last_accessed_at
             FROM semantic_memories
            WHERE user_id = $1 AND is_active = TRUE
            ORDER BY created_at DESC`,
          [userId],
        ),
        MemoryDataSource.query(
          `SELECT id, summary, importance, access_count, occurred_at, created_at
             FROM episodic_memories
            WHERE user_id = $1 AND is_active = TRUE
            ORDER BY occurred_at DESC`,
          [userId],
        ),
        MemoryDataSource.query(
          `SELECT id, rule_text, prompt_fragment, confidence, status, created_at
             FROM procedural_rules
            WHERE user_id = $1 AND status = 'active'
            ORDER BY confidence DESC`,
          [userId],
        ),
      ]);

      res.json({ success: true, data: { semantic, episodic, procedural, isOptedOut } });
    } catch (err) {
      logger.error('[MemoryController] getMyMemories failed', err);
      res.status(500).json({ success: false, error: 'Failed to retrieve memories' });
    }
  };

  deleteMemory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { type, id } = req.params;

    if (!isMemoryEnabled() || !MemoryDataSource.isInitialized) {
      res.status(503).json({ success: false, error: 'Memory system unavailable' });
      return;
    }

    try {
      let rowsAffected = 0;

      switch (type as MemoryType) {
        case 'semantic':
          const sr = await MemoryDataSource.query(
            `UPDATE semantic_memories SET is_active = FALSE WHERE id = $1 AND user_id = $2`,
            [id, userId],
          );
          rowsAffected = sr[1];
          break;
        case 'episodic':
          const er = await MemoryDataSource.query(
            `UPDATE episodic_memories SET is_active = FALSE WHERE id = $1 AND user_id = $2`,
            [id, userId],
          );
          rowsAffected = er[1];
          break;
        case 'procedural':
          const pr = await MemoryDataSource.query(
            `UPDATE procedural_rules SET status = 'deprecated', deprecated_at = NOW() WHERE id = $1 AND user_id = $2`,
            [id, userId],
          );
          rowsAffected = pr[1];
          break;
        default:
          res.status(400).json({ success: false, error: 'Invalid memory type. Use: semantic, episodic, procedural' });
          return;
      }

      if (rowsAffected === 0) {
        res.status(404).json({ success: false, error: 'Memory not found' });
        return;
      }

      logger.info(`[MemoryController] user=${userId} deleted ${type} memory ${id}`);
      res.json({ success: true });
    } catch (err) {
      logger.error('[MemoryController] deleteMemory failed', err);
      res.status(500).json({ success: false, error: 'Failed to delete memory' });
    }
  };

  setOptOut = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { optOut } = req.body;

    if (typeof optOut !== 'boolean') {
      res.status(400).json({ success: false, error: 'optOut must be a boolean' });
      return;
    }

    try {
      await AppDataSource.query(
        `UPDATE users SET settings = COALESCE(settings, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
        [JSON.stringify({ memoryOptOut: optOut }), userId],
      );

      // When opting out, deactivate all existing memories so they're no longer retrieved
      if (optOut && isMemoryEnabled() && MemoryDataSource.isInitialized) {
        await Promise.all([
          MemoryDataSource.query(
            `UPDATE semantic_memories SET is_active = FALSE WHERE user_id = $1`,
            [userId],
          ),
          MemoryDataSource.query(
            `UPDATE episodic_memories SET is_active = FALSE WHERE user_id = $1`,
            [userId],
          ),
          MemoryDataSource.query(
            `UPDATE procedural_rules SET status = 'deprecated', deprecated_at = NOW() WHERE user_id = $1 AND status = 'active'`,
            [userId],
          ),
        ]);
        logger.info(`[MemoryController] user=${userId} opted out — all memories deactivated`);
      }

      res.json({ success: true, optOut });
    } catch (err) {
      logger.error('[MemoryController] setOptOut failed', err);
      res.status(500).json({ success: false, error: 'Failed to update opt-out setting' });
    }
  };
}

export default new MemoryController();
