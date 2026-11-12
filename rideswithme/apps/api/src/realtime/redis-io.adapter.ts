import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';
import type { AppConfig } from '../config/config';

export const REALTIME_PATH = '/realtime';

/**
 * Socket.IO over Redis pub/sub, so an event emitted on one API copy reaches
 * clients connected to any other copy.
 */
export class RedisIoAdapter extends IoAdapter {
  private pub: Redis | null = null;
  private sub: Redis | null = null;
  private adapter: ReturnType<typeof createAdapter> | null = null;

  constructor(
    app: INestApplicationContext,
    private readonly config: AppConfig,
  ) {
    super(app);
  }

  async connect(): Promise<void> {
    this.pub = new Redis(this.config.REDIS_URL, { maxRetriesPerRequest: 2 });
    this.sub = this.pub.duplicate();
    this.adapter = createAdapter(this.pub, this.sub);
  }

  override createIOServer(port: number, options?: Partial<ServerOptions>): Server {
    const server = super.createIOServer(port, {
      ...options,
      path: REALTIME_PATH,
      cors: {
        origin: this.config.CORS_ORIGINS.length ? this.config.CORS_ORIGINS : false,
        credentials: true,
      },
      // Phones on weak networks: generous ping timeout before declaring a client gone.
      pingInterval: 25_000,
      pingTimeout: 30_000,
      maxHttpBufferSize: 512 * 1024,
    }) as Server;
    if (this.adapter) server.adapter(this.adapter);
    return server;
  }

  override async dispose(): Promise<void> {
    await super.dispose();
    await Promise.all([
      this.pub?.quit().catch(() => undefined),
      this.sub?.quit().catch(() => undefined),
    ]);
  }
}
