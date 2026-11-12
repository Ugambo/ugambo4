import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export function requestContextFrom(req: Request & { id?: unknown }): RequestContext {
  const ua = req.headers['user-agent'];
  return {
    ip: req.ip ?? null,
    userAgent: typeof ua === 'string' ? ua.slice(0, 512) : null,
    requestId: typeof req.id === 'string' ? req.id : null,
  };
}

/** Injects IP, user agent and request id for audit logging. */
export const ReqContext = createParamDecorator((_: unknown, ctx: ExecutionContext) =>
  requestContextFrom(ctx.switchToHttp().getRequest()),
);
