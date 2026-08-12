import jwt from 'jsonwebtoken';
import config from '@/config/environment';
import { JwtPayload } from '@/types';

/**
 * Which kind of token this is.
 *
 * Access and refresh tokens are signed with the same secret and carry the same
 * claims, so without this the two are interchangeable: an access token could be
 * presented to /auth/refresh and exchanged for a fresh pair, defeating the point of
 * a short access-token lifetime.
 */
export type TokenType = 'access' | 'refresh';

export interface TypedJwtPayload extends JwtPayload {
  type?: TokenType;
}

export class JWTService {
  private readonly secret: string;
  private readonly expiresIn: string;
  private readonly refreshExpiresIn: string;

  constructor() {
    this.secret = config.jwt.secret;
    this.expiresIn = config.jwt.expiresIn;
    this.refreshExpiresIn = config.jwt.refreshExpiresIn;
  }

  generateAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
    return jwt.sign({ ...payload, type: 'access' }, this.secret, {
      expiresIn: this.expiresIn,
    } as jwt.SignOptions);
  }

  generateRefreshToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
    return jwt.sign({ ...payload, type: 'refresh' }, this.secret, {
      expiresIn: this.refreshExpiresIn,
    } as jwt.SignOptions);
  }

  generateTokens(payload: Omit<JwtPayload, 'iat' | 'exp'>): {
    accessToken: string;
    refreshToken: string;
  } {
    return {
      accessToken: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken(payload),
    };
  }

  // Backward compatibility method for tests
  generateToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
    return this.generateAccessToken(payload);
  }

  /**
   * Verify a token and require it to be of the expected kind.
   *
   * `expectedType` is optional only so that tokens issued before the claim existed
   * keep working through a deploy: a token with no `type` is accepted. Once no such
   * tokens remain in circulation (they expire within the refresh window), the
   * fallback can be dropped and an absent type treated as invalid.
   */
  verifyToken(token: string, expectedType?: TokenType): TypedJwtPayload | null {
    try {
      const payload = jwt.verify(token, this.secret) as TypedJwtPayload;
      if (expectedType && payload.type && payload.type !== expectedType) {
        return null;
      }
      return payload;
    } catch (error) {
      return null;
    }
  }

  decodeToken(token: string): JwtPayload | null {
    try {
      return jwt.decode(token) as JwtPayload;
    } catch (error) {
      return null;
    }
  }

  isTokenExpired(token: string): boolean {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded || !decoded.exp) return true;
      return Date.now() >= decoded.exp * 1000;
    } catch (error) {
      return true;
    }
  }

  getTokenExpirationTime(token: string): Date | null {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded || !decoded.exp) return null;
      return new Date(decoded.exp * 1000);
    } catch (error) {
      return null;
    }
  }
}

export const jwtService = new JWTService();
export default jwtService;
