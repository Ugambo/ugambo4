import { Logger } from '@nestjs/common';
import type { SmsMessage, SmsProvider } from './sms.provider';

/** Development only: writes messages to the log so you can sign in locally. */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';
  private readonly logger = new Logger('ConsoleSms');

  async send(message: SmsMessage): Promise<void> {
    this.logger.warn(`[DEV SMS] to ${message.to}: ${message.text}`);
  }
}
