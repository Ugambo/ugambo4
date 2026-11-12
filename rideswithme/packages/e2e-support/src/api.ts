import { readFileSync } from 'node:fs';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 9)]);
const PDF = Buffer.from('%PDF-1.4\n%e2e\n');

/**
 * Talks to a running test API: reads SMS codes from its log (console SMS
 * provider), signs in, and drives flows through the public endpoints.
 */
export function testApi(o: { apiUrl: string; apiLog: string; policyVersion: string }) {
  function logLineCount(): number {
    return readFileSync(o.apiLog, 'utf8').split('\n').length - 1;
  }

  /** Latest OTP "sent" to this phone after log line `after`. */
  async function latestOtp(phone: string, after = 0): Promise<string> {
    for (let i = 0; i < 50; i++) {
      const lines = readFileSync(o.apiLog, 'utf8').split('\n').slice(after);
      const matches = lines.flatMap((l) => {
        const m = l.match(/\[DEV SMS\] to (\+\d+): Your RideswithMe code is (\d{6})/);
        return m && m[1] === phone ? [m[2]!] : [];
      });
      if (matches.length) return matches[matches.length - 1]!;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`No OTP found for ${phone}`);
  }

  async function call<T>(
    path: string,
    init: {
      method?: string;
      body?: unknown;
      token?: string;
      headers?: Record<string, string>;
    } = {},
  ): Promise<T> {
    const res = await fetch(`${o.apiUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(init.token && { Authorization: `Bearer ${init.token}` }),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${text}`);
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /** Signs in with an SMS code and returns the user's id and access token. */
  async function signIn(phone: string): Promise<{ token: string; userId: string }> {
    const before = logLineCount();
    await call('/v1/auth/otp/request', { method: 'POST', body: { phone } });
    const code = await latestOtp(phone, before);
    const res = await call<{ tokens: { accessToken: string }; user: { id: string } }>(
      '/v1/auth/otp/verify',
      {
        method: 'POST',
        body: { phone, code, acceptedPolicyVersion: o.policyVersion },
      },
    );
    return { token: res.tokens.accessToken, userId: res.user.id };
  }

  /** Drives a full driver application through the public API, ending in "submitted". */
  async function submitDriverApplication(opts: {
    phone: string;
    fullName: string;
    nin: string;
    plate: string;
    category?: string;
  }): Promise<{ token: string; userId: string }> {
    const { token, userId } = await signIn(opts.phone);
    await call('/v1/driver/registration', { method: 'POST', token });
    await call('/v1/driver/profile', {
      method: 'PATCH',
      token,
      body: { fullName: opts.fullName, nin: opts.nin },
    });
    await call('/v1/driver/vehicle', {
      method: 'PUT',
      token,
      body: {
        categoryKey: opts.category ?? 'car',
        plateNumber: opts.plate,
        make: 'Toyota',
        model: 'Corolla',
        colour: 'Silver',
        year: 2016,
      },
    });
    await call('/v1/driver/payout-account', {
      method: 'PUT',
      token,
      body: { bankCode: '058', accountNumber: '0123456789', accountName: opts.fullName },
    });
    const view = await call<{
      requirements: {
        key: string;
        media: string;
        requiresExpiry: boolean;
        requiresNumber: boolean;
      }[];
    }>('/v1/driver/onboarding', { token });
    const expiry = new Date(Date.now() + 300 * 86_400_000).toISOString().slice(0, 10);
    for (const r of view.requirements) {
      const photo = r.media === 'photo';
      const body = photo ? JPEG : PDF;
      const ticket = await call<{
        uploadId: string;
        uploadUrl: string;
        headers: Record<string, string>;
      }>('/v1/driver/documents/uploads', {
        method: 'POST',
        token,
        body: {
          documentType: r.key,
          contentType: photo ? 'image/jpeg' : 'application/pdf',
          sizeBytes: body.length,
        },
      });
      const put = await fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.headers, body });
      if (!put.ok) throw new Error(`upload ${r.key} failed: ${put.status}`);
      await call('/v1/driver/documents', {
        method: 'POST',
        token,
        body: {
          uploadId: ticket.uploadId,
          ...(r.requiresExpiry && { expiresOn: expiry }),
          ...(r.requiresNumber && { documentNumber: 'KAT-998877' }),
        },
      });
    }
    await call('/v1/driver/submit', { method: 'POST', token });
    return { token, userId };
  }

  return { logLineCount, latestOtp, call, signIn, submitDriverApplication };
}

export type TestApi = ReturnType<typeof testApi>;
