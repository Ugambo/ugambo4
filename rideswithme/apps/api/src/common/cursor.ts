import { ErrorCode } from '@rideswithme/shared-types';
import { AppException } from './app-exception';

/**
 * Keyset pagination cursor over (created_at, id). The timestamp is kept as
 * Postgres text so microsecond precision survives the round trip.
 */
export interface Cursor {
  ts: string;
  id: string;
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify([c.ts, c.id])).toString('base64url');
}

export function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      Array.isArray(parsed) &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string' &&
      /^[0-9a-f-]{36}$/.test(parsed[1]) &&
      !Number.isNaN(Date.parse(parsed[0]))
    ) {
      return { ts: parsed[0], id: parsed[1] };
    }
  } catch {
    // fall through
  }
  throw new AppException(ErrorCode.VALIDATION_FAILED, 'Invalid cursor', {
    details: { field: 'cursor' },
  });
}
