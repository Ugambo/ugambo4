import { timingSafeEqual } from 'node:crypto';
import { Controller, Get, Headers, Inject, NotFoundException, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/principal';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { MetricsService } from './metrics.service';

/** Prometheus scrape endpoint, behind a bearer token (404 when METRICS_TOKEN is unset or wrong). */
@Public()
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  async scrape(@Headers('authorization') auth: string | undefined, @Res() res: Response) {
    const expected = this.config.METRICS_TOKEN;
    const given = Buffer.from(auth?.replace(/^Bearer /, '') ?? '');
    if (
      !expected ||
      given.length !== expected.length ||
      !timingSafeEqual(given, Buffer.from(expected))
    )
      throw new NotFoundException();
    res.type(this.metrics.registry.contentType).send(await this.metrics.registry.metrics());
  }
}
