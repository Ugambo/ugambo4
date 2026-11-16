import { describe, expect, it } from 'vitest';
import { scrubBreadcrumb, scrubErrorEvent, scrubText, scrubUrl } from './error-scrub';

const RIDE = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';

describe('scrubUrl', () => {
  it('removes query strings and fragments, and hides share tokens', () => {
    expect(scrubUrl('https://rideswithme.ng/track/AbC_dEf123?x=1#top')).toBe(
      'https://rideswithme.ng/track/:token',
    );
    expect(scrubUrl('/api/track/Zz9-short')).toBe('/api/track/:token');
    expect(scrubUrl('https://api.example.ng/v1/share/tok')).toBe(
      'https://api.example.ng/v1/share/:token',
    );
    expect(scrubUrl('/wallet?reference=rwm_123&phone=0803')).toBe('/wallet');
  });

  it('keeps ids and ordinary paths, and hides other long opaque segments', () => {
    expect(scrubUrl(`/rides/${RIDE}/receipt`)).toBe(`/rides/${RIDE}/receipt`);
    expect(scrubUrl('/v1/payments/verify/abcdefghijklmnopqrstuvwxyz012345')).toBe(
      '/v1/payments/verify/:token',
    );
    expect(scrubUrl('/sign-in')).toBe('/sign-in');
    expect(scrubUrl('')).toBe('');
  });
});

describe('scrubErrorEvent', () => {
  it('keeps the error and where it happened, and nothing about the person', () => {
    const e = scrubErrorEvent({
      exception: { values: [{ value: 'TypeError' }] },
      request: {
        url: 'https://rideswithme.ng/track/secret-token?a=b',
        headers: { authorization: 'Bearer x', cookie: 'rwm_session=y' },
        cookies: { rwm_session: 'y' },
        data: { phone: '+2348030000000' },
        query_string: 'a=b',
      },
      user: { id: 'u1', ip_address: '1.2.3.4' },
      server_name: 'web-1',
      transaction: '/track/secret-token',
      breadcrumbs: [
        { category: 'console', message: 'phone +2348030000000' },
        { category: 'fetch', data: { url: '/api/proxy/v1/rides?x=1', method: 'GET' } },
        { category: 'navigation', data: { from: '/track/aaa', to: `/rides/${RIDE}` } },
        { category: 'ui.click', message: 'button.primary' },
      ],
    });
    expect(e).toEqual({
      exception: { values: [{ value: 'TypeError' }] },
      request: { url: 'https://rideswithme.ng/track/:token' },
      transaction: '/track/:token',
      breadcrumbs: [
        { category: 'fetch', data: { url: '/api/proxy/v1/rides', method: 'GET' } },
        { category: 'navigation', data: { from: '/track/:token', to: `/rides/${RIDE}` } },
        { category: 'ui.click', message: 'button.primary' },
      ],
    });
  });

  it('drops console breadcrumbs on their own too', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'x' })).toBeNull();
  });
});

describe('scrubText', () => {
  it('removes tokens, query strings, phone numbers and emails from messages', () => {
    expect(
      scrubText(
        'Failed to fetch https://x.ng/api/track/AbC123?x=1 for +2348031234567 / 08031234567 (ada@example.com)',
      ),
    ).toBe('Failed to fetch https://x.ng/api/track/:token for [phone] / [phone] ([email])');
    expect(scrubText('Cannot read properties of undefined (reading "fare")')).toBe(
      'Cannot read properties of undefined (reading "fare")',
    );
  });

  it('is applied to the error message and exception values', () => {
    const e = scrubErrorEvent({
      message: 'call 08031234567',
      exception: { values: [{ value: 'GET /v1/share/tok123 failed' }] },
    });
    expect(e).toEqual({
      message: 'call [phone]',
      exception: { values: [{ value: 'GET /v1/share/:token failed' }] },
    });
  });
});
