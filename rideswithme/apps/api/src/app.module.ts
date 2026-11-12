import { randomUUID } from 'node:crypto';
import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { CommonModule } from './common/common.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { type AppConfig, loadConfig } from './config/config';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { DriversModule } from './drivers/drivers.module';
import { HealthModule } from './health/health.module';
import { RedisModule } from './redis/redis.module';
import { SmsModule } from './sms/sms.module';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';

const REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

@Module({})
export class AppModule {
  static forRoot(config: AppConfig = loadConfig()): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        LoggerModule.forRoot({
          pinoHttp: {
            level: config.LOG_LEVEL,
            transport: config.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
            genReqId: (req, res) => {
              const incoming = req.headers['x-request-id'];
              const id =
                typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
              res.setHeader('X-Request-Id', id);
              return id;
            },
            // Never log credentials, codes or tokens.
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
                '*.code',
                '*.refreshToken',
                '*.accessToken',
              ],
              censor: '[redacted]',
            },
            customProps: () => ({ service: 'api' }),
          },
        }),
        DatabaseModule,
        RedisModule,
        CommonModule,
        CryptoModule,
        AuditModule,
        SmsModule,
        StorageModule,
        UsersModule,
        AuthModule,
        AdminModule,
        DriversModule,
        HealthModule,
      ],
      providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
    };
  }
}
