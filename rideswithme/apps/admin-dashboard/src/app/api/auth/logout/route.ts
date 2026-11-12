import { NextResponse, type NextRequest } from 'next/server';
import { clearSession } from '@/server/session';
import { callApiAsAdmin, errorResponse, isTrustedMutation } from '@/server/upstream';

export async function POST(req: NextRequest) {
  if (!isTrustedMutation(req)) return errorResponse(403, 'FORBIDDEN', 'Cross-site request refused');
  // End the session at the API too, so the refresh token is useless even if copied.
  await callApiAsAdmin(req, '/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
  await clearSession();
  return new NextResponse(null, { status: 204 });
}
