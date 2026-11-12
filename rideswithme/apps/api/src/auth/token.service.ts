import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { ErrorCode } from '@rideswithme/shared-types';
import { AppException } from '../common/app-exception';
import { APP_CONFIG, type AppConfig } from '../config/config';

const ISSUER = 'rideswithme-api';
const AUDIENCE = 'rideswithme';

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
}

/**
 * Access tokens: short-lived HS256 JWTs carrying only user and session ids.
 * Permissions and session state are read from the database on each request,
 * so role changes and revocations take effect immediately.
 *
 * Refresh tokens: "<sessionId>.<32 random bytes>", opaque to clients. Only the
 * SHA-256 of the random part is stored.
 */
@Injectable()
export class TokenService {
  private readonly secret: Uint8Array;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.secret = new TextEncoder().encode(config.JWT_ACCESS_SECRET);
  }

  async signAccessToken(claims: AccessTokenClaims): Promise<string> {
    return new SignJWT({ sid: claims.sessionId, typ: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.config.JWT_ACCESS_TTL_SECONDS}s`)
      .sign(this.secret);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      if (
        payload.typ !== 'access' ||
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string'
      ) {
        throw new Error('Wrong token type');
      }
      return { userId: payload.sub, sessionId: payload.sid };
    } catch (err) {
      const message =
        err instanceof joseErrors.JWTExpired ? 'Access token expired' : 'Invalid access token';
      throw new AppException(ErrorCode.UNAUTHENTICATED, message);
    }
  }

  /**
   * A short-lived ticket that only opens a realtime (Socket.IO) connection. Web
   * apps keep API tokens on their own server; they fetch a ticket for the browser
   * to connect directly to the API's live updates.
   */
  async signRealtimeTicket(claims: AccessTokenClaims): Promise<string> {
    return new SignJWT({ sid: claims.sessionId, typ: 'realtime' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.config.REALTIME_TICKET_TTL_SECONDS}s`)
      .sign(this.secret);
  }

  /** Accepts an access token or a realtime ticket (for opening a realtime connection only). */
  async verifyRealtimeCredential(token: string): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      if (
        (payload.typ !== 'access' && payload.typ !== 'realtime') ||
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string'
      ) {
        throw new Error('Wrong token type');
      }
      return { userId: payload.sub, sessionId: payload.sid };
    } catch {
      throw new AppException(ErrorCode.UNAUTHENTICATED, 'Invalid realtime credential');
    }
  }

  newRefreshSecret(): { secret: string; hash: Buffer } {
    const secret = randomBytes(32).toString('base64url');
    return { secret, hash: hashRefreshSecret(secret) };
  }

  static formatRefreshToken(sessionId: string, secret: string) {
    return `${sessionId}.${secret}`;
  }

  static parseRefreshToken(token: string): { sessionId: string; secret: string } | null {
    const match = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(token);
    return match?.[1] && match[2] ? { sessionId: match[1], secret: match[2] } : null;
  }
}

export function hashRefreshSecret(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}
