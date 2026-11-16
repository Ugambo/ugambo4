import { randomUUID } from 'node:crypto';
import type { TestApi } from './api';
import { withDatabase } from './services';

/** Places from the fake maps provider's Kano list (inside the seeded Kano area). */
export const KANO = {
  kurmi: { location: { lat: 11.9906, lng: 8.5141 }, address: 'Kurmi Market, Kano' },
  airport: {
    location: { lat: 12.0476, lng: 8.5246 },
    address: 'Mallam Aminu Kano International Airport',
  },
};

const at = (lat: number, lng: number) => ({ lat, lng, recordedAt: new Date().toISOString() });

/** Ride helpers for browser tests, acting through the API as the apps would. */
export function testRides(api: TestApi, databaseUrl: string) {
  /** Registers a driver with a full application and approves it (through the database). */
  async function approvedDriver(opts: {
    phone: string;
    fullName: string;
    nin: string;
    plate: string;
  }) {
    const d = await api.submitDriverApplication(opts);
    await withDatabase(databaseUrl, async (db) => {
      await db.query(
        `UPDATE driver_documents SET status = 'approved', reviewed_at = now() WHERE driver_user_id = $1`,
        [d.userId],
      );
      await db.query(
        `UPDATE driver_profiles SET status = 'approved', approved_at = now(), reviewed_at = now() WHERE user_id = $1`,
        [d.userId],
      );
    });
    return d;
  }

  /** Puts a driver online about 400 m north of Kurmi Market. */
  const goOnline = (token: string) =>
    api.call('/v1/driver/availability', {
      method: 'POST',
      token,
      body: { online: true, location: at(12.0036, 8.5141) },
    });

  /** A passenger books a cash car ride from Kurmi to the airport and the driver accepts it. */
  async function bookAndAccept(passengerToken: string, driverToken: string): Promise<string> {
    const est = await api.call<{ options: { quoteId: string; category: { key: string } }[] }>(
      '/v1/fares/estimate',
      {
        method: 'POST',
        token: passengerToken,
        body: { pickup: KANO.kurmi, dropoff: KANO.airport },
      },
    );
    const ride = await api.call<{ id: string }>('/v1/rides', {
      method: 'POST',
      token: passengerToken,
      headers: { 'Idempotency-Key': randomUUID() },
      body: {
        quoteId: est.options.find((o) => o.category.key === 'car')!.quoteId,
        paymentMethod: 'cash',
      },
    });
    for (let i = 0; i < 60; i++) {
      const { offer } = await api.call<{ offer: { offerId: string } | null }>(
        '/v1/driver/offers/current',
        { token: driverToken },
      );
      if (offer) {
        await api.call(`/v1/driver/offers/${offer.offerId}/accept`, {
          method: 'POST',
          token: driverToken,
        });
        return ride.id;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('No offer arrived');
  }

  /** Arrives at the pickup, starts and completes an accepted ride. */
  async function finish(rideId: string, driverToken: string) {
    await api.call('/v1/driver/location', {
      method: 'POST',
      token: driverToken,
      body: { points: [at(11.9908, 8.5141)] },
    });
    await api.call(`/v1/driver/rides/${rideId}/arrived`, { method: 'POST', token: driverToken });
    await api.call(`/v1/driver/rides/${rideId}/start`, { method: 'POST', token: driverToken });
    await api.call(`/v1/driver/rides/${rideId}/complete`, {
      method: 'POST',
      token: driverToken,
      body: { cashCollectedKobo: 0 },
    });
  }

  return { approvedDriver, goOnline, bookAndAccept, finish };
}
