import { randomInt } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type {
  AuthTokens,
  DriverOfferView,
  DriverRideView,
  LatLng,
} from '@rideswithme/shared-types';
import { SessionService } from '../auth/session.service';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';

/**
 * A pretend driver for trying the passenger website on one computer
 * (development only). It signs a test driver in without an SMS code, fills in
 * and approves their application with sample documents, goes online, and then
 * accepts every ride offered to it and drives it through: to the pickup,
 * arrived, started, along to the destination, completed. It talks to the
 * running API like the driver app does; nothing here runs inside the API.
 *
 *   pnpm test-driver                       (a car, near Katsina Central Market)
 *   pnpm test-driver --category keke_napep --phone 08099990002
 */

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 9)]);
const PDF = Buffer.from('%PDF-1.4\n%rideswithme test driver\n');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const say = (msg: string) => console.warn(`[test driver] ${msg}`);

export interface TestDriverOptions {
  phone: string;
  name: string;
  category: string;
  start: LatLng;
  /** Seconds for each leg (to the pickup, waiting there, to the destination). */
  pace: number;
}

/** Sets the driver up (app context needed), then closes it and drives through the API. */
export async function runTestDriver(app: INestApplicationContext, o: TestDriverOptions) {
  const config = app.get<AppConfig>(APP_CONFIG);
  if (config.NODE_ENV === 'production') throw new Error('test-driver is for development only');
  const apiUrl = `http://localhost:${config.PORT}`;
  const db = app.get<Kysely<Database>>(DB);

  const health = await fetch(`${apiUrl}/health/ready`).catch(() => null);
  if (!health?.ok)
    throw new Error(
      `The API is not answering at ${apiUrl}. Start it first (task "API (port 3000)").`,
    );

  // The driver's account and a session, without an SMS code.
  let user = await db
    .selectFrom('users')
    .select(['id', 'status'])
    .where('phone_e164', '=', o.phone)
    .executeTakeFirst();
  if (user && user.status !== 'active') throw new Error(`${o.phone} is ${user.status}`);
  if (!user) {
    user = await db
      .insertInto('users')
      .values({ phone_e164: o.phone, full_name: o.name, phone_verified_at: new Date() })
      .returning(['id', 'status'])
      .executeTakeFirstOrThrow();
    await db
      .insertInto('user_roles')
      .values((eb) => ({
        user_id: user!.id,
        role_id: eb.selectFrom('roles').select('id').where('key', '=', 'passenger'),
      }))
      .execute();
  }
  const userId = user.id;
  let tokens = await app.get(SessionService).create(
    db,
    userId,
    { name: 'Test driver (command line)', platform: 'unknown' },
    {
      ip: null,
      userAgent: 'rideswithme-cli test-driver',
      requestId: null,
    },
  );

  const call = async <T>(path: string, init: { method?: string; body?: unknown } = {}) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`${apiUrl}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens.accessToken}`,
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      if (res.status === 401 && attempt === 0) {
        const r = await fetch(`${apiUrl}/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
        if (!r.ok) throw new Error('Signed out; run the command again');
        tokens = (await r.json()) as AuthTokens;
        continue;
      }
      const text = await res.text();
      if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${text}`);
      return (text ? JSON.parse(text) : undefined) as T;
    }
    throw new Error('unreachable');
  };

  // The application, unless this driver is already approved.
  const profile = await db
    .selectFrom('driver_profiles')
    .select('status')
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (profile?.status !== 'approved') {
    say(`setting up ${o.name} (${o.phone}) with a ${o.category}...`);
    await call('/v1/driver/registration', { method: 'POST' });
    await call('/v1/driver/profile', {
      method: 'PATCH',
      body: { fullName: o.name, nin: String(randomInt(10_000_000_000, 99_999_999_999)) },
    });
    await call('/v1/driver/vehicle', {
      method: 'PUT',
      body: {
        categoryKey: o.category,
        plateNumber: `KTS${randomInt(100, 999)}TD`,
        make:
          o.category === 'keke_napep' ? 'Bajaj' : o.category === 'motorcycle' ? 'Honda' : 'Toyota',
        model: o.category === 'keke_napep' ? 'RE' : o.category === 'motorcycle' ? 'Ace' : 'Corolla',
        colour: 'Yellow',
        year: 2019,
      },
    });
    await call('/v1/driver/payout-account', {
      method: 'PUT',
      body: { bankCode: '058', accountNumber: '0123456789', accountName: o.name },
    });
    const view = await call<{
      requirements: {
        key: string;
        media: string;
        requiresExpiry: boolean;
        requiresNumber: boolean;
      }[];
    }>('/v1/driver/onboarding');
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
        body: {
          documentType: r.key,
          contentType: photo ? 'image/jpeg' : 'application/pdf',
          sizeBytes: body.length,
        },
      });
      const put = await fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.headers, body });
      if (!put.ok)
        throw new Error(`Uploading ${r.key} failed (${put.status}). Is Docker's s3 running?`);
      await call('/v1/driver/documents', {
        method: 'POST',
        body: {
          uploadId: ticket.uploadId,
          ...(r.requiresExpiry && { expiresOn: expiry }),
          ...(r.requiresNumber && { documentNumber: 'TEST-123456' }),
        },
      });
    }
    await call('/v1/driver/submit', { method: 'POST' });
    // Approved here, as staff would on the Driver verification page.
    await db
      .updateTable('driver_documents')
      .set({ status: 'approved', reviewed_at: new Date() })
      .where('driver_user_id', '=', userId)
      .where('status', '=', 'pending')
      .execute();
    await db
      .updateTable('driver_profiles')
      .set({ status: 'approved', approved_at: new Date(), reviewed_at: new Date() })
      .where('user_id', '=', userId)
      .execute();
    say('application filled in and approved');
  }
  await app.close();

  // --- Driving, through the API only ---
  let here = o.start;
  const point = (p: LatLng) => ({ lat: p.lat, lng: p.lng, recordedAt: new Date().toISOString() });
  const report = (p: LatLng) =>
    call('/v1/driver/location', { method: 'POST', body: { points: [point(p)] } });
  /** Moves in a straight line to `to` over `seconds`, reporting the position as it goes. */
  const drive = async (to: LatLng, seconds: number) => {
    const steps = Math.max(2, Math.round(seconds / 2));
    const from = here;
    for (let i = 1; i <= steps; i++) {
      here = {
        lat: from.lat + ((to.lat - from.lat) * i) / steps,
        lng: from.lng + ((to.lng - from.lng) * i) / steps,
      };
      await report(here);
      await sleep((seconds * 1000) / steps);
    }
  };

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await call('/v1/driver/availability', { method: 'POST', body: { online: false } }).catch(
      () => undefined,
    );
    say('offline. Bye.');
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());

  const goOnline = () =>
    call('/v1/driver/availability', {
      method: 'POST',
      body: { online: true, location: point(here) },
    });
  await goOnline();
  say(
    `online at ${here.lat.toFixed(4)}, ${here.lng.toFixed(4)} with a ${o.category}. ` +
      'Book a ride on the passenger website. Press Ctrl+C to stop.',
  );

  let lastReport = Date.now();
  let apiDown = false;
  for (;;) {
    // Keep going while the API restarts (it does on every code change in development).
    let offer: DriverOfferView | null;
    try {
      ({ offer } = await call<{ offer: DriverOfferView | null }>('/v1/driver/offers/current'));
      if (apiDown) {
        apiDown = false;
        await goOnline();
        say('the API is back; online again');
      }
    } catch (err) {
      if (!apiDown)
        say(`cannot reach the API (${(err as Error).message.slice(0, 80)}); retrying...`);
      apiDown = true;
      await sleep(3000);
      continue;
    }
    if (!offer) {
      if (Date.now() - lastReport > 15_000) {
        await report(here);
        lastReport = Date.now();
      }
      await sleep(1000);
      continue;
    }
    say(
      `offer: ${offer.pickup.name ?? offer.pickup.address} -> ${offer.dropoff.name ?? offer.dropoff.address}`,
    );
    let ride: DriverRideView;
    try {
      ride = await call<DriverRideView>(`/v1/driver/offers/${offer.offerId}/accept`, {
        method: 'POST',
      });
    } catch (err) {
      say(`could not accept (${(err as Error).message.slice(0, 120)}); waiting for the next one`);
      continue;
    }
    try {
      say('accepted; driving to the pickup');
      await drive(offer.pickup.location, o.pace);
      await call(`/v1/driver/rides/${ride.id}/arrived`, { method: 'POST' });
      say('arrived at the pickup');
      await sleep(o.pace * 1000);
      await call(`/v1/driver/rides/${ride.id}/start`, { method: 'POST' });
      say('trip started');
      await drive(offer.dropoff.location, o.pace * 2);
      // Cash: report the whole fare (with room for waiting charges), so the test
      // passenger is not left owing anything.
      const cash = offer.paymentMethod === 'cash' ? Math.ceil(offer.fareKobo * 1.25) : 0;
      await call(`/v1/driver/rides/${ride.id}/complete`, {
        method: 'POST',
        body: { cashCollectedKobo: cash },
      });
      say('trip completed. Waiting for the next ride.');
    } catch (err) {
      // The passenger may have cancelled, for example.
      say(`ride ended early: ${(err as Error).message.slice(0, 160)}`);
    }
    lastReport = Date.now();
  }
}
