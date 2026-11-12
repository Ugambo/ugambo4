import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { ConsoleSmsProvider } from './console-sms.provider';
import { SMS_PROVIDER, type SmsProvider } from './sms.provider';
import { TermiiSmsProvider } from './termii-sms.provider';

@Global()
@Module({
  providers: [
    {
      provide: SMS_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig): SmsProvider => {
        switch (c.SMS_PROVIDER) {
          case 'termii':
            return new TermiiSmsProvider({
              apiKey: c.TERMII_API_KEY!,
              senderId: c.TERMII_SENDER_ID!,
              baseUrl: c.TERMII_BASE_URL,
              channel: c.TERMII_CHANNEL,
            });
          case 'console':
            return new ConsoleSmsProvider();
        }
      },
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
