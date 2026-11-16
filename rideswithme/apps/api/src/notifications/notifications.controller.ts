import { Body, Controller, Delete, Get, HttpCode, Post, Put } from '@nestjs/common';
import type { NotificationView } from '@rideswithme/shared-types';
import { pushTokenSchema } from '@rideswithme/validation';
import { z } from 'zod';
import { CurrentPrincipal, type Principal } from '../auth/principal';
import { zod } from '../common/zod-validation.pipe';
import { NotificationsService } from './notifications.service';

const readSchema = z
  .object({ ids: z.array(z.string().uuid()).max(100).optional(), all: z.boolean().optional() })
  .strict();

@Controller('v1/me')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('notifications')
  list(@CurrentPrincipal() p: Principal): Promise<{ items: NotificationView[]; unread: number }> {
    return this.notifications.list(p.userId);
  }

  @Post('notifications/read')
  @HttpCode(204)
  async read(
    @CurrentPrincipal() p: Principal,
    @Body(zod(readSchema)) body: z.output<typeof readSchema>,
  ) {
    await this.notifications.markRead(p.userId, body.all ? 'all' : (body.ids ?? []));
  }

  /** The app's push token (from Expo), so notifications reach the phone. */
  @Put('push-token')
  @HttpCode(204)
  async register(
    @CurrentPrincipal() p: Principal,
    @Body(zod(pushTokenSchema)) body: z.output<typeof pushTokenSchema>,
  ) {
    await this.notifications.registerToken(p.userId, body);
  }

  @Delete('push-token')
  @HttpCode(204)
  async forget(
    @CurrentPrincipal() p: Principal,
    @Body(zod(z.object({ token: z.string().max(300) }).strict())) body: { token: string },
  ) {
    await this.notifications.forgetToken(p.userId, body.token);
  }
}
