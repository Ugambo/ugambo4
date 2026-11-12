import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { AppConfig } from './config/config';

/** HTTP settings shared by main.ts and the integration tests. */
export function configureApp(app: INestApplication, config: AppConfig) {
  const express = app as NestExpressApplication;
  // Needed so req.ip is the client, not the reverse proxy, for rate limits and audit logs.
  express.set('trust proxy', config.TRUST_PROXY_HOPS);
  express.disable('x-powered-by');
  express.useBodyParser('json', { limit: '100kb' });
  app.use(helmet());
  app.enableCors({
    origin: config.CORS_ORIGINS.length ? config.CORS_ORIGINS : false,
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
  });
  app.enableShutdownHooks();
}
