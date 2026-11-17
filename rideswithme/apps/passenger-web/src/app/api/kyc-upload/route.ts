import { errorResponse, isTrustedMutation } from '@rideswithme/web-core';
import { bff } from '@/server/bff';

const TYPES = ['image/jpeg', 'image/png'];
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Uploads an identity-check photo (the ID or the selfie) for the signed-in
 * passenger. The browser sends the photo here (same site); this server asks
 * the API for a signed upload address as the passenger and stores the file
 * there, so file storage needs no browser (CORS) access. Answers { uploadId }.
 */
export async function POST(req: Request) {
  if (!isTrustedMutation(req)) return errorResponse(403, 'FORBIDDEN', 'Cross-site request refused');
  const kind = new URL(req.url).searchParams.get('kind');
  if (kind !== 'id' && kind !== 'selfie')
    return errorResponse(422, 'VALIDATION_FAILED', 'kind must be id or selfie');
  const contentType = (req.headers.get('content-type') ?? '').split(';')[0]!.trim();
  if (!TYPES.includes(contentType))
    return errorResponse(422, 'VALIDATION_FAILED', 'Send a JPEG or PNG photo');
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BYTES) return errorResponse(413, 'VALIDATION_FAILED', 'Photo too large');
  const body = Buffer.from(await req.arrayBuffer());
  if (body.length === 0 || body.length > MAX_BYTES)
    return errorResponse(413, 'VALIDATION_FAILED', 'Photo too large');

  const ticketRes = await bff.callAsUser(req, '/v1/me/verification/uploads', {
    method: 'POST',
    body: JSON.stringify({ kind, contentType, sizeBytes: body.length }),
  });
  if (!ticketRes.ok) return ticketRes;
  const ticket = (await ticketRes.json()) as {
    uploadId: string;
    uploadUrl: string;
    headers: Record<string, string>;
  };
  const put = await fetch(ticket.uploadUrl, {
    method: 'PUT',
    headers: ticket.headers,
    body,
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!put?.ok) return errorResponse(502, 'STORAGE_UNAVAILABLE', 'Could not store the photo');

  const out = Response.json(
    { uploadId: ticket.uploadId },
    { headers: { 'Cache-Control': 'no-store' } },
  );
  // Keep a refreshed session cookie, if the API call renewed it.
  for (const c of ticketRes.headers.getSetCookie()) out.headers.append('Set-Cookie', c);
  return out;
}
