import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const encryptionKeys = z.string().transform((value, ctx) => {
  const keys = new Map<string, Buffer>();
  for (const pair of value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const [id, b64] = pair.split(':');
    const key = b64 ? Buffer.from(b64, 'base64') : Buffer.alloc(0);
    if (!id || !/^[a-zA-Z0-9_-]{1,16}$/.test(id) || key.length !== 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Each key must be "<id>:<base64 of 32 random bytes>"',
      });
      return z.NEVER;
    }
    keys.set(id, key);
  }
  if (keys.size === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one key is required' });
    return z.NEVER;
  }
  return keys;
});

export const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((s) =>
        s
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      ),

    DATABASE_URL: z.string().url(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    REDIS_URL: z.string().url(),

    JWT_ACCESS_SECRET: z.string().min(32, 'Use at least 32 random characters'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_IDLE_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    REFRESH_ABSOLUTE_TTL_DAYS: z.coerce.number().int().min(1).max(730).default(90),
    REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().int().min(0).max(300).default(60),

    OTP_PEPPER: z.string().min(32, 'Use at least 32 random characters'),
    OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(10).max(600).default(60),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
    OTP_MAX_PER_PHONE_PER_HOUR: z.coerce.number().int().min(1).max(50).default(5),
    OTP_MAX_PER_IP_PER_HOUR: z.coerce.number().int().min(1).max(1000).default(20),
    OTP_VERIFY_MAX_PER_IP_PER_10_MIN: z.coerce.number().int().min(1).max(1000).default(60),

    SMS_PROVIDER: z.enum(['console', 'termii']).default('console'),
    TERMII_API_KEY: z.string().optional(),
    TERMII_SENDER_ID: z.string().max(11).optional(),
    TERMII_BASE_URL: z.string().url().default('https://api.ng.termii.com'),
    TERMII_CHANNEL: z.enum(['generic', 'dnd']).default('dnd'),

    FIELD_ENCRYPTION_KEYS: encryptionKeys,
    FIELD_ENCRYPTION_ACTIVE_KEY_ID: z.string().min(1),

    MFA_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(12),
    MFA_VERIFY_MAX_PER_15_MIN: z.coerce.number().int().min(1).max(50).default(5),

    CURRENT_POLICY_VERSION: z.string().min(1).max(32),

    // Keyed hash for exact-match lookups on encrypted values (e.g. duplicate NIN check).
    LOOKUP_HASH_SECRET: z.string().min(32, 'Use at least 32 random characters'),

    S3_ENDPOINT: z.string().url().optional(),
    // Endpoint written into signed URLs handed to phones and browsers, when it differs
    // from the one the API uses (e.g. http://minio:9000 inside Docker).
    S3_PUBLIC_ENDPOINT: z.string().url().optional(),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_BUCKET: z.string().min(3).max(63),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: bool.default('false'),
    S3_SERVER_SIDE_ENCRYPTION: z.enum(['none', 'AES256']).default('AES256'),
    S3_CREATE_BUCKET: bool.default('false'),
    UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
    DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(10).max(600).default(60),

    MAPS_PROVIDER: z.enum(['fake', 'google']).default('fake'),
    GOOGLE_MAPS_API_KEY: z.string().optional(),

    // Matching and ride timings.
    DISPATCH_INTERVAL_MS: z.coerce.number().int().min(0).max(60_000).default(1000),
    OFFER_TIMEOUT_SECONDS: z.coerce.number().int().min(5).max(120).default(15),
    SEARCH_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(1800).default(180),
    QUOTE_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
    SCHEDULED_DISPATCH_LEAD_MINUTES: z.coerce.number().int().min(1).max(120).default(10),
    DRIVER_POSITION_STALE_SECONDS: z.coerce.number().int().min(10).max(600).default(60),
    NO_SHOW_WAIT_MINUTES: z.coerce.number().int().min(1).max(60).default(5),

    // Live updates and location history.
    REALTIME_SESSION_CHECK_SECONDS: z.coerce.number().int().min(5).max(3600).default(60),
    REALTIME_TICKET_TTL_SECONDS: z.coerce.number().int().min(10).max(300).default(60),
    LOCATION_MAX_AGE_HOURS: z.coerce.number().int().min(1).max(72).default(48),
    TRIP_LOCATION_RETENTION_DAYS: z.coerce.number().int().min(7).max(3650).default(90),
    MAINTENANCE_INTERVAL_MINUTES: z.coerce.number().int().min(0).max(1440).default(360),

    DOCUMENT_EXPIRY_SWEEP_MINUTES: z.coerce.number().int().min(0).max(1440).default(60),
  })
  .superRefine((c, ctx) => {
    if (!c.FIELD_ENCRYPTION_KEYS.has(c.FIELD_ENCRYPTION_ACTIVE_KEY_ID)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FIELD_ENCRYPTION_ACTIVE_KEY_ID'],
        message: 'Must name one of the keys in FIELD_ENCRYPTION_KEYS',
      });
    }
    if (c.REFRESH_IDLE_TTL_DAYS > c.REFRESH_ABSOLUTE_TTL_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REFRESH_IDLE_TTL_DAYS'],
        message: 'Must not exceed REFRESH_ABSOLUTE_TTL_DAYS',
      });
    }
    if (c.SMS_PROVIDER === 'termii' && (!c.TERMII_API_KEY || !c.TERMII_SENDER_ID)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TERMII_API_KEY'],
        message: 'TERMII_API_KEY and TERMII_SENDER_ID are required when SMS_PROVIDER=termii',
      });
    }
    if (c.NODE_ENV === 'production' && c.S3_SERVER_SIDE_ENCRYPTION === 'none') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['S3_SERVER_SIDE_ENCRYPTION'],
        message: 'Driver documents must be encrypted at rest in production',
      });
    }
    if (c.MAPS_PROVIDER === 'google' && !c.GOOGLE_MAPS_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE_MAPS_API_KEY'],
        message: 'Required when MAPS_PROVIDER=google',
      });
    }
    if (c.NODE_ENV === 'production' && c.MAPS_PROVIDER === 'fake') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MAPS_PROVIDER'],
        message: 'The fake maps provider is not allowed in production',
      });
    }
    if (c.NODE_ENV === 'production' && c.SMS_PROVIDER === 'console') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMS_PROVIDER'],
        message: 'The console SMS provider prints codes to logs and is not allowed in production',
      });
    }
  });

export type AppConfig = z.output<typeof configSchema>;
export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid configuration. Check your environment variables:\n${problems}`);
  }
  return result.data;
}
