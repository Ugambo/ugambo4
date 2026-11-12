import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRealtime } from './realtime';

let io: Server | null = null;

async function server(accept: (token: string) => string | null) {
  const http = createServer();
  io = new Server(http, { path: '/realtime' });
  io.use((socket, next) => {
    const error = accept(String(socket.handshake.auth.token));
    if (error) next(new Error(error));
    else next();
  });
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
}

const until = async (check: () => boolean, ms = 5000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};

afterEach(async () => {
  await new Promise<void>((r) => (io ? io.close(() => r()) : r()));
  io = null;
});

describe('createRealtime', () => {
  it('refreshes an expired token and reconnects with the new one', async () => {
    let token = 'expired';
    const url = await server((t) => (t === 'fresh' ? null : 'UNAUTHENTICATED'));
    const refresh = vi.fn(async () => {
      token = 'fresh';
      return true;
    });
    const rt = createRealtime({
      url,
      getToken: async () => token,
      refresh,
      onSessionEnded: vi.fn(),
    });
    rt.start();
    await until(() => rt.isConnected());
    expect(refresh).toHaveBeenCalledOnce();
    rt.stop();
  });

  it('signs out when the server says the session is over', async () => {
    const url = await server(() => 'SESSION_REVOKED');
    const onSessionEnded = vi.fn();
    const rt = createRealtime({
      url,
      getToken: async () => 'any',
      refresh: vi.fn(),
      onSessionEnded,
    });
    rt.start();
    await until(() => onSessionEnded.mock.calls.length > 0);
    rt.stop();
  });

  it('delivers events and tells the app to refetch after a dropped connection', async () => {
    const url = await server(() => null);
    const rt = createRealtime({
      url,
      getToken: async () => 't',
      refresh: vi.fn(),
      onSessionEnded: vi.fn(),
    });
    const updates: unknown[] = [];
    rt.on('ride:updated', (p) => updates.push(p));
    const onReconnect = vi.fn();
    rt.onReconnect(onReconnect);
    rt.start();
    await until(() => rt.isConnected());
    expect(onReconnect).not.toHaveBeenCalled();

    io!.emit('ride:updated', { id: 'r1' });
    await until(() => updates.length === 1);

    // Simulate the network dropping (not a deliberate server disconnect).
    for (const s of await io!.fetchSockets())
      (s as unknown as { conn: { close(): void } }).conn.close();
    await until(() => onReconnect.mock.calls.length === 1);
    expect(rt.isConnected()).toBe(true);
    rt.stop();
  });
});
