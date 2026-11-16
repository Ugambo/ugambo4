import { serverEnv } from '@/server/env';

/**
 * A shared trip, for anyone with the link (no sign-in). Passes the viewer's
 * address on so the API's per-visitor limit applies to them, not to this server.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token))
    return Response.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
  const forwarded = req.headers.get('x-forwarded-for');
  const res = await fetch(`${serverEnv().API_URL}/v1/share/${token}`, {
    headers: forwarded ? { 'x-forwarded-for': forwarded } : {},
    cache: 'no-store',
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
