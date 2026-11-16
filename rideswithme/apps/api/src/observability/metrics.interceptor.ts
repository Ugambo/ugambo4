import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { finalize, type Observable } from 'rxjs';
import { MetricsService } from './metrics.service';

/** Times every HTTP request by its route pattern (never the raw URL, which holds ids). */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const end = this.metrics.http.startTimer();
    return next.handle().pipe(
      finalize(() => {
        const route = (req.route as { path?: string } | undefined)?.path ?? 'unmatched';
        end({ method: req.method, route, status: String(res.statusCode) });
      }),
    );
  }
}
