import type { NextRequest } from 'next/server';
import { isAllowedApiPath } from '@/server/allowlist';
import { callApiAsAdmin, errorResponse, isTrustedMutation } from '@/server/upstream';

type Ctx = { params: Promise<{ path: string[] }> };

/** Forwards allow-listed API calls with the admin's token from the session cookie. */
async function handle(req: NextRequest, ctx: Ctx) {
  const path = (await ctx.params).path.join('/');
  if (!isAllowedApiPath(path)) return errorResponse(404, 'NOT_FOUND', 'Not found');
  if (!isTrustedMutation(req)) return errorResponse(403, 'FORBIDDEN', 'Cross-site request refused');
  const body = req.method === 'GET' || req.method === 'DELETE' ? null : await req.text();
  return callApiAsAdmin(req, `/${path}${req.nextUrl.search}`, {
    method: req.method,
    body: body || null,
  });
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
