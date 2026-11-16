'use client';

import { createRealtime, type Realtime } from '@rideswithme/api-client/realtime';
import { CSRF_HEADER } from '@rideswithme/web-core/client';

/** A 60-second ticket from the API, fetched through this site's proxy (the browser holds no API token). */
async function ticket(): Promise<string | null> {
  try {
    const res = await fetch('/api/proxy/v1/auth/realtime-ticket', {
      method: 'POST',
      headers: CSRF_HEADER,
    });
    if (!res.ok) return null;
    return ((await res.json()) as { ticket: string }).ticket;
  } catch {
    return null;
  }
}

/** A live connection to the API for staff screens. */
export function staffRealtime(url: string): Realtime {
  return createRealtime({
    url,
    getToken: ticket,
    refresh: async () => (await ticket()) !== null,
    onSessionEnded: () => window.location.assign('/login'),
  });
}
