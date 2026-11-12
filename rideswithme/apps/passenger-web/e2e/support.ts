import { readFileSync } from 'node:fs';
import { testApi } from '@rideswithme/e2e-support';
import { API_LOG, API_URL, DRIVER_FILE, POLICY_VERSION } from './env';

export const api = testApi({ apiUrl: API_URL, apiLog: API_LOG, policyVersion: POLICY_VERSION });

/** Kurmi Market in the fake maps provider's Kano places. */
export const KURMI = { lat: 11.9906, lng: 8.5141 };

/** The approved driver created by global-setup, acting through the API as the driver app would. */
export function driver() {
  const { token } = JSON.parse(readFileSync(DRIVER_FILE, 'utf8')) as { token: string };
  const at = (lat: number, lng: number) => ({ lat, lng, recordedAt: new Date().toISOString() });
  return {
    goOnline: (lat: number, lng: number) =>
      api.call('/v1/driver/availability', {
        method: 'POST',
        token,
        body: { online: true, location: at(lat, lng) },
      }),
    goOffline: () =>
      api.call('/v1/driver/availability', { method: 'POST', token, body: { online: false } }),
    sendLocation: (lat: number, lng: number) =>
      api.call('/v1/driver/location', { method: 'POST', token, body: { points: [at(lat, lng)] } }),
    /** Waits for a ride offer and accepts it. */
    async acceptNextOffer(): Promise<string> {
      for (let i = 0; i < 60; i++) {
        const { offer } = await api.call<{ offer: { offerId: string; rideId: string } | null }>(
          '/v1/driver/offers/current',
          { token },
        );
        if (offer) {
          await api.call(`/v1/driver/offers/${offer.offerId}/accept`, { method: 'POST', token });
          return offer.rideId;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      throw new Error('No offer arrived');
    },
    arrived: (rideId: string) =>
      api.call(`/v1/driver/rides/${rideId}/arrived`, { method: 'POST', token }),
    start: (rideId: string) =>
      api.call(`/v1/driver/rides/${rideId}/start`, { method: 'POST', token }),
    async complete(rideId: string) {
      const { ride } = await api.call<{ ride: { fare: { quotedTotalKobo: number } } }>(
        '/v1/driver/rides/active',
        {
          token,
        },
      );
      await api.call(`/v1/driver/rides/${rideId}/complete`, {
        method: 'POST',
        token,
        body: { cashCollectedKobo: ride.fare.quotedTotalKobo },
      });
    },
  };
}
