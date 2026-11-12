import { errorResponse, isTrustedMutation } from '@rideswithme/web-core';
import { bff } from '@/server/bff';

/**
 * A 60-second ticket the browser uses to open its live connection to the API
 * (the browser never holds API tokens). The API's address comes from the page.
 */
export async function POST(req: Request) {
  if (!isTrustedMutation(req)) return errorResponse(403, 'FORBIDDEN', 'Cross-site request refused');
  return bff.callAsUser(req, '/v1/auth/realtime-ticket', { method: 'POST' });
}
