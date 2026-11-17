import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { isRoleKey } from '@rideswithme/shared-types';
import { normalizeNigerianPhone } from '@rideswithme/validation';
import type { Kysely } from 'kysely';
import { AdminService } from './admin/admin.service';
import { AppModule } from './app.module';
import { loadConfig } from './config/config';
import { MfaService } from './auth/mfa.service';
import { PricingService } from './pricing/pricing.service';
import { DB } from './database/database.module';
import { runTestDriver } from './dev/test-driver';
import type { Database } from './database/types';

const USAGE = `Usage:
  node dist/cli.js grant-role  --phone <number> --role <role>   Creates the user if needed (first super admin)
  node dist/cli.js revoke-role --phone <number> --role <role>
  node dist/cli.js reset-mfa   --phone <number>                 Clears TOTP and signs the user out everywhere
  node dist/cli.js seed-city   --key <key> --name <name> --bbox <minLng,minLat,maxLng,maxLat>
                                Creates a rectangular service area with placeholder fares (development)
  node dist/cli.js test-driver [--phone <number>] [--name <name>] [--category car|keke_napep|taxi|motorcycle]
                               [--at <lat,lng>] [--pace <seconds>]
                                A pretend driver that accepts and completes rides (development only)`;

/**
 * The API's settings with its background jobs off: the running API does that
 * work, and a one-off command should not join in (or be mid-job when it exits).
 */
function cliConfig() {
  return loadConfig({
    ...process.env,
    DISPATCH_INTERVAL_MS: '0',
    MAINTENANCE_INTERVAL_MINUTES: '0',
    DOCUMENT_EXPIRY_SWEEP_MINUTES: '0',
    PAYMENT_RECONCILE_INTERVAL_MINUTES: '0',
    BUS_HOLD_SWEEP_MINUTES: '0',
    DELETION_SWEEP_MINUTES: '0',
  });
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const command = process.argv[2];
  if (command === 'seed-city') return seedCity();
  if (command === 'test-driver') return testDriver();
  const phone = normalizeNigerianPhone(arg('phone') ?? '');
  if (!command || !phone) throw new Error(USAGE);

  const app = await NestFactory.createApplicationContext(AppModule.forRoot(cliConfig()), {
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
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(cliConfig()), {
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

async function testDriver() {
  const category = arg('category') ?? 'car';
  const phone = normalizeNigerianPhone(arg('phone') ?? '08099990001');
  if (!phone) throw new Error(`Not a Nigerian phone number.\n${USAGE}`);
  // Near Katsina Central Market unless --at is given.
  const [lat, lng] = (arg('at') ?? '12.9750,7.6050').split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng))
    throw new Error(`--at is "latitude,longitude"`);
  const pace = Number(arg('pace') ?? '10');
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(cliConfig()), {
    logger: ['error', 'warn'],
  });
  // runTestDriver closes the app context once the driver is set up, then keeps driving.
  await runTestDriver(app, {
    phone,
    name: arg('name') ?? `Test Driver (${category.replace('_', ' ')})`,
    category,
    start: { lat: lat!, lng: lng! },
    pace: Number.isFinite(pace) && pace > 0 ? pace : 10,
  });
}
