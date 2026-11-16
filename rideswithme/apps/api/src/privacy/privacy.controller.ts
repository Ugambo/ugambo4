import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import type { AdminDeletionRequestView, DeletionRequestView } from '@rideswithme/shared-types';
import { deletionRequestSchema } from '@rideswithme/validation';
import type { z } from 'zod';
import { CurrentPrincipal, type Principal, RequirePermissions } from '../auth/principal';
import { ReqContext, type RequestContext } from '../common/request-context';
import { zod } from '../common/zod-validation.pipe';
import { DeletionService } from './deletion.service';

@Controller('v1')
export class PrivacyController {
  constructor(private readonly deletion: DeletionService) {}

  @Get('me/deletion-request')
  mine(@CurrentPrincipal() p: Principal): Promise<DeletionRequestView | null> {
    return this.deletion.mine(p.userId);
  }

  /** Asks for the account to be deleted after the grace period (NDPA). */
  @Post('me/deletion-request')
  request(
    @CurrentPrincipal() p: Principal,
    @Body(zod(deletionRequestSchema)) body: z.output<typeof deletionRequestSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<DeletionRequestView> {
    return this.deletion.request(p.userId, body.reason, ctx);
  }

  @Delete('me/deletion-request')
  @HttpCode(204)
  async cancel(@CurrentPrincipal() p: Principal, @ReqContext() ctx: RequestContext) {
    await this.deletion.cancel(p.userId, ctx);
  }

  @Get('admin/deletion-requests')
  @RequirePermissions('privacy.manage')
  list(): Promise<AdminDeletionRequestView[]> {
    return this.deletion.list();
  }
}
