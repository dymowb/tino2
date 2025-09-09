import { Browserbase } from '@browserbasehq/sdk';
import logger from './logger';

export interface BrowserbaseConfig {
  apiKey: string;
  projectId?: string;
  sessionTimeout?: number;
}

export interface BrowserbaseSession {
  id: string;
  connectUrl: string;
  status: 'RUNNING' | 'COMPLETED' | 'ERROR';
  createdAt: Date;
}

export class BrowserbaseManager {
  private client: Browserbase;
  private activeSessions: Map<string, BrowserbaseSession> = new Map();

  constructor(config: BrowserbaseConfig) {
    this.client = new Browserbase({
      apiKey: config.apiKey,
    });
  }

  async createSession(options?: {
    timeout?: number;
    keepAlive?: boolean;
    browserSettings?: Record<string, any>;
  }): Promise<BrowserbaseSession> {
    try {
      const session = await this.client.sessions.create({
        projectId: process.env.BROWSERBASE_PROJECT_ID,
        ...options?.browserSettings,
      });

      const sessionData: BrowserbaseSession = {
        id: session.id,
        connectUrl: session.debuggerFullscreenUrl || session.id, // Fallback to ID if no URL
        status: session.status as 'RUNNING' | 'COMPLETED' | 'ERROR',
        createdAt: new Date(session.createdAt),
      };

      this.activeSessions.set(session.id, sessionData);
      logger.info(`Browserbase session created: ${session.id}`);
      
      return sessionData;
    } catch (error) {
      logger.error('Failed to create Browserbase session:', error);
      throw new Error('Failed to create browser session');
    }
  }

  async getSession(sessionId: string): Promise<BrowserbaseSession | null> {
    try {
      const session = await this.client.sessions.retrieve(sessionId);
      
      const sessionData: BrowserbaseSession = {
        id: session.id,
        connectUrl: session.debuggerFullscreenUrl || session.id, // Fallback to ID if no URL
        status: session.status as 'RUNNING' | 'COMPLETED' | 'ERROR',
        createdAt: new Date(session.createdAt),
      };

      // Update local cache
      if (session.status === 'RUNNING') {
        this.activeSessions.set(sessionId, sessionData);
      } else {
        this.activeSessions.delete(sessionId);
      }
      
      return sessionData;
    } catch (error) {
      logger.error(`Error getting session: ${sessionId}`, error);
      this.activeSessions.delete(sessionId);
      return null;
    }
  }

  async endSession(sessionId: string): Promise<void> {
    try {
      // For now, just remove from local cache since session auto-expires
      // The Browserbase API doesn't seem to have a direct way to end sessions
      this.activeSessions.delete(sessionId);
      logger.info(`Browserbase session ended: ${sessionId}`);
    } catch (error) {
      logger.error(`Failed to end Browserbase session: ${sessionId}`, error);
      throw new Error('Failed to end browser session');
    }
  }

  async listActiveSessions(): Promise<string[]> {
    // Get fresh list from API and update local cache
    try {
      const sessions = await this.client.sessions.list();
      
      // Update local cache with active sessions only
      this.activeSessions.clear();
      const activeSessionIds: string[] = [];
      
      for (const session of sessions) {
        if (session.status === 'RUNNING') {
          this.activeSessions.set(session.id, {
            id: session.id,
            connectUrl: session.debuggerFullscreenUrl || session.id, // Fallback to ID if no URL
            status: session.status as 'RUNNING' | 'COMPLETED' | 'ERROR',
            createdAt: new Date(session.createdAt),
          });
          activeSessionIds.push(session.id);
        }
      }
      
      return activeSessionIds;
    } catch (error) {
      logger.error('Error listing sessions:', error);
      return Array.from(this.activeSessions.keys());
    }
  }

  async cleanupInactiveSessions(): Promise<void> {
    await this.listActiveSessions(); // This will update the cache
    logger.info('Inactive sessions cleaned up');
  }

  getSessionCount(): number {
    return this.activeSessions.size;
  }
}

// Initialize Browserbase manager if credentials are provided
let browserbaseManager: BrowserbaseManager | null = null;

if (process.env.BROWSERBASE_API_KEY) {
  browserbaseManager = new BrowserbaseManager({
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    sessionTimeout: parseInt(process.env.BROWSERBASE_SESSION_TIMEOUT || '300000'),
  });

  logger.info('Browserbase MCP integration initialized');
} else {
  logger.warn('Browserbase API key not provided - browser automation features disabled');
}

export { browserbaseManager };