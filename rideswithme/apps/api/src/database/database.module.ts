import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool, types } from 'pg';
import { APP_CONFIG, type AppConfig } from '../config/config';
import type { Database } from './types';

export const DB = Symbol('DB');
export type DB = Kysely<Database>;

// bigint (int8) as string so values above 2^53 are never silently rounded.
types.setTypeParser(types.builtins.INT8, (v) => v);

@Injectable()
class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: DB) {}
  async onApplicationShutdown() {
    await this.db.destroy();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DB,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): DB =>
        new Kysely<Database>({
          dialect: new PostgresDialect({
            pool: new Pool({
              connectionString: config.DATABASE_URL,
              max: config.DATABASE_POOL_MAX,
              application_name: 'rideswithme-api',
            }),
          }),
        }),
    },
    DatabaseLifecycle,
  ],
  exports: [DB],
})
export class DatabaseModule {}

/** Postgres SQLSTATE for unique_violation. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = err as { code?: string; constraint?: string };
  return e?.code === '23505' && (!constraint || e.constraint === constraint);
}
