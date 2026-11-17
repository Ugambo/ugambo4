import { Body, Controller, Delete, Get, Put, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { BrandingView } from '@rideswithme/shared-types';
import { ErrorCode } from '@rideswithme/shared-types';
import { uploadLogoSchema } from '@rideswithme/validation';
import type { z } from 'zod';
import { CurrentPrincipal, type Principal, Public, RequirePermissions } from '../auth/principal';
import { AppException } from '../common/app-exception';
import { ReqContext, type RequestContext } from '../common/request-context';
import { zod } from '../common/zod-validation.pipe';
import { BrandingService } from './branding.service';

@Controller('v1')
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  /** Which logo to show (null: the built-in mark). For the websites and the phone apps. */
  @Public()
  @Get('branding')
  view(): Promise<BrandingView> {
    return this.branding.view();
  }

  /** The logo image. Its address carries the version, so it can be cached for long. */
  @Public()
  @Get('branding/logo')
  async logo(@Res() res: Response): Promise<void> {
    const logo = await this.branding.logo();
    if (!logo) throw new AppException(ErrorCode.NOT_FOUND, 'No logo has been set');
    res.setHeader('Content-Type', logo.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('ETag', `"${logo.version}"`);
    // Shown as an image only: nothing in it may run or be framed.
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(logo.data);
  }

  @Put('admin/branding/logo')
  @RequirePermissions('settings.manage')
  setLogo(
    @CurrentPrincipal() p: Principal,
    @Body(zod(uploadLogoSchema)) body: z.output<typeof uploadLogoSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<BrandingView> {
    return this.branding.setLogo(body.imageBase64, { userId: p.userId }, ctx);
  }

  /** Back to the built-in "R" mark. */
  @Delete('admin/branding/logo')
  @RequirePermissions('settings.manage')
  removeLogo(
    @CurrentPrincipal() p: Principal,
    @ReqContext() ctx: RequestContext,
  ): Promise<BrandingView> {
    return this.branding.removeLogo({ userId: p.userId }, ctx);
  }
}
