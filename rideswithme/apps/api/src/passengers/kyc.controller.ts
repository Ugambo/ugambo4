import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type {
  AdminPassengerVerificationDetail,
  AdminPassengerVerificationItem,
  KycUploadTicket,
  PassengerVerificationView,
} from '@rideswithme/shared-types';
import {
  listKycQuerySchema,
  rejectKycSchema,
  requestKycUploadSchema,
  submitKycSchema,
  uuidSchema,
} from '@rideswithme/validation';
import { z } from 'zod';
import { CurrentPrincipal, type Principal, RequirePermissions } from '../auth/principal';
import { ReqContext, type RequestContext } from '../common/request-context';
import { zod } from '../common/zod-validation.pipe';
import { KycService } from './kyc.service';

const whichSchema = z.object({ which: z.enum(['id', 'selfie']) }).strict();

/** The passenger's own identity check. */
@Controller('v1/me/verification')
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Get()
  view(@CurrentPrincipal() p: Principal): Promise<PassengerVerificationView> {
    return this.kyc.view(p.userId);
  }

  @Post('uploads')
  requestUpload(
    @CurrentPrincipal() p: Principal,
    @Body(zod(requestKycUploadSchema)) body: z.output<typeof requestKycUploadSchema>,
  ): Promise<KycUploadTicket> {
    return this.kyc.requestUpload(p.userId, body);
  }

  @Post()
  @HttpCode(200)
  submit(
    @CurrentPrincipal() p: Principal,
    @Body(zod(submitKycSchema)) body: z.output<typeof submitKycSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<PassengerVerificationView> {
    return this.kyc.submit(p.userId, body, ctx);
  }
}

/** Staff review of passengers' identity checks. */
@Controller('v1/admin/passenger-verifications')
export class AdminKycController {
  constructor(private readonly kyc: KycService) {}

  @Get()
  @RequirePermissions('passengers.verify')
  list(
    @Query(zod(listKycQuerySchema)) q: z.output<typeof listKycQuerySchema>,
  ): Promise<AdminPassengerVerificationItem[]> {
    return this.kyc.list(q.status);
  }

  @Get(':userId')
  @RequirePermissions('passengers.verify')
  detail(
    @Param('userId', zod(uuidSchema)) userId: string,
  ): Promise<AdminPassengerVerificationDetail> {
    return this.kyc.detail(userId);
  }

  @Post(':userId/view-url')
  @HttpCode(200)
  @RequirePermissions('passengers.verify')
  viewUrl(
    @CurrentPrincipal() p: Principal,
    @Param('userId', zod(uuidSchema)) userId: string,
    @Body(zod(whichSchema)) body: z.output<typeof whichSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<{ url: string; expiresAt: string }> {
    return this.kyc.viewUrl(userId, body.which, { userId: p.userId }, ctx);
  }

  @Post(':userId/approve')
  @HttpCode(200)
  @RequirePermissions('passengers.verify')
  approve(
    @CurrentPrincipal() p: Principal,
    @Param('userId', zod(uuidSchema)) userId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<AdminPassengerVerificationDetail> {
    return this.kyc.approve(userId, { userId: p.userId }, ctx);
  }

  @Post(':userId/reject')
  @HttpCode(200)
  @RequirePermissions('passengers.verify')
  reject(
    @CurrentPrincipal() p: Principal,
    @Param('userId', zod(uuidSchema)) userId: string,
    @Body(zod(rejectKycSchema)) body: z.output<typeof rejectKycSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<AdminPassengerVerificationDetail> {
    return this.kyc.reject(userId, body.reason, { userId: p.userId }, ctx);
  }
}
