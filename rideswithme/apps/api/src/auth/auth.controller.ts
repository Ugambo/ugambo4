import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import type {
  AuthTokens,
  MeResponse,
  OtpRequestResponse,
  SessionSummary,
  TotpSetupResponse,
  VerifyOtpResponse,
} from '@rideswithme/shared-types';
import { ErrorCode } from '@rideswithme/shared-types';
import {
  refreshTokenSchema,
  requestOtpSchema,
  totpVerifySchema,
  uuidSchema,
  verifyOtpSchema,
} from '@rideswithme/validation';
import type { z } from 'zod';
import { AppException } from '../common/app-exception';
import { languageFromHeader } from '../common/language';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service';
import { ReqContext, type RequestContext } from '../common/request-context';
import { zod } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import { CurrentPrincipal, type Principal, Public } from './principal';
import { SessionService } from './session.service';

@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly mfa: MfaService,
    @Inject(RateLimiterService) private readonly rateLimiter: RateLimiterService,
  ) {}

  @Public()
  @Post('otp/request')
  @HttpCode(200)
  requestOtp(
    @Body(zod(requestOtpSchema)) body: z.output<typeof requestOtpSchema>,
    @Headers('accept-language') acceptLanguage: string | undefined,
    @ReqContext() ctx: RequestContext,
  ): Promise<OtpRequestResponse> {
    return this.auth.requestOtp(
      body.phone,
      body.language ?? (acceptLanguage ? languageFromHeader(acceptLanguage) : undefined),
      ctx,
    );
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(
    @Body(zod(verifyOtpSchema)) body: z.output<typeof verifyOtpSchema>,
    @Headers('accept-language') acceptLanguage: string | undefined,
    @ReqContext() ctx: RequestContext,
  ): Promise<VerifyOtpResponse> {
    return this.auth.verifyOtp(body, languageFromHeader(acceptLanguage), ctx);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body(zod(refreshTokenSchema)) body: z.output<typeof refreshTokenSchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<AuthTokens> {
    if (ctx.ip)
      await this.rateLimiter.consume(
        { name: 'refresh_ip', limit: 120, windowSeconds: 600 },
        ctx.ip,
      );
    return this.sessions.refresh(body.refreshToken, ctx);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentPrincipal() principal: Principal): Promise<void> {
    await this.sessions.revoke(principal.sessionId, 'logout');
  }

  @Get('sessions')
  listSessions(@CurrentPrincipal() principal: Principal): Promise<SessionSummary[]> {
    return this.sessions.listActive(principal.userId, principal.sessionId);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revokeSession(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(uuidSchema)) id: string,
  ): Promise<void> {
    if (!(await this.sessions.revokeOwn(principal.userId, id))) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Session not found');
    }
  }

  @Post('mfa/totp/setup')
  @HttpCode(200)
  totpSetup(@CurrentPrincipal() principal: Principal): Promise<TotpSetupResponse> {
    return this.mfa.setup(principal);
  }

  @Post('mfa/totp/activate')
  @HttpCode(200)
  totpActivate(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(totpVerifySchema)) body: z.output<typeof totpVerifySchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<MeResponse> {
    return this.mfa.activate(principal, body.code, ctx);
  }

  @Post('mfa/totp/verify')
  @HttpCode(200)
  totpVerify(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(totpVerifySchema)) body: z.output<typeof totpVerifySchema>,
    @ReqContext() ctx: RequestContext,
  ): Promise<MeResponse> {
    return this.mfa.verify(principal, body.code, ctx);
  }
}
