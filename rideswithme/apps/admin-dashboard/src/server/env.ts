import 'server-only';
import { z } from 'zod';

const schema = z.object({
  API_URL: z.string().url(),
  ADMIN_SESSION_SECRET: z
    .string()
    .refine((s) => Buffer.from(s, 'base64').length === 32, 'Must be base64 of 32 random bytes'),
  POLICY_VERSION: z.string().min(1),
  STORAGE_ORIGIN: z.string().url().optional(),
  API_PUBLIC_URL: z.string().url().optional(),
  MAP_TILE_URL: z.string().default('https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
  MAP_TILE_ATTRIBUTION: z.string().default('© OpenStreetMap contributors'),
  SESSION_COOKIE_SECURE: z.enum(['true', 'false']).optional(),
});

let cached: z.output<typeof schema> | null = null;

/** Server configuration, validated on first use. */
export function serverEnv() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Admin dashboard is misconfigured: ${problems}`);
  }
  cached = parsed.data;
  return cached;
}

export function cookieSecure(): boolean {
  const v = serverEnv().SESSION_COOKIE_SECURE;
  return v ? v === 'true' : process.env.NODE_ENV === 'production';
}
