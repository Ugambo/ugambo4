import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  type PipeTransform,
  Post,
  Put,
} from '@nestjs/common';
import type {
  DocumentUploadTicket,
  DriverDocumentView,
  DriverOnboardingView,
  VehicleCategorySummary,
} from '@rideswithme/shared-types';
import {
  payoutAccountSchema,
  requestDocumentUploadSchema,
  submitDocumentSchema,
  updateDriverProfileSchema,
  upsertVehicleSchema,
} from '@rideswithme/validation';
import type { z } from 'zod';
import { CurrentPrincipal, type Principal, Public } from '../auth/principal';
import { ReqContext, type RequestContext } from '../common/request-context';
import { ZodValidationPipe, zod } from '../common/zod-validation.pipe';
import { DriverOnboardingService } from './driver-onboarding.service';
import { DriverViewService } from './driver-view.service';

/** Validates with a schema built per request, so "next model year" follows the calendar. */
class VehiclePipe implements PipeTransform {
  transform(value: unknown) {
    return new ZodValidationPipe(upsertVehicleSchema()).transform(value);
  }
}

@Controller('v1')
export class DriverController {
  constructor(
    private readonly onboarding: DriverOnboardingService,
    private readonly views: DriverViewService,
  ) {}

  @Public()
  @Get('vehicle-categories')
  categories(): Promise<VehicleCategorySummary[]> {
    return this.views.listCategories();
  }

  @Post('driver/registration')
  @HttpCode(200)
  register(
    @CurrentPrincipal() p: Principal,
    @ReqContext() ctx: RequestContext,
  ): Promise<DriverOnboardingView> {
    return this.onboarding.register(p.userId, ctx);
  }

  @Get('driver/onboarding')
  view(@CurrentPrincipal() p: Principal): Promise<DriverOnboardingView> {
    return this.onboarding.getView(p.userId);
  }

  @Patch('driver/profile')
  updateProfile(
    @CurrentPrincipal() p: Principal,
    @Body(zod(updateDriverProfileSchema)) body: z.output<typeof updateDriverProfileSchema>,
  ): Promise<DriverOnboardingView> {
    return this.onboarding.updateProfile(p.userId, body);
  }

  @Put('driver/vehicle')
  upsertVehicle(
    @CurrentPrincipal() p: Principal,
    @Body(VehiclePipe) body: z.output<ReturnType<typeof upsertVehicleSchema>>,
  ): Promise<DriverOnboardingView> {
    return this.onboarding.upsertVehicle(p.userId, body);
  }

  @Put('driver/payout-account')
  setPayoutAccount(
    @CurrentPrincipal() p: Principal,
    @Body(zod(payoutAccountSchema)) body: z.output<typeof payoutAccountSchema>,
  ): Promise<DriverOnboardingView> {
    return this.onboarding.setPayoutAccount(p.userId, body);
  }

  @Post('driver/documents/uploads')
  @HttpCode(200)
  requestUpload(
    @CurrentPrincipal() p: Principal,
    @Body(zod(requestDocumentUploadSchema)) body: z.output<typeof requestDocumentUploadSchema>,
  ): Promise<DocumentUploadTicket> {
    return this.onboarding.requestUpload(p.userId, body);
  }

  @Post('driver/documents')
  submitDocument(
    @CurrentPrincipal() p: Principal,
    @Body(zod(submitDocumentSchema)) body: z.output<typeof submitDocumentSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<DriverDocumentView> {
    return this.onboarding.submitDocument(p.userId, body, ctx);
  }

  @Post('driver/submit')
  @HttpCode(200)
  submit(
    @CurrentPrincipal() p: Principal,
    @ReqContext() ctx: RequestContext,
  ): Promise<DriverOnboardingView> {
    return this.onboarding.submitForReview(p.userId, ctx);
  }
}
