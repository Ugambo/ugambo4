import type { SmsMessage, SmsProvider } from './sms.provider';
import { SmsDeliveryError } from './sms.provider';

export interface TermiiOptions {
  apiKey: string;
  senderId: string;
  baseUrl: string;
  /** "dnd" reaches numbers on the Do-Not-Disturb list (needed for OTP); "generic" does not. */
  channel: 'generic' | 'dnd';
  timeoutMs?: number;
}

/**
 * Termii (Nigerian SMS gateway). Not exercised against the live API yet: verify
 * with a real key and sender ID before launch (see documentation/DECISIONS.md).
 */
export class TermiiSmsProvider implements SmsProvider {
  readonly name = 'termii';

  constructor(
    private readonly options: TermiiOptions,
    private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  async send(message: SmsMessage): Promise<void> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.options.baseUrl.replace(/\/$/, '')}/api/sms/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: this.options.apiKey,
          to: message.to.replace(/^\+/, ''),
          from: this.options.senderId,
          sms: message.text,
          type: 'plain',
          channel: this.options.channel,
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
    } catch (err) {
      throw new SmsDeliveryError(`Termii request failed: ${(err as Error).message}`);
    }
    if (!res.ok) {
      // Do not include the response body: it can echo the message text (the OTP).
      throw new SmsDeliveryError(`Termii responded with HTTP ${res.status}`);
    }
  }
}
