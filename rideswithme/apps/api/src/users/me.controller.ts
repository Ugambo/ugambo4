import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { MeResponse } from '@rideswithme/shared-types';
import { updateMeSchema } from '@rideswithme/validation';
import type { z } from 'zod';
import { CurrentPrincipal, type Principal } from '../auth/principal';
import { zod } from '../common/zod-validation.pipe';
import { UsersService } from './users.service';

@Controller('v1/me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  get(@CurrentPrincipal() principal: Principal): Promise<MeResponse> {
    return this.users.getMe(principal.userId, principal.mfaVerified);
  }

  @Patch()
  update(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(updateMeSchema)) body: z.output<typeof updateMeSchema>,
  ): Promise<MeResponse> {
    return this.users.updateMe(principal.userId, body, principal.mfaVerified);
  }
}
