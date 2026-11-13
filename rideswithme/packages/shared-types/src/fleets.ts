/** Fleet operators, their drivers, and the admin dashboard's overview. Amounts are kobo. */

export type FleetStatus = 'active' | 'suspended';
export type FleetMemberStatus = 'invited' | 'active' | 'declined' | 'removed';

export interface FleetSummary {
  id: string;
  name: string;
  status: FleetStatus;
  contactPhone: string | null;
  contactEmail: string | null;
  drivers: number;
  managers: { userId: string; name: string | null; phone: string | null }[];
  createdAt: string;
}

export interface FleetPeriodTotals {
  trips: number;
  /** Fares of completed trips (what passengers paid). */
  faresKobo: number;
  /** What the drivers kept after booking fees and commission. */
  earningsKobo: number;
  commissionKobo: number;
}

export interface FleetOverview {
  fleet: { id: string; name: string; status: FleetStatus };
  drivers: { active: number; invited: number; online: number; onTrip: number };
  today: FleetPeriodTotals;
  week: FleetPeriodTotals;
}

export interface FleetDriverView {
  userId: string;
  name: string | null;
  phone: string | null;
  membership: { status: FleetMemberStatus; invitedAt: string; joinedAt: string | null };
  /** Driver application status (onboarding, pending_review, approved, rejected, suspended). */
  driverStatus: string | null;
  online: boolean;
  /** When the driver's position was last received (null when never). */
  lastSeenAt: string | null;
  vehicle: {
    category: string;
    make: string;
    model: string;
    colour: string;
    plateNumber: string;
  } | null;
  today: FleetPeriodTotals;
  week: FleetPeriodTotals;
}

export interface FleetTripView {
  id: string;
  status: string;
  driver: { userId: string; name: string | null };
  category: string;
  pickupAddress: string;
  dropoffAddress: string;
  paymentMethod: 'cash' | 'wallet' | 'card';
  fareKobo: number | null;
  earningsKobo: number | null;
  commissionKobo: number | null;
  requestedAt: string;
  completedAt: string | null;
}

/** An invitation as the driver sees it. */
export interface FleetInvitationView {
  id: string;
  fleet: { id: string; name: string };
  invitedAt: string;
}

export interface DriverFleetView {
  current: { id: string; name: string; joinedAt: string } | null;
  invitations: FleetInvitationView[];
}

// --- Admin dashboard ---

export interface DashboardKpis {
  riders: number;
  newRidersToday: number;
  drivers: number;
  driversOnline: number;
  activeRides: number;
  tripsToday: number;
  /** Platform revenue (booking fees and commission) earned today. */
  revenueTodayKobo: number;
  /** Fares of trips completed today. */
  faresTodayKobo: number;
  openDisputes: number;
}

export interface DashboardDay {
  /** YYYY-MM-DD, Nigerian time. */
  date: string;
  trips: number;
  faresKobo: number;
  revenueKobo: number;
}

export interface DashboardView {
  kpis: DashboardKpis;
  days: DashboardDay[];
}

export interface LiveDriver {
  driverId: string;
  name: string | null;
  lat: number;
  lng: number;
  receivedAt: string;
  rideId: string | null;
}

export interface LiveRide {
  id: string;
  status: string;
  category: string;
  pickup: { lat: number; lng: number; address: string };
  dropoff: { lat: number; lng: number; address: string };
  driverId: string | null;
  requestedAt: string;
}

export interface LiveView {
  drivers: LiveDriver[];
  rides: LiveRide[];
}
