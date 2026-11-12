import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { API_LOG, API_URL, POLICY_VERSION } from './env';

/** Latest OTP the API "sent" to this phone (console SMS provider writes it to the log). */
export async function latestOtp(phone: string, after = 0): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const lines = readFileSync(API_LOG, 'utf8').split('\n').slice(after);
    const matches = lines.flatMap((l) => {
      const m = l.match(/\[DEV SMS\] to (\+\d+): Your RideswithMe code is (\d{6})/);
      return m && m[1] === phone ? [m[2]!] : [];
    });
    if (matches.length) return matches[matches.length - 1]!;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`No OTP found for ${phone}`);
}

export function logLineCount(): number {
  return readFileSync(API_LOG, 'utf8').split('\n').length - 1;
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(s: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s.replace(/=+$/, '')) {
    value = (value << 5) | BASE32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 6238 code for a time step offset from now (what an authenticator app shows). */
export function totp(secret: string, stepOffset = 0): string {
  const counter = Math.floor(Date.now() / 30_000) + stepOffset;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  return ((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(init.token && { Authorization: `Bearer ${init.token}` }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function signInByApi(phone: string): Promise<string> {
  const before = logLineCount();
  await api('/v1/auth/otp/request', { method: 'POST', body: { phone } });
  const code = await latestOtp(phone, before);
  const res = await api<{ tokens: { accessToken: string } }>('/v1/auth/otp/verify', {
    method: 'POST',
    body: { phone, code, acceptedPolicyVersion: POLICY_VERSION },
  });
  return res.tokens.accessToken;
}

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 9)]);
const PDF = Buffer.from('%PDF-1.4\n%e2e\n');

/** Drives a full driver application through the public API, ending in "submitted". */
export async function submitDriverApplication(opts: {
  phone: string;
  fullName: string;
  nin: string;
  plate: string;
  category?: string;
}): Promise<string> {
  const token = await signInByApi(opts.phone);
  await api('/v1/driver/registration', { method: 'POST', token });
  await api('/v1/driver/profile', {
    method: 'PATCH',
    token,
    body: { fullName: opts.fullName, nin: opts.nin },
  });
  await api('/v1/driver/vehicle', {
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
  await api('/v1/driver/payout-account', {
    method: 'PUT',
    token,
    body: { bankCode: '058', accountNumber: '0123456789', accountName: opts.fullName },
  });
  const view = await api<{
    userId: string;
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
    const ticket = await api<{
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
    await api('/v1/driver/documents', {
      method: 'POST',
      token,
      body: {
        uploadId: ticket.uploadId,
        ...(r.requiresExpiry && { expiresOn: expiry }),
        ...(r.requiresNumber && { documentNumber: 'KAT-998877' }),
      },
    });
  }
  await api('/v1/driver/submit', { method: 'POST', token });
  return view.userId;
}
