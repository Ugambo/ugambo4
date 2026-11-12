import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { isRoleKey } from '@rideswithme/shared-types';
import { normalizeNigerianPhone } from '@rideswithme/validation';
import type { Kysely } from 'kysely';
import { AdminService } from './admin/admin.service';
import { AppModule } from './app.module';
import { MfaService } from './auth/mfa.service';
import { PricingService } from './pricing/pricing.service';
import { DB } from './database/database.module';
import type { Database } from './database/types';

const USAGE = `Usage:
  node dist/cli.js grant-role  --phone <number> --role <role>   Creates the user if needed (first super admin)
  node dist/cli.js revoke-role --phone <number> --role <role>
  node dist/cli.js reset-mfa   --phone <number>                 Clears TOTP and signs the user out everywhere
  node dist/cli.js seed-city   --key <key> --name <name> --bbox <minLng,minLat,maxLng,maxLat>
                                Creates a rectangular service area with placeholder fares (development)`;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const command = process.argv[2];
  if (command === 'seed-city') return seedCity();
  const phone = normalizeNigerianPhone(arg('phone') ?? '');
  if (!command || !phone) throw new Error(USAGE);

  const app = await NestFactory.createApplicationContext(AppModule.forRoot(), {
    logger: ['error', 'warn'],
  });
  try {
    const db = app.get<Kysely<Database>>(DB);
    const ctx = { userAgent: 'rideswithme-cli' };
    let user = await db
      .selectFrom('users')
      .select('id')
      .where('phone_e164', '=', phone)
      .executeTakeFirst();

    if (command === 'grant-role' || command === 'revoke-role') {
      const role = arg('role') ?? '';
      if (!isRoleKey(role)) throw new Error(`Unknown role "${role}".\n${USAGE}`);
      const admin = app.get(AdminService);
      if (command === 'grant-role') {
        user ??= await db
          .insertInto('users')
          .values({ phone_e164: phone })
          .returning('id')
          .executeTakeFirstOrThrow();
        await admin.assignRole(user.id, role, { type: 'system' }, ctx);
        console.warn(
          `Granted ${role} to ${phone}. They sign in with an SMS code, then set up TOTP.`,
        );
      } else {
        if (!user) throw new Error(`No user with phone ${phone}`);
        await admin.removeRole(user.id, role, { type: 'system' }, ctx);
        console.warn(`Removed ${role} from ${phone}.`);
      }
    } else if (command === 'reset-mfa') {
      if (!user) throw new Error(`No user with phone ${phone}`);
      await app.get(MfaService).reset(user.id, { type: 'system' }, ctx);
      console.warn(`Two-factor authentication reset for ${phone}; all sessions signed out.`);
    } else {
      throw new Error(USAGE);
    }
  } finally {
    await app.close();
  }
}

async function seedCity() {
  const key = arg('key');
  const name = arg('name');
  const bbox = (arg('bbox') ?? '').split(',').map(Number);
  if (!key || !name || bbox.length !== 4 || bbox.some((n) => Number.isNaN(n)))
    throw new Error(USAGE);
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(), {
    logger: ['error', 'warn'],
  });
  try {
    await app.get(PricingService).seedCity(key, name, bbox as [number, number, number, number]);
    console.warn(
      `Service area "${name}" (${key}) created with PLACEHOLDER fares. Set real fares before launch.`,
    );
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
