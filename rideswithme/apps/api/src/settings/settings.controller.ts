import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import type {
  AdminVehicleCategoryView,
  SettingView,
  SupportContactView,
} from '@rideswithme/shared-types';
import { updateSettingsSchema, updateVehicleCategorySchema } from '@rideswithme/validation';
import { z } from 'zod';
import { CurrentPrincipal, type Principal, Public, RequirePermissions } from '../auth/principal';
import { ReqContext, type RequestContext } from '../common/request-context';
import { zod } from '../common/zod-validation.pipe';
import { SettingsService } from './settings.service';

const categoryKey = z.string().regex(/^[a-z][a-z0-9_]{1,30}$/);

@Controller('v1')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('admin/settings')
  @RequirePermissions('settings.manage')
  list(): Promise<SettingView[]> {
    return this.settings.list();
  }

  /** Changes several settings at once (null resets one to its .env value). Audited with the reason. */
  @Patch('admin/settings')
  @RequirePermissions('settings.manage')
  update(
    @CurrentPrincipal() p: Principal,
    @Body(zod(updateSettingsSchema)) body: z.output<typeof updateSettingsSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<SettingView[]> {
    return this.settings.update(body, { userId: p.userId }, ctx);
  }

  @Get('admin/vehicle-categories')
  @RequirePermissions('settings.manage')
  vehicleCategories(): Promise<AdminVehicleCategoryView[]> {
    return this.settings.vehicleCategories();
  }

  @Patch('admin/vehicle-categories/:key')
  @RequirePermissions('settings.manage')
  updateVehicleCategory(
    @CurrentPrincipal() p: Principal,
    @Param('key', zod(categoryKey)) key: string,
    @Body(zod(updateVehicleCategorySchema)) body: z.output<typeof updateVehicleCategorySchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<AdminVehicleCategoryView[]> {
    return this.settings.updateVehicleCategory(key, body, { userId: p.userId }, ctx);
  }

  /** How to reach support, for the apps and websites. */
  @Public()
  @Get('support-contact')
  supportContact(): SupportContactView {
    return this.settings.supportContact();
  }
}
