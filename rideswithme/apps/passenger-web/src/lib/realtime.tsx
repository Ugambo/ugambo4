'use client';

import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { createRealtime, type Realtime } from '@rideswithme/api-client/realtime';
import { CSRF_HEADER } from '@rideswithme/web-core/client';

/**
 * Live updates from the API. The browser has no API token, so each connection
 * attempt first asks this site's server for a 60-second realtime ticket.
 */
async function fetchTicket(): Promise<string | null> {
  try {
    const res = await fetch('/api/realtime', { method: 'POST', headers: CSRF_HEADER });
    if (!res.ok) return null;
    return ((await res.json()) as { ticket: string }).ticket;
  } catch {
    return null;
  }
}

const Ctx = createContext<Realtime | null>(null);

export function RealtimeProvider({ url, children }: { url: string; children: ReactNode }) {
  const [realtime] = useState(() =>
    createRealtime({
      url,
      getToken: fetchTicket,
      refresh: async () => (await fetchTicket()) !== null,
      onSessionEnded: () => window.location.assign('/sign-in'),
    }),
  );
  useEffect(() => {
    realtime.start();
    return () => realtime.stop();
  }, [realtime]);
  return <Ctx.Provider value={realtime}>{children}</Ctx.Provider>;
}

function useRealtime(): Realtime {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRealtime outside RealtimeProvider');
  return v;
}

/** Pass a stable handler (useCallback). */
export function useRealtimeEvent<T>(event: string, handler: (payload: T) => void) {
  const realtime = useRealtime();
  useEffect(() => realtime.on<T>(event, handler), [realtime, event, handler]);
}

/** Runs after the connection comes back: events sent while it was down are missed, so refetch. */
export function useOnReconnect(handler: () => void) {
  const realtime = useRealtime();
  useEffect(() => realtime.onReconnect(handler), [realtime, handler]);
}

export function useRealtimeConnected(): boolean {
  const realtime = useRealtime();
  const [connected, setConnected] = useState(realtime.isConnected());
  useEffect(() => realtime.onStatus(setConnected), [realtime]);
  return connected;
}
