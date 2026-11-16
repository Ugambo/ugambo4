import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { ExpoPushProvider, LogPushProvider, PUSH_PROVIDER } from './push.provider';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    {
      provide: PUSH_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) =>
        c.PUSH_PROVIDER === 'expo'
          ? new ExpoPushProvider(c.EXPO_ACCESS_TOKEN)
          : new LogPushProvider(),
    },
    NotificationsService,
  ],
  exports: [NotificationsService, PUSH_PROVIDER],
})
export class NotificationsModule {}
