import { io, type Socket } from 'socket.io-client';
import type { Harness } from './harness';

export interface TestSocket {
  socket: Socket;
  /** Waits for the next event of this name that matches. */
  next<T = unknown>(event: string, match?: (payload: T) => boolean, timeoutMs?: number): Promise<T>;
  close(): void;
}

/** Connects a realtime client; resolves on connect, rejects with the server's error code. */
export async function connect(h: Harness, token: string | undefined): Promise<TestSocket> {
  const socket = io(h.url, {
    path: '/realtime',
    auth: token === undefined ? {} : { token },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  const buffered: { event: string; payload: unknown }[] = [];
  const waiters: {
    event: string;
    match: (p: unknown) => boolean;
    resolve: (p: unknown) => void;
  }[] = [];
  socket.onAny((event: string, payload: unknown) => {
    const i = waiters.findIndex((w) => w.event === event && w.match(payload));
    if (i >= 0) waiters.splice(i, 1)[0]!.resolve(payload);
    else buffered.push({ event, payload });
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (err) => reject(err));
  });
  return {
    socket,
    next: <T>(event: string, match: (p: T) => boolean = () => true, timeoutMs = 5000) =>
      new Promise<T>((resolve, reject) => {
        const i = buffered.findIndex((b) => b.event === event && match(b.payload as T));
        if (i >= 0) return resolve(buffered.splice(i, 1)[0]!.payload as T);
        const timer = setTimeout(
          () => reject(new Error(`No "${event}" within ${timeoutMs} ms`)),
          timeoutMs,
        );
        waiters.push({
          event,
          match: (p) => match(p as T),
          resolve: (p) => {
            clearTimeout(timer);
            resolve(p as T);
          },
        });
      }),
    close: () => socket.close(),
  };
}

export function bearer(auth: string): string {
  return auth.replace(/^Bearer /, '');
}

/** socket.emit with an acknowledgement. */
export function ask<T>(s: TestSocket, event: string, payload: unknown): Promise<T> {
  return s.socket.timeout(5000).emitWithAck(event, payload) as Promise<T>;
}
