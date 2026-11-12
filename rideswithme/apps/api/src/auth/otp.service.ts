import { createHmac, randomInt } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { ErrorCode, type Language } from '@rideswithme/shared-types';
import { translate } from '@rideswithme/utilities';
import { maskPhone } from '@rideswithme/validation';
import { AppException } from '../common/app-exception';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { REDIS } from '../redis/redis.module';
import { SMS_PROVIDER, type SmsProvider } from '../sms/sms.provider';

enum VerifyOutcome {
  Missing = 0,
  Ok = 1,
  Wrong = 2,
  TooManyAttempts = 3,
}

/**
 * Check-and-consume in one atomic step, so parallel requests cannot both use a
 * code and every guess is counted. Compares HMAC digests, not codes, so the
 * non-constant-time string comparison leaks nothing useful about the code.
 */
const VERIFY_SCRIPT = `
local stored = redis.call('HGET', KEYS[1], 'hash')
if not stored then return {0} end
local attempts = redis.call('HINCRBY', KEYS[1], 'attempts', 1)
if attempts > tonumber(ARGV[2]) then
  redis.call('DEL', KEYS[1])
  return {3, attempts}
end
if stored == ARGV[1] then
  redis.call('DEL', KEYS[1])
  return {1, attempts}
end
return {2, attempts}
`;

/**
 * Phone one-time codes. Codes live only in Redis, hashed with a server-side
 * pepper, expire after OTP_TTL_SECONDS and are single use. Abuse limits:
 * resend cooldown, sends per phone and per IP, wrong attempts per code.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async request(phone: string, ip: string | null, language: Language) {
    const cooldownKey = `otp:cooldown:${phone}`;
    const cooldownSet = await this.redis.set(
      cooldownKey,
      '1',
      'EX',
      this.config.OTP_RESEND_COOLDOWN_SECONDS,
      'NX',
    );
    if (cooldownSet !== 'OK') {
      const ttl = await this.redis.ttl(cooldownKey);
      throw new AppException(ErrorCode.OTP_RESEND_TOO_SOON, 'Wait before requesting another code', {
        retryAfterSeconds: Math.max(ttl, 1),
      });
    }

    try {
      await this.rateLimiter.consume(
        { name: 'otp_phone', limit: this.config.OTP_MAX_PER_PHONE_PER_HOUR, windowSeconds: 3600 },
        phone,
      );
      if (ip) {
        await this.rateLimiter.consume(
          { name: 'otp_ip', limit: this.config.OTP_MAX_PER_IP_PER_HOUR, windowSeconds: 3600 },
          ip,
        );
      }
    } catch (err) {
      await this.redis.del(cooldownKey);
      throw err;
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const key = this.codeKey(phone);
    await this.redis
      .multi()
      .hset(key, { hash: this.hash(phone, code), attempts: '0' })
      .expire(key, this.config.OTP_TTL_SECONDS)
      .exec();

    try {
      await this.sms.send({
        to: phone,
        text: translate(language, 'sms.otp', {
          code,
          minutes: Math.round(this.config.OTP_TTL_SECONDS / 60),
        }),
      });
    } catch (err) {
      this.logger.error(
        { err, phone: maskPhone(phone), provider: this.sms.name },
        'OTP SMS failed',
      );
      // Let the person retry straight away; the send still counted toward the hourly limits.
      await this.redis.del(key, cooldownKey);
      throw new AppException(ErrorCode.SMS_DELIVERY_FAILED, 'Could not send the code');
    }

    return {
      expiresInSeconds: this.config.OTP_TTL_SECONDS,
      resendAfterSeconds: this.config.OTP_RESEND_COOLDOWN_SECONDS,
    };
  }

  /** Throws unless the code is right. On success the code is consumed (single use). */
  async verify(phone: string, code: string, ip: string | null): Promise<void> {
    if (ip) {
      await this.rateLimiter.consume(
        {
          name: 'otp_verify_ip',
          limit: this.config.OTP_VERIFY_MAX_PER_IP_PER_10_MIN,
          windowSeconds: 600,
        },
        ip,
      );
    }
    const result = (await this.redis.eval(
      VERIFY_SCRIPT,
      1,
      this.codeKey(phone),
      this.hash(phone, code),
      String(this.config.OTP_MAX_ATTEMPTS),
    )) as [number, number?];
    const [outcome, attempts = 0] = result;

    switch (outcome) {
      case VerifyOutcome.Missing:
        throw new AppException(
          ErrorCode.OTP_EXPIRED,
          'Code expired, already used or not requested',
        );
      case VerifyOutcome.TooManyAttempts:
        throw new AppException(ErrorCode.OTP_TOO_MANY_ATTEMPTS, 'Too many wrong codes');
      case VerifyOutcome.Wrong:
        throw new AppException(ErrorCode.OTP_INVALID, 'Wrong code', {
          details: { attemptsRemaining: Math.max(this.config.OTP_MAX_ATTEMPTS - attempts, 0) },
        });
      case VerifyOutcome.Ok:
        break;
      default:
        throw new Error(`Unexpected OTP verify outcome ${String(outcome)}`);
    }
    await this.redis.del(`otp:cooldown:${phone}`);
  }

  private codeKey(phone: string) {
    return `otp:code:${phone}`;
  }

  private hash(phone: string, code: string) {
    return createHmac('sha256', this.config.OTP_PEPPER).update(`${phone}:${code}`).digest('hex');
  }
}
