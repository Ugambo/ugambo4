import type { NextRequest } from 'next/server';
import { callApi, errorResponse, isTrustedMutation, passThrough } from '@/server/upstream';

export async function POST(req: NextRequest) {
  if (!isTrustedMutation(req)) return errorResponse(403, 'FORBIDDEN', 'Cross-site request refused');
  const body = (await req.json().catch(() => ({}))) as { phone?: unknown };
  const res = await callApi(req, '/v1/auth/otp/request', {
    method: 'POST',
    body: JSON.stringify({ phone: body.phone }),
  });
  return passThrough(res);
}
