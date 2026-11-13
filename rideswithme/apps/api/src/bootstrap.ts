import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { AppConfig } from './config/config';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

/** HTTP settings shared by main.ts and the integration tests. */
export async function configureApp(app: INestApplication, config: AppConfig) {
  // Realtime (Socket.IO at /realtime) over Redis so all API copies share events.
  const ws = new RedisIoAdapter(app, config);
  await ws.connect();
  app.useWebSocketAdapter(ws);

  const express = app as NestExpressApplication;
  // Needed so req.ip is the client, not the reverse proxy, for rate limits and audit logs.
  express.set('trust proxy', config.TRUST_PROXY_HOPS);
  express.disable('x-powered-by');
  express.useBodyParser('json', {
    limit: '100kb',
    // Webhook signatures are checked against the exact bytes received.
    verify: (req: { url?: string; rawBody?: Buffer }, _res: unknown, buf: Buffer) => {
      if (req.url?.startsWith('/v1/webhooks/')) req.rawBody = buf;
    },
  });
  app.use(helmet());
  app.enableCors({
    origin: config.CORS_ORIGINS.length ? config.CORS_ORIGINS : false,
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
  });
  app.enableShutdownHooks();
}
