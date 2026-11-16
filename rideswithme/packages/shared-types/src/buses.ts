/** Bus operators, routes, departures, seat maps, bookings and tickets (Phase 7). */

import type { PaymentView } from './payments';

export const SEAT_CLASSES = ['standard', 'executive', 'vip'] as const;
export type SeatClass = (typeof SEAT_CLASSES)[number];

export type BusBookingStatus = 'held' | 'confirmed' | 'expired' | 'cancelled';
/** `departed` once the departure time has passed (never stored). */
export type BusDepartureStatus = 'scheduled' | 'departed' | 'cancelled';

export interface BusFare {
  seatClass: SeatClass;
  fareKobo: number;
}

export interface BusRouteView {
  id: string;
  originCity: string;
  originTerminal: string;
  destinationCity: string;
  destinationTerminal: string;
  durationMinutes: number;
  isActive: boolean;
}

/** A city pair with at least one active route (for the search form). */
export interface BusCityPair {
  originCity: string;
  destinationCity: string;
}

export interface BusSeatView {
  id: string;
  label: string;
  row: number;
  col: number;
  seatClass: SeatClass;
}

export interface BusSeatLayoutView {
  id: string;
  name: string;
  rows: number;
  columns: number;
  seats: BusSeatView[];
  /** Used by a departure: it can no longer change (tickets refer to its seats). */
  inUse: boolean;
}

export interface BusDepartureSummary {
  id: string;
  operator: { id: string; name: string };
  route: Omit<BusRouteView, 'isActive'>;
  departsAt: string;
  arrivesAt: string;
  vehiclePlate: string | null;
  status: BusDepartureStatus;
  /** Seats can be bought (until shortly before departure). */
  salesOpen: boolean;
  seatsTotal: number;
  seatsLeft: number;
  /** Only the classes the bus has. */
  fares: BusFare[];
}

export interface BusSeatMapSeat extends BusSeatView {
  state: 'available' | 'taken' | 'yours';
  fareKobo: number;
}

export interface BusDepartureDetail extends BusDepartureSummary {
  layout: { rows: number; columns: number; seats: BusSeatMapSeat[] };
}

export interface BusTicketView {
  id: string;
  seatLabel: string;
  seatClass: SeatClass;
  passengerName: string;
  fareKobo: number;
  /** Shown and encoded in the QR code only once the booking is paid. */
  ticketCode: string | null;
  /** Text for the QR code (`RWMBUS:<ticketCode>`), null until paid. */
  qrPayload: string | null;
  checkedInAt: string | null;
}

export interface BusBookingView {
  id: string;
  reference: string;
  status: BusBookingStatus;
  holdExpiresAt: string;
  totalKobo: number;
  paymentMethod: 'wallet' | 'card' | null;
  /** A card payment still being processed. */
  paymentPending: boolean;
  departure: BusDepartureSummary;
  tickets: BusTicketView[];
  /** Until when the passenger can cancel for a full refund (null if they cannot). */
  cancelUntil: string | null;
  cancelledAt: string | null;
  cancelledBy: 'passenger' | 'operator' | 'admin' | null;
  cancelReason: string | null;
  refundedKobo: number;
  createdAt: string;
  confirmedAt: string | null;
}

export interface BusPayResult {
  booking: BusBookingView;
  /** Set for a checkout: open it, then check the payment and reload the booking. */
  checkoutUrl: string | null;
  /** The checkout's payment (null when paid from the wallet or a saved card). */
  payment: PaymentView | null;
}

// --- Operators (portal and admin) ---

export interface BusOperatorSummary {
  id: string;
  name: string;
  status: 'active' | 'suspended';
  serviceFeeBps: number;
  contactPhone: string | null;
  contactEmail: string | null;
  managers: { userId: string; name: string | null; phone: string | null }[];
  /** What RideswithMe owes the operator for seats sold, less settlements. */
  balanceKobo: number;
  createdAt: string;
}

export interface BusPeriodTotals {
  seatsSold: number;
  /** What passengers paid. */
  faresKobo: number;
  /** The operator's share after RideswithMe's service fee. */
  earningsKobo: number;
}

export interface OperatorOverview {
  operator: { id: string; name: string; status: 'active' | 'suspended'; serviceFeeBps: number };
  upcomingDepartures: number;
  today: BusPeriodTotals;
  week: BusPeriodTotals;
  balanceKobo: number;
}

export interface OperatorDepartureView extends BusDepartureSummary {
  routeId: string;
  layout: { id: string; name: string };
  seatsSold: number;
  seatsHeld: number;
  checkedIn: number;
  faresKobo: number;
  cancelReason: string | null;
}

export interface ManifestEntry {
  seatLabel: string;
  seatClass: SeatClass;
  passengerName: string;
  bookingReference: string;
  checkedInAt: string | null;
}

export interface OperatorDepartureDetail extends OperatorDepartureView {
  manifest: ManifestEntry[];
}

export interface CheckInResult {
  seatLabel: string;
  passengerName: string;
  bookingReference: string;
  departure: { id: string; departsAt: string; originCity: string; destinationCity: string };
  /** The ticket had already been checked in (at checkedInAt). */
  alreadyCheckedIn: boolean;
  checkedInAt: string;
}

/** Staff view of a booking. */
export interface AdminBusBookingView extends BusBookingView {
  passenger: { id: string; name: string | null; phone: string | null };
}
