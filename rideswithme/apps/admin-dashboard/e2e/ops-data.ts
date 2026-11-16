import { randomUUID } from 'node:crypto';
import { withDatabase } from '@rideswithme/e2e-support';
import { E2E_DATABASE_URL } from './env';
import { call, signIn, submitDriverApplication } from './support';

const KURMI = { location: { lat: 11.9906, lng: 8.5141 }, address: 'Kurmi Market, Kano' };
const AIRPORT = {
  location: { lat: 12.0476, lng: 8.5246 },
  address: 'Mallam Aminu Kano International Airport',
};
const at = (lat: number, lng: number) => ({ lat, lng, recordedAt: new Date().toISOString() });

async function bookAndAccept(passengerToken: string, driverToken: string): Promise<string> {
  const est = await call<{ options: { quoteId: string; category: { key: string } }[] }>(
    '/v1/fares/estimate',
    {
      method: 'POST',
      token: passengerToken,
      body: { pickup: KURMI, dropoff: AIRPORT },
    },
  );
  const quoteId = est.options.find((o) => o.category.key === 'car')!.quoteId;
  const ride = await call<{ id: string }>('/v1/rides', {
    method: 'POST',
    token: passengerToken,
    headers: { 'Idempotency-Key': randomUUID() },
    body: { quoteId, paymentMethod: 'cash' },
  });
  for (let i = 0; i < 60; i++) {
    const { offer } = await call<{ offer: { offerId: string } | null }>(
      '/v1/driver/offers/current',
      { token: driverToken },
    );
    if (offer) {
      await call(`/v1/driver/offers/${offer.offerId}/accept`, {
        method: 'POST',
        token: driverToken,
      });
      return ride.id;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('No offer arrived');
}

/** An approved driver online in Kano with one completed cash ride and one ride in progress. */
export async function prepareOperations() {
  const driver = await submitDriverApplication({
    phone: '+2348031110003',
    fullName: 'Ibrahim Sani',
    nin: '12345678903',
    plate: 'KAN555AA',
  });
  await withDatabase(E2E_DATABASE_URL, async (db) => {
    await db.query(
      `UPDATE driver_documents SET status = 'approved', reviewed_at = now() WHERE driver_user_id = $1`,
      [driver.userId],
    );
    await db.query(
      `UPDATE driver_profiles SET status = 'approved', approved_at = now(), reviewed_at = now() WHERE user_id = $1`,
      [driver.userId],
    );
  });
  await call('/v1/driver/availability', {
    method: 'POST',
    token: driver.token,
    body: { online: true, location: at(12.0036, 8.5141) },
  });

  const first = await signIn('+2348035559001');
  const completed = await bookAndAccept(first.token, driver.token);
  await call('/v1/driver/location', {
    method: 'POST',
    token: driver.token,
    body: { points: [at(11.9908, 8.5141)] },
  });
  await call(`/v1/driver/rides/${completed}/arrived`, { method: 'POST', token: driver.token });
  await call(`/v1/driver/rides/${completed}/start`, { method: 'POST', token: driver.token });
  await call(`/v1/driver/rides/${completed}/complete`, {
    method: 'POST',
    token: driver.token,
    body: { cashCollectedKobo: 0 },
  });

  const second = await signIn('+2348035559002');
  const active = await bookAndAccept(second.token, driver.token);
  return { driverId: driver.userId, completed, active };
}
