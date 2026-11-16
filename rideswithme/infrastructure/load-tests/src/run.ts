/**
 * Load test: starts the built API on its own database, signs in simulated
 * passengers and drivers through the public endpoints, and runs:
 *
 *   1. fare estimates from every passenger while every driver sends locations;
 *   2. rounds of cash bookings, each matched to a driver and driven to completion;
 *   3. bus seat races: many passengers grab the same seat at once, and exactly
 *      one may win each race.
 *
 * It prints latency percentiles per operation, then checks the API's own
 * metrics (no ledger mismatches, nothing left searching) and exits non-zero
 * when a check or latency budget fails. See infrastructure/load-tests/README.md.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  ROOT,
  flushRedis,
  resetDatabase,
  startApi,
  testApi,
  testBuses,
  testRides,
  waitForHttp,
  withDatabase,
} from '@rideswithme/e2e-support';
import { Recorder, formatTable, pool } from './stats';

const { values: opt } = parseArgs({
  options: {
    passengers: { type: 'string', default: '30' },
    drivers: { type: 'string', default: '15' },
    rounds: { type: 'string', default: '2' },
    'estimate-seconds': { type: 'string', default: '20' },
    racers: { type: 'string', default: '12' },
    departures: { type: 'string', default: '2' },
    'p95-ms': { type: 'string', default: '1000' },
    'match-p95-ms': { type: 'string', default: '8000' },
    port: { type: 'string', default: '3400' },
  },
});
const n = (k: keyof typeof opt) => Number(opt[k]);

const OUT = path.join(__dirname, '..', '.output');
const API_LOG = path.join(OUT, 'api.log');
const API_URL = `http://127.0.0.1:${n('port')}`;
const POLICY_VERSION = '2026-11';
const DATABASE_URL =
  process.env.LOAD_DATABASE_URL ?? 'postgres://rwm:rwm@localhost:5432/rideswithme_load';
const REDIS_URL = process.env.LOAD_REDIS_URL ?? 'redis://localhost:6379/12';
const S3 = process.env.TEST_S3_ENDPOINT ?? 'http://127.0.0.1:9000';
const METRICS_TOKEN = randomBytes(24).toString('hex');
const STAFF_PHONE = '+2348036000001';
const MANAGER_PHONE = '+2348036000002';
const phone = (kind: 1 | 2, i: number) => `+234803${kind}${String(i).padStart(6, '0')}`;

/** Kurmi Market, Kano: pickups and drivers are scattered within about 1.5 km of it. */
const KURMI = { lat: 11.9906, lng: 8.5141 };
const AIRPORT = {
  location: { lat: 12.0476, lng: 8.5246 },
  address: 'Mallam Aminu Kano International Airport',
};
const near = (p: { lat: number; lng: number }, km = 1.5) => ({
  lat: +(p.lat + ((Math.random() * 2 - 1) * km) / 111).toFixed(6),
  lng: +(p.lng + ((Math.random() * 2 - 1) * km) / 109).toFixed(6),
});
const point = (p: { lat: number; lng: number }) => ({ ...p, recordedAt: new Date().toISOString() });
const log = (msg: string) => process.stdout.write(`${msg}\n`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function apiEnv(): Record<string, string> {
  return {
    NODE_ENV: 'test',
    PORT: String(n('port')),
    LOG_LEVEL: 'warn',
    DATABASE_URL,
    DATABASE_POOL_MAX: '20',
    REDIS_URL,
    JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
    OTP_PEPPER: randomBytes(32).toString('hex'),
    LOOKUP_HASH_SECRET: randomBytes(32).toString('hex'),
    FIELD_ENCRYPTION_KEYS: `load:${randomBytes(32).toString('base64')}`,
    FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'load',
    CURRENT_POLICY_VERSION: POLICY_VERSION,
    SMS_PROVIDER: 'console',
    OTP_MAX_PER_IP_PER_HOUR: '1000',
    OTP_VERIFY_MAX_PER_IP_PER_10_MIN: '1000',
    S3_ENDPOINT: S3,
    S3_BUCKET: 'rideswithme-load',
    S3_ACCESS_KEY_ID: process.env.TEST_S3_ACCESS_KEY_ID ?? 'test',
    S3_SECRET_ACCESS_KEY: process.env.TEST_S3_SECRET_ACCESS_KEY ?? 'testtesttest',
    S3_FORCE_PATH_STYLE: 'true',
    S3_CREATE_BUCKET: 'true',
    DOCUMENT_EXPIRY_SWEEP_MINUTES: '0',
    DELETION_SWEEP_MINUTES: '0',
    MAPS_PROVIDER: 'fake',
    PAYMENT_PROVIDER: 'fake',
    PUBLIC_API_URL: API_URL,
    METRICS_TOKEN,
  };
}

function cli(args: string[], env: Record<string, string>) {
  const r = spawnSync('node', ['apps/api/dist/cli.js', ...args], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`cli ${args[0]} failed: ${r.stderr}`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const failures: string[] = [];
  const rec = new Recorder();
  const env = apiEnv();

  log(`Preparing ${DATABASE_URL.replace(/\/\/[^@]*@/, '//')} …`);
  await resetDatabase(DATABASE_URL);
  await flushRedis(REDIS_URL);
  cli(['seed-city', '--key', 'kano', '--name', 'Kano', '--bbox', '8.40,11.90,8.62,12.10'], env);
  cli(['grant-role', '--phone', STAFF_PHONE, '--role', 'admin'], env);

  const proc = startApi(env, API_LOG);
  try {
    await waitForHttp(`${API_URL}/health/live`, 'API', proc, OUT);
    const api = testApi({ apiUrl: API_URL, apiLog: API_LOG, policyVersion: POLICY_VERSION });
    const rides = testRides(api, DATABASE_URL);

    // --- Accounts ---------------------------------------------------------------
    log(`Signing in ${n('passengers')} passengers and ${n('drivers')} drivers …`);
    const passengers = await pool(
      Array.from({ length: n('passengers') }, (_, i) => phone(1, i)),
      10,
      (p) => rec.time('sign in (OTP)', () => api.signIn(p)),
    );
    const drivers = await pool(
      Array.from({ length: n('drivers') }, (_, i) => i),
      5,
      (i) =>
        rides.approvedDriver({
          phone: phone(2, i),
          fullName: `Load Driver ${i}`,
          nin: String(10_000_000_000 + i),
          plate: `KAN${String(i).padStart(3, '0')}LD`,
        }),
    );
    await pool(drivers, 10, (d) =>
      rec.time('driver online', () =>
        api.call('/v1/driver/availability', {
          method: 'POST',
          token: d.token,
          body: { online: true, location: point(near(KURMI)) },
        }),
      ),
    );

    // --- 1. Estimates while drivers stream locations ------------------------------
    log(`Estimates and driver locations for ${opt['estimate-seconds']} s …`);
    const until = Date.now() + n('estimate-seconds') * 1000;
    const estimator = async (p: { token: string }) => {
      while (Date.now() < until) {
        await rec
          .time('fare estimate', () =>
            api.call('/v1/fares/estimate', {
              method: 'POST',
              token: p.token,
              body: {
                pickup: { location: near(KURMI), address: 'Near Kurmi Market' },
                dropoff: AIRPORT,
              },
            }),
          )
          .catch(() => undefined);
        await sleep(2000 + Math.random() * 1000);
      }
    };
    // Like the app, idle drivers keep sending locations (positions go stale after a minute).
    let stopped = false;
    const busy = new Set<string>();
    const streamer = async (d: { token: string }) => {
      while (!stopped) {
        if (busy.has(d.token)) {
          await sleep(500);
          continue;
        }
        await rec
          .time('driver location', () =>
            api.call('/v1/driver/location', {
              method: 'POST',
              token: d.token,
              body: { points: [point(near(KURMI))] },
            }),
          )
          .catch(() => undefined);
        await sleep(1500 + Math.random() * 1000);
      }
    };
    const streams = drivers.map(streamer);
    await Promise.all(passengers.map(estimator));

    // --- 2. Booking, matching and trips ---------------------------------------------
    const bookedAt = new Map<string, number>();
    const done = new Set<string>();
    const acceptedAt = new Map<string, number>();
    let booking = true;
    const driverLoop = async (d: { token: string }) => {
      while (!stopped && (booking || done.size < bookedAt.size)) {
        let offer: { offerId: string; rideId: string } | null = null;
        try {
          ({ offer } = await rec.time('driver poll offer', () =>
            api.call<{ offer: { offerId: string; rideId: string } | null }>(
              '/v1/driver/offers/current',
              { token: d.token },
            ),
          ));
        } catch {
          /* recorded */
        }
        if (!offer) {
          await sleep(400);
          continue;
        }
        busy.add(d.token);
        try {
          await rec.time('accept offer', () =>
            api.call(`/v1/driver/offers/${offer.offerId}/accept`, {
              method: 'POST',
              token: d.token,
            }),
          );
          acceptedAt.set(offer.rideId, performance.now());
          const ride = await api.call<{
            pickup: { location: { lat: number; lng: number } };
            fare: { payableKobo: number };
          }>(`/v1/driver/rides/${offer.rideId}`, { token: d.token });
          await rec.time('trip steps (location, arrive, start, complete)', async () => {
            await api.call('/v1/driver/location', {
              method: 'POST',
              token: d.token,
              body: { points: [point(ride.pickup.location)] },
            });
            for (const step of ['arrived', 'start'])
              await api.call(`/v1/driver/rides/${offer.rideId}/${step}`, {
                method: 'POST',
                token: d.token,
              });
            const live = await api.call<{ fare: { payableKobo: number } }>(
              `/v1/driver/rides/${offer.rideId}`,
              { token: d.token },
            );
            await api.call(`/v1/driver/rides/${offer.rideId}/complete`, {
              method: 'POST',
              token: d.token,
              body: { cashCollectedKobo: live.fare.payableKobo },
            });
          });
          done.add(offer.rideId);
        } catch {
          /* recorded; the offer may have gone to someone else */
        } finally {
          busy.delete(d.token);
        }
      }
    };
    const loops = drivers.map(driverLoop);
    const riders = passengers.slice(0, drivers.length);
    for (let round = 1; round <= n('rounds'); round++) {
      log(`Booking round ${round}/${opt.rounds}: ${riders.length} rides at once …`);
      const ids = await pool(riders, riders.length, async (p) => {
        try {
          const est = await api.call<{ options: { quoteId: string; category: { key: string } }[] }>(
            '/v1/fares/estimate',
            {
              method: 'POST',
              token: p.token,
              body: {
                pickup: { location: near(KURMI), address: 'Near Kurmi Market' },
                dropoff: AIRPORT,
              },
            },
          );
          const start = performance.now();
          const ride = await rec.time('book ride', () =>
            api.call<{ id: string }>('/v1/rides', {
              method: 'POST',
              token: p.token,
              headers: { 'Idempotency-Key': randomUUID() },
              body: {
                quoteId: est.options.find((o) => o.category.key === 'car')!.quoteId,
                paymentMethod: 'cash',
              },
            }),
          );
          bookedAt.set(ride.id, start);
          return ride.id;
        } catch {
          return null;
        }
      });
      // Wait for this round's rides to finish (each passenger has one ride at a time).
      const round_ = ids.filter((x): x is string => !!x);
      const deadline = Date.now() + 90_000;
      while (round_.some((id) => !done.has(id)) && Date.now() < deadline) await sleep(250);
      const missing = round_.filter((id) => !done.has(id));
      if (missing.length) failures.push(`round ${round}: ${missing.length} rides never completed`);
    }
    booking = false;
    await Promise.race([Promise.all(loops), sleep(5000)]);
    stopped = true;
    await Promise.all(streams);
    for (const [id, at] of acceptedAt)
      if (bookedAt.has(id)) rec.record('matching (book → accepted)', at - bookedAt.get(id)!);

    // --- 3. Bus seat races ---------------------------------------------------------
    log(`Bus seat races: ${opt.racers} passengers per seat …`);
    const buses = testBuses(api, DATABASE_URL);
    const staff = await api.signInWithTotp(STAFF_PHONE);
    const { managerToken } = await buses.operator(staff.token, 'Load Line', MANAGER_PHONE);
    const service = await buses.service(
      managerToken,
      Array.from({ length: n('departures') }, (_, i) => i + 2),
    );
    const racers = passengers.slice(-Math.min(n('racers'), passengers.length));
    const labels = ['E1', 'E2', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
    let races = 0;
    for (const scheduleId of service.departures) {
      for (const label of labels) {
        const results = await Promise.all(
          racers.map(async (p, i) => {
            const start = performance.now();
            const res = await fetch(`${API_URL}/v1/bus/bookings`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${p.token}`,
                'Idempotency-Key': randomUUID(),
              },
              body: JSON.stringify({
                scheduleId,
                seats: [{ seatId: service.seat(label), passengerName: `Racer ${i}` }],
              }),
            });
            const body = (await res.json()) as { error?: { code?: string } };
            const ms = performance.now() - start;
            if (res.status === 201) rec.record('bus hold (won)', ms);
            else if (res.status === 409 && body.error?.code === 'SEAT_UNAVAILABLE')
              rec.record('bus hold (seat taken)', ms);
            else rec.fail('bus hold', new Error(`${res.status} ${JSON.stringify(body)}`));
            return res.status;
          }),
        );
        races++;
        const winners = results.filter((s) => s === 201).length;
        if (winners !== 1) failures.push(`seat ${label}: ${winners} winners instead of 1`);
      }
    }
    // Racers who later won another seat on the same bus gave their earlier one back,
    // so check the database directly: never two active holds on one seat.
    const doubled = await withDatabase(DATABASE_URL, (db) =>
      db.query(
        `SELECT schedule_id, seat_id FROM bus_booking_seats WHERE status = 'active'
         GROUP BY schedule_id, seat_id HAVING count(*) > 1`,
      ),
    );
    if (doubled.rowCount) failures.push(`${doubled.rowCount} seats held twice`);

    // --- Checks ------------------------------------------------------------------
    const scrape = await fetch(`${API_URL}/metrics`, {
      headers: { Authorization: `Bearer ${METRICS_TOKEN}` },
    });
    const metrics = await scrape.text();
    if (!scrape.ok) failures.push(`metrics endpoint answered ${scrape.status}`);
    const gauge = (name: string) => {
      const m = metrics.match(new RegExp(`^${name} (\\S+)$`, 'm'));
      return m ? Number(m[1]) : NaN;
    };
    for (const [name, want] of [
      ['rwm_ledger_mismatched_wallets', 0],
      ['rwm_rides_searching', 0],
      ['rwm_rides_active', 0],
    ] as const) {
      const got = gauge(name);
      if (got !== want) failures.push(`${name} is ${got}, expected ${want}`);
    }

    const rows = rec.summaries();
    log(`\n${formatTable(rows)}\n`);
    log(`Rides completed: ${done.size}/${bookedAt.size}. Seat races: ${races}.`);
    for (const r of rows) {
      if (r.errors)
        failures.push(`${r.name}: ${r.errors} errors (first: ${rec.firstError(r.name)})`);
      const budget = r.name.startsWith('matching') ? n('match-p95-ms') : n('p95-ms');
      if (!r.name.startsWith('trip steps') && r.p95 > budget)
        failures.push(`${r.name}: p95 ${Math.round(r.p95)} ms is over ${budget} ms`);
    }
    writeFileSync(
      path.join(OUT, 'report.json'),
      JSON.stringify({ options: opt, at: new Date().toISOString(), rows, failures }, null, 2),
    );
    if (failures.length) {
      console.error(`\nFAILED:\n- ${failures.join('\n- ')}`);
      process.exitCode = 1;
    } else log('\nAll checks passed.');
  } finally {
    proc.kill('SIGTERM');
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
