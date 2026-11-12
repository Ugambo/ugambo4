import 'server-only';
import { z } from 'zod';

const schema = z.object({
  API_URL: z.string().url(),
  API_PUBLIC_URL: z.string().url(),
  PASSENGER_SESSION_SECRET: z
    .string()
    .refine((s) => Buffer.from(s, 'base64').length === 32, 'Must be base64 of 32 random bytes'),
  POLICY_VERSION: z.string().min(1),
  STORAGE_ORIGIN: z.string().url().optional(),
  SESSION_COOKIE_SECURE: z.enum(['true', 'false']).optional(),
});

let cached: z.output<typeof schema> | null = null;

export function serverEnv() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Passenger website is misconfigured: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  cached = parsed.data;
  return cached;
}

export function cookieSecure(): boolean {
  const v = serverEnv().SESSION_COOKIE_SECURE;
  return v ? v === 'true' : process.env.NODE_ENV === 'production';
}
