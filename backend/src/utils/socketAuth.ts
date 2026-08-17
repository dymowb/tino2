import jwt from '@/utils/jwt';

/**
 * Resolve the user behind a Socket.IO handshake.
 *
 * Extracted from the connection middleware so the rule is testable without standing
 * up a socket server. It is a genuinely separate authentication entry point — it does
 * not pass through the HTTP auth middleware — which is exactly why it was overlooked
 * when access and refresh tokens were first given distinct types, leaving refresh
 * tokens usable as realtime credentials.
 */
export function resolveSocketUser(token: unknown): { userId: string } | null {
  if (typeof token !== 'string' || token.length === 0) {
    return null;
  }

  const decoded = jwt.verifyToken(token, 'access');
  if (!decoded?.userId) {
    return null;
  }

  return { userId: decoded.userId };
}
