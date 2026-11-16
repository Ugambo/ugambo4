import { Logger } from '@nestjs/common';

export interface PushMessage {
  tokens: string[];
  title: string;
  body: string;
  data: Record<string, string>;
}

export interface PushProvider {
  readonly name: string;
  /** Returns tokens the service says are no longer valid (to forget them). */
  send(message: PushMessage): Promise<{ invalidTokens: string[] }>;
}

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

/** Development: writes pushes to the log. */
export class LogPushProvider implements PushProvider {
  readonly name = 'log';
  private readonly logger = new Logger('Push');
  readonly sent: PushMessage[] = [];
  async send(message: PushMessage) {
    this.sent.push(message);
    this.logger.log({ to: message.tokens.length, title: message.title }, 'Push (not sent)');
    return { invalidTokens: [] };
  }
}

/** Expo's push service (works for both Android and iOS builds made with EAS). */
export class ExpoPushProvider implements PushProvider {
  readonly name = 'expo';
  constructor(
    private readonly accessToken: string | undefined,
    private readonly url = 'https://exp.host/--/api/v2/push/send',
  ) {}

  async send(message: PushMessage) {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(this.accessToken && { Authorization: `Bearer ${this.accessToken}` }),
      },
      body: JSON.stringify(
        message.tokens.map((to) => ({
          to,
          title: message.title,
          body: message.body,
          data: message.data,
          sound: 'default',
          priority: 'high',
        })),
      ),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Expo push failed: ${res.status}`);
    const json = (await res.json()) as {
      data?: { status: string; details?: { error?: string } }[];
    };
    const invalidTokens = (json.data ?? []).flatMap((t, i) =>
      t.status === 'error' && t.details?.error === 'DeviceNotRegistered'
        ? [message.tokens[i]!]
        : [],
    );
    return { invalidTokens };
  }
}
