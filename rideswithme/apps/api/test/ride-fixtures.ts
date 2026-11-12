import { randomUUID } from 'node:crypto';
import type { FareEstimateResponse, LatLng, RideView } from '@rideswithme/shared-types';
import { DispatcherService } from '../src/rides/dispatcher.service';
import { PricingService } from '../src/pricing/pricing.service';
import { RideService } from '../src/rides/ride.service';
import { completeApplication } from './driver-fixtures';
import { type Harness, nextPhone, signIn } from './harness';

/** Kano-area test city (rectangle) and places inside it. */
export const BBOX: [number, number, number, number] = [8.4, 11.9, 8.62, 12.1];
export const PICKUP = { location: { lat: 12.0, lng: 8.5167 }, address: 'Kurmi Market, Kano' };
export const DROPOFF = {
  location: { lat: 12.0476, lng: 8.5246 },
  address: 'Mallam Aminu Kano International Airport',
};
export const OUTSIDE = { location: { lat: 9.0702, lng: 7.4734 }, address: 'Wuse Market, Abuja' };

/** Offset a point by roughly `meters` north. */
export const north = (p: LatLng, meters: number): LatLng => ({
  lat: p.lat + meters / 111_320,
  lng: p.lng,
});

export async function seedCity(h: Harness) {
  await h.app.get(PricingService).seedCity('testville', 'Test City', BBOX);
  // Bookings in tests dispatch only when a test calls tick().
  h.app.get(RideService).onRideSearching = () => undefined;
}

export const dispatcher = (h: Harness) => h.app.get(DispatcherService);

export async function passenger(h: Harness) {
  const { tokens, user } = await signIn(h, nextPhone());
  return { auth: `Bearer ${tokens.accessToken}`, userId: user.id };
}

/** A driver with an approved application (shortcut through the database). */
export async function approvedDriver(h: Harness, category = 'car') {
  const phone = nextPhone();
  const { tokens, user } = await signIn(h, phone);
  const auth = `Bearer ${tokens.accessToken}`;
  await completeApplication(h, auth, category);
  const now = new Date();
  await h.db
    .updateTable('driver_documents')
    .set({ status: 'approved', reviewed_at: now })
    .where('driver_user_id', '=', user.id)
    .execute();
  await h.db
    .updateTable('driver_profiles')
    .set({ status: 'approved', approved_at: now, reviewed_at: now })
    .where('user_id', '=', user.id)
    .execute();
  return { auth, userId: user.id, phone };
}

export async function goOnline(
  h: Harness,
  auth: string,
  at: LatLng,
  recordedAt = new Date(),
): Promise<void> {
  await h.http
    .post('/v1/driver/availability')
    .set('Authorization', auth)
    .send({ online: true, location: { ...at, recordedAt: recordedAt.toISOString() } })
    .expect(200);
}

export async function estimate(
  h: Harness,
  auth: string,
  pickup = PICKUP,
  dropoff = DROPOFF,
): Promise<FareEstimateResponse> {
  return (
    await h.http
      .post('/v1/fares/estimate')
      .set('Authorization', auth)
      .send({ pickup, dropoff })
      .expect(200)
  ).body;
}

export async function book(
  h: Harness,
  auth: string,
  category = 'car',
  extra: Record<string, unknown> = {},
): Promise<RideView> {
  const est = await estimate(h, auth);
  const option = est.options.find((o) => o.category.key === category)!;
  const res = await h.http
    .post('/v1/rides')
    .set('Authorization', auth)
    .set('Idempotency-Key', randomUUID())
    .send({ quoteId: option.quoteId, paymentMethod: 'cash', ...extra })
    .expect(201);
  return res.body as RideView;
}

export async function currentOffer(h: Harness, auth: string) {
  return (await h.http.get('/v1/driver/offers/current').set('Authorization', auth).expect(200)).body
    .offer as {
    offerId: string;
    rideId: string;
    fareKobo: number;
    estimatedEarningsKobo: number;
    distanceToPickupMeters: number;
  } | null;
}

/** Books a ride and has the given driver accept it. */
export async function assignedRide(h: Harness, p: { auth: string }, d: { auth: string }) {
  const ride = await book(h, p.auth);
  await dispatcher(h).tick();
  const offer = await currentOffer(h, d.auth);
  if (!offer) throw new Error('Driver received no offer');
  await h.http
    .post(`/v1/driver/offers/${offer.offerId}/accept`)
    .set('Authorization', d.auth)
    .expect(200);
  return ride;
}
