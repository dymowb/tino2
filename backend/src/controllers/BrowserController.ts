import { Request, Response } from 'express';
import { browserbaseManager } from '@/config/browserbase';
import logger from '@/config/logger';

export class BrowserController {
  async createSession(req: Request, res: Response): Promise<void> {
    try {
      if (!browserbaseManager) {
        res.status(503).json({
          success: false,
          message: 'Browser automation service not available'
        });
        return;
      }

      const { timeout, keepAlive, browserSettings } = req.body;

      const session = await browserbaseManager.createSession({
        timeout,
        keepAlive,
        browserSettings
      });

      res.status(201).json({
        success: true,
        data: {
          sessionId: session.id,
          connectUrl: session.connectUrl,
          debuggerUrl: session.debuggerUrl
        }
      });

    } catch (error) {
      logger.error('Error creating browser session:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create browser session'
      });
    }
  }

  async getSession(req: Request, res: Response): Promise<void> {
    try {
      if (!browserbaseManager) {
        res.status(503).json({
          success: false,
          message: 'Browser automation service not available'
        });
        return;
      }

      const { sessionId } = req.params;
      const session = await browserbaseManager.getSession(sessionId);

      if (!session) {
        res.status(404).json({
          success: false,
          message: 'Session not found or expired'
        });
        return;
      }

      res.json({
        success: true,
        data: {
          sessionId: session.id,
          connectUrl: session.connectUrl,
          debuggerUrl: session.debuggerUrl,
          isActive: true
        }
      });

    } catch (error) {
      logger.error('Error getting browser session:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get browser session'
      });
    }
  }

  async endSession(req: Request, res: Response): Promise<void> {
    try {
      if (!browserbaseManager) {
        res.status(503).json({
          success: false,
          message: 'Browser automation service not available'
        });
        return;
      }

      const { sessionId } = req.params;
      await browserbaseManager.endSession(sessionId);

      res.json({
        success: true,
        message: 'Session ended successfully'
      });

    } catch (error) {
      logger.error('Error ending browser session:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to end browser session'
      });
    }
  }

  async listSessions(req: Request, res: Response): Promise<void> {
    try {
      if (!browserbaseManager) {
        res.status(503).json({
          success: false,
          message: 'Browser automation service not available'
        });
        return;
      }

      const sessionIds = await browserbaseManager.listActiveSessions();

      res.json({
        success: true,
        data: {
          activeSessions: sessionIds,
          count: sessionIds.length
        }
      });

    } catch (error) {
      logger.error('Error listing browser sessions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to list browser sessions'
      });
    }
  }

  async getSessionStats(req: Request, res: Response): Promise<void> {
    try {
      if (!browserbaseManager) {
        res.status(503).json({
          success: false,
          message: 'Browser automation service not available'
        });
        return;
      }

      const sessionCount = browserbaseManager.getSessionCount();

      res.json({
        success: true,
        data: {
          activeSessionCount: sessionCount,
          maxConcurrentSessions: parseInt(process.env.BROWSERBASE_MAX_SESSIONS || '10')
        }
      });

    } catch (error) {
      logger.error('Error getting session stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get session statistics'
      });
    }
  }

  async cleanupSessions(req: Request, res: Response): Promise<void> {
    try {
      if (!browserbaseManager) {
        res.status(503).json({
          success: false,
          message: 'Browser automation service not available'
        });
        return;
      }

      await browserbaseManager.cleanupInactiveSessions();

      res.json({
        success: true,
        message: 'Inactive sessions cleaned up successfully'
      });

    } catch (error) {
      logger.error('Error cleaning up sessions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cleanup sessions'
      });
    }
  }
}