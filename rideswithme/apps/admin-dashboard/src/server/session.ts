import 'server-only';
import { EncryptJWT, jwtDecrypt } from 'jose';
import { cookies } from 'next/headers';
import type { AuthTokens } from '@rideswithme/shared-types';
import { cookieSecure, serverEnv } from './env';

export const SESSION_COOKIE = 'rwm_admin_session';

/**
 * The admin's API tokens live only in this encrypted, httpOnly cookie, so
 * scripts in the page (including injected ones) can never read them. The
 * browser talks to this server; this server talks to the API.
 */
export interface AdminSession {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when the access token expires. */
  accessExpiresAt: number;
  refreshExpiresAt: number;
}

const key = () => Buffer.from(serverEnv().ADMIN_SESSION_SECRET, 'base64');

export async function sealSession(s: AdminSession): Promise<string> {
  return new EncryptJWT({ s })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(s.refreshExpiresAt / 1000))
    .encrypt(key());
}

export async function unsealSession(value: string | undefined): Promise<AdminSession | null> {
  if (!value) return null;
  try {
    const { payload } = await jwtDecrypt(value, key());
    return (payload.s as AdminSession) ?? null;
  } catch {
    return null;
  }
}

export function sessionFromTokens(tokens: AuthTokens): AdminSession {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    accessExpiresAt: Date.now() + tokens.accessTokenExpiresIn * 1000,
    refreshExpiresAt: new Date(tokens.refreshTokenExpiresAt).getTime(),
  };
}

export async function readSession(): Promise<AdminSession | null> {
  return unsealSession((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function writeSession(s: AdminSession): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, await sealSession(s), {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'strict',
    path: '/',
    expires: new Date(s.refreshExpiresAt),
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
