import { describe, expect, it, vi } from 'vitest';
import { SmsDeliveryError } from './sms.provider';
import { TermiiSmsProvider } from './termii-sms.provider';

const options = {
  apiKey: 'key',
  senderId: 'RideswithMe',
  baseUrl: 'https://termii.test/',
  channel: 'dnd' as const,
};

describe('TermiiSmsProvider', () => {
  it('posts the message in Termii format without the + on the number', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    await new TermiiSmsProvider(options, fetchMock as never).send({
      to: '+2348031234567',
      text: 'hi',
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://termii.test/api/sms/send');
    expect(JSON.parse(init.body as string)).toMatchObject({
      to: '2348031234567',
      from: 'RideswithMe',
      sms: 'hi',
      channel: 'dnd',
      api_key: 'key',
    });
  });

  it('raises SmsDeliveryError without leaking the response body', async () => {
    const fetchMock = vi.fn(async () => new Response('{"message":"code 123456"}', { status: 400 }));
    const err = await new TermiiSmsProvider(options, fetchMock as never)
      .send({ to: '+2348031234567', text: 'code 123456' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SmsDeliveryError);
    expect(String(err)).not.toContain('123456');
  });
});
