export interface SmsMessage {
  /** E.164 phone number. */
  to: string;
  text: string;
}

/** Vendor-neutral SMS interface. Implementations must not log message text in production. */
export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<void>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export class SmsDeliveryError extends Error {}
