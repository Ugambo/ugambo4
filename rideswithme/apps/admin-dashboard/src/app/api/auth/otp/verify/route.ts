import { NextResponse, type NextRequest } from 'next/server';
import type { VerifyOtpResponse } from '@rideswithme/shared-types';
import { serverEnv } from '@/server/env';
import { sessionFromTokens, writeSession } from '@/server/session';
import { callApi, errorResponse, isTrustedMutation, passThrough } from '@/server/upstream';

/** Signs in with the SMS code. Tokens go into the encrypted cookie; the browser only gets the user. */
export async function POST(req: NextRequest) {
  if (!isTrustedMutation(req)) return errorResponse(403, 'FORBIDDEN', 'Cross-site request refused');
  const body = (await req.json().catch(() => ({}))) as { phone?: unknown; code?: unknown };
  const res = await callApi(req, '/v1/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({
      phone: body.phone,
      code: body.code,
      acceptedPolicyVersion: serverEnv().POLICY_VERSION,
      device: { name: 'Admin dashboard', platform: 'web' },
    }),
  });
  if (!res.ok) return passThrough(res);
  const data = (await res.json()) as VerifyOtpResponse;
  await writeSession(sessionFromTokens(data.tokens));
  return NextResponse.json({ user: data.user }, { headers: { 'Cache-Control': 'no-store' } });
}
