import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import type { PromotionView } from '@rideswithme/shared-types';
import { promotionSchema, updatePromotionSchema, uuidSchema } from '@rideswithme/validation';
import type { z } from 'zod';
import { CurrentPrincipal, type Principal, RequirePermissions } from '../auth/principal';
import { ReqContext, type RequestContext } from '../common/request-context';
import { zod } from '../common/zod-validation.pipe';
import { PromotionsService } from './promotions.service';

@Controller('v1/admin/promotions')
export class AdminPromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  @RequirePermissions('rides.read')
  list(): Promise<PromotionView[]> {
    return this.promotions.list();
  }

  @Post()
  @RequirePermissions('promotions.manage')
  create(
    @CurrentPrincipal() p: Principal,
    @Body(zod(promotionSchema)) body: z.output<typeof promotionSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<PromotionView> {
    return this.promotions.create(p, body, ctx);
  }

  @Patch(':id')
  @RequirePermissions('promotions.manage')
  update(
    @CurrentPrincipal() p: Principal,
    @Param('id', zod(uuidSchema)) id: string,
    @Body(zod(updatePromotionSchema)) body: z.output<typeof updatePromotionSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<PromotionView> {
    return this.promotions.update(p, id, body, ctx);
  }
}
