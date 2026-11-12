import { io, type Socket } from 'socket.io-client';

export type RealtimeListener = (payload: never) => void;

/**
 * A realtime connection to the API (Socket.IO at /realtime).
 * - Uses a fresh access token on every (re)connect.
 * - If the server refuses an expired token, refreshes once and reconnects.
 * - Reconnects on its own after network drops (back-off up to 15 s); callers
 *   refetch state in onReconnect, since events sent while offline are missed.
 */
export function createRealtime(options: {
  url: string;
  getToken: () => Promise<string | null>;
  refresh: () => Promise<boolean>;
  onSessionEnded: () => void;
}) {
  let socket: Socket | null = null;
  const reconnectListeners = new Set<() => void>();
  const statusListeners = new Set<(connected: boolean) => void>();
  const eventListeners = new Map<string, Set<(payload: unknown) => void>>();
  let everConnected = false;

  function start() {
    if (socket) return;
    const s = io(options.url, {
      path: '/realtime',
      transports: ['websocket'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15_000,
      auth: (cb) => {
        void options.getToken().then((token) => cb({ token: token ?? '' }));
      },
    });
    s.on('connect', () => {
      statusListeners.forEach((l) => l(true));
      if (everConnected) reconnectListeners.forEach((l) => l());
      everConnected = true;
    });
    s.on('disconnect', () => statusListeners.forEach((l) => l(false)));
    s.on('connect_error', (err: Error) => {
      // A refused handshake is not retried automatically: refresh the token and try again.
      if (err.message === 'UNAUTHENTICATED') {
        void options.refresh().then((ok) => {
          if (ok) setTimeout(() => s.connect(), 1000);
        });
      } else if (err.message === 'SESSION_REVOKED') {
        options.onSessionEnded();
      }
    });
    s.on('session:ended', () => options.onSessionEnded());
    s.onAny((event: string, payload: unknown) =>
      eventListeners.get(event)?.forEach((l) => l(payload)),
    );
    socket = s;
  }

  function stop() {
    socket?.disconnect();
    socket = null;
    everConnected = false;
  }

  return {
    start,
    stop,
    isConnected: () => socket?.connected ?? false,
    on<T>(event: string, listener: (payload: T) => void): () => void {
      const set = eventListeners.get(event) ?? new Set();
      set.add(listener as (payload: unknown) => void);
      eventListeners.set(event, set);
      return () => set.delete(listener as (payload: unknown) => void);
    },
    onReconnect(listener: () => void): () => void {
      reconnectListeners.add(listener);
      return () => reconnectListeners.delete(listener);
    },
    onStatus(listener: (connected: boolean) => void): () => void {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    /** Sends with an acknowledgement; rejects after the timeout or when offline. */
    async request<T>(event: string, payload: unknown, timeoutMs = 10_000): Promise<T> {
      if (!socket?.connected) throw new Error('offline');
      return (await socket.timeout(timeoutMs).emitWithAck(event, payload)) as T;
    },
  };
}

export type Realtime = ReturnType<typeof createRealtime>;
