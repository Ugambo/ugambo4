export interface LatLng {
  lat: number;
  lng: number;
}

export interface Place {
  placeId?: string | null;
  name?: string | null;
  address: string;
  location: LatLng;
}

export interface PlaceSuggestion {
  placeId: string;
  primaryText: string;
  secondaryText: string;
}

export interface RouteSummary {
  distanceMeters: number;
  durationSeconds: number;
  /** Google encoded polyline of the route, when the maps provider gives one. */
  polyline: string | null;
}

/** Every line of a price, in kobo. total = the sum, after minimum and rounding. */
export interface FareBreakdown {
  baseKobo: number;
  distanceKobo: number;
  timeKobo: number;
  /** Extra from a peak-time multiplier (0 outside peak windows). */
  peakSurchargeKobo: number;
  peakMultiplierBps: number;
  bookingFeeKobo: number;
  /** Added to reach the minimum fare (0 when the fare is above it). */
  minimumAdjustmentKobo: number;
  /** Added to round up to the rounding increment (e.g. ₦50). */
  roundingKobo: number;
  totalKobo: number;
}

export interface FareQuoteOption {
  quoteId: string;
  category: { key: string; name: string; seats: number };
  totalKobo: number;
  breakdown: FareBreakdown;
  /** Seconds for the nearest available driver to reach the pickup; null when none is near. */
  etaSeconds: number | null;
  expiresAt: string;
}

export interface FareEstimateResponse {
  serviceArea: { key: string; name: string };
  pickup: Place;
  dropoff: Place;
  route: RouteSummary;
  options: FareQuoteOption[];
}

export const RIDE_STATUSES = [
  'requested',
  'searching',
  'driver_assigned',
  'driver_arrived',
  'in_progress',
  'completed',
  'cancelled_by_passenger',
  'cancelled_by_driver',
  'no_driver_found',
] as const;
export type RideStatus = (typeof RIDE_STATUSES)[number];

export const ACTIVE_RIDE_STATUSES: readonly RideStatus[] = [
  'requested',
  'searching',
  'driver_assigned',
  'driver_arrived',
  'in_progress',
];
export const isTerminalRideStatus = (s: RideStatus) => !ACTIVE_RIDE_STATUSES.includes(s);

export const PAYMENT_METHODS = ['cash', 'wallet', 'card'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const DRIVER_CANCEL_REASONS = [
  'passenger_no_show',
  'vehicle_problem',
  'safety_concern',
  'other',
] as const;
export type DriverCancelReason = (typeof DRIVER_CANCEL_REASONS)[number];

export interface DriverPosition extends LatLng {
  /** When the phone took the reading. */
  recordedAt: string;
  /** When the server received it. Show "last updated X ago" when this is old. */
  receivedAt: string;
}

export interface RideFareView {
  /** From the booked fare: cancelling after the grace period (or once the driver has arrived) costs feeKobo. */
  cancellationPolicy: { feeKobo: number; graceSeconds: number };
  quotedTotalKobo: number;
  waitingChargeKobo: number;
  finalTotalKobo: number | null;
  cancellationFeeKobo: number;
  breakdown: FareBreakdown;
}

export interface RideView {
  id: string;
  status: RideStatus;
  category: { key: string; name: string };
  pickup: Place;
  dropoff: Place;
  route: RouteSummary;
  /** Distance actually driven, from the trip's location history (completed rides). */
  actualDistanceMeters: number | null;
  scheduledFor: string | null;
  paymentMethod: PaymentMethod;
  fare: RideFareView;
  driver: {
    firstName: string;
    vehicle: { make: string; model: string; colour: string; plateNumber: string };
    position: DriverPosition | null;
    hasPhoto: boolean;
  } | null;
  requestedAt: string;
  assignedAt: string | null;
  arrivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

export interface DriverRideView extends Omit<RideView, 'driver'> {
  passenger: { firstName: string };
  earnings: {
    fareKobo: number;
    bookingFeeKobo: number;
    commissionKobo: number;
    netKobo: number;
  } | null;
}

export interface DriverOfferView {
  offerId: string;
  rideId: string;
  expiresAt: string;
  category: { key: string; name: string };
  pickup: Place;
  dropoff: Place;
  distanceToPickupMeters: number;
  trip: { distanceMeters: number; durationSeconds: number };
  fareKobo: number;
  /** Fare less booking fee and commission, before any waiting charge. */
  estimatedEarningsKobo: number;
  paymentMethod: PaymentMethod;
}

export interface DriverAvailabilityView {
  online: boolean;
  /** Present when the driver may not go online. */
  blockers: { code: string; documentType?: string }[];
  position: DriverPosition | null;
}

export interface SavedPlace {
  id: string;
  label: 'home' | 'work' | 'other';
  name: string;
  address: string;
  location: LatLng;
  placeId: string | null;
}

export interface RideEventView {
  id: string;
  eventType: string;
  fromStatus: RideStatus | null;
  toStatus: RideStatus | null;
  actorType: 'passenger' | 'driver' | 'admin' | 'system';
  actorId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PeakWindow {
  /** ISO weekdays, Monday = 1. */
  days: number[];
  /** HH:MM, Nigerian time. */
  start: string;
  end: string;
  /** 12000 = 1.2×. */
  multiplierBps: number;
}

export interface FareRuleView {
  id: string;
  serviceArea: { key: string; name: string };
  category: { key: string; name: string };
  baseFareKobo: number;
  perKmKobo: number;
  perMinuteKobo: number;
  minimumFareKobo: number;
  bookingFeeKobo: number;
  cancellationFeeKobo: number;
  cancellationGraceSeconds: number;
  waitingFreeMinutes: number;
  waitingPerMinuteKobo: number;
  commissionBps: number;
  roundingIncrementKobo: number;
  peakWindows: PeakWindow[];
  createdAt: string;
}

export interface ServiceAreaView {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  /** GeoJSON MultiPolygon. */
  boundary: { type: 'MultiPolygon'; coordinates: number[][][][] };
}
