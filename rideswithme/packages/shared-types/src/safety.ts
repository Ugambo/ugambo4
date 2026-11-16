/** Safety, engagement and support (Phase 8). */

import type { LatLng } from './rides';

// --- SOS ---

export type SosStatus = 'open' | 'acknowledged' | 'resolved';

export interface SosAlertView {
  id: string;
  status: SosStatus;
  rideId: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
}

/** Staff view: who, where, and the ride. */
export interface AdminSosAlertView extends SosAlertView {
  raisedAs: 'passenger' | 'driver';
  user: { id: string; name: string | null; phone: string | null };
  location: (LatLng & { source: 'device' | 'driver_position'; recordedAt: string | null }) | null;
  note: string | null;
  presses: number;
  ride: {
    id: string;
    status: string;
    pickupAddress: string;
    dropoffAddress: string;
    passenger: { id: string; name: string | null; phone: string | null };
    driver: { id: string; name: string | null; phone: string | null; plate: string | null } | null;
  } | null;
  acknowledgedBy: string | null;
  resolutionNote: string | null;
}

// --- Trip sharing ---

export interface TripShareView {
  url: string;
  expiresWhen: 'trip_ends';
}

/** What anyone with a share link sees: no phone numbers, no passenger details. */
export interface PublicTripView {
  status: string;
  active: boolean;
  driver: {
    firstName: string;
    vehicle: { make: string; model: string; colour: string; plateNumber: string };
  } | null;
  pickupAddress: string;
  dropoffAddress: string;
  position: { lat: number; lng: number; receivedAt: string } | null;
  updatedAt: string;
}

// --- Messages ---

export interface RideMessageView {
  id: string;
  rideId: string;
  from: 'passenger' | 'driver';
  mine: boolean;
  body: string;
  createdAt: string;
}

// --- Incidents ---

export const INCIDENT_CATEGORIES = [
  'safety',
  'accident',
  'harassment',
  'dangerous_driving',
  'lost_item',
  'vehicle',
  'other',
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

export interface IncidentView {
  id: string;
  rideId: string | null;
  category: IncidentCategory;
  priority: 'high' | 'normal';
  description: string;
  status: 'open' | 'investigating' | 'resolved';
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AdminIncidentView extends IncidentView {
  reportedAs: 'passenger' | 'driver';
  reporter: { id: string; name: string | null; phone: string | null };
  assignedTo: { id: string; name: string | null } | null;
}

// --- Ratings ---

export const RATING_TAGS = [
  'great_driving',
  'clean_vehicle',
  'friendly',
  'on_time',
  'unsafe_driving',
  'rude',
  'late',
  'wrong_route',
  'respectful',
  'no_show',
] as const;
export type RatingTag = (typeof RATING_TAGS)[number];

export interface RatingView {
  rideId: string;
  stars: number;
  tags: RatingTag[];
  comment: string | null;
  ratedRole: 'driver' | 'passenger';
  createdAt: string;
}

export interface RatingSummary {
  average: number | null;
  count: number;
  recent: (RatingView & { raterName: string | null })[];
}

// --- Promotions ---

export interface PromotionView {
  id: string;
  code: string;
  description: string;
  discountType: 'percent' | 'fixed';
  percentBps: number | null;
  amountKobo: number | null;
  maxDiscountKobo: number | null;
  minFareKobo: number;
  categoryKeys: string[];
  firstRideOnly: boolean;
  perUserLimit: number;
  maxRedemptions: number | null;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  redemptions: { used: number; reserved: number; discountKobo: number };
}

// --- Support ---

export const TICKET_CATEGORIES = ['payment', 'ride', 'bus', 'account', 'driver', 'other'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketStatus = 'open' | 'waiting_on_user' | 'resolved';

export interface TicketMessageView {
  id: string;
  fromStaff: boolean;
  body: string;
  createdAt: string;
}

export interface TicketView {
  id: string;
  category: TicketCategory;
  subject: string;
  status: TicketStatus;
  rideId: string | null;
  busBookingId: string | null;
  createdAt: string;
  lastMessageAt: string;
  messages: TicketMessageView[];
}

export interface AdminTicketView extends TicketView {
  user: { id: string; name: string | null; phone: string | null };
  assignedTo: { id: string; name: string | null } | null;
}

// --- Notifications ---

export interface NotificationView {
  id: string;
  kind: string;
  title: string;
  body: string;
  data: Record<string, string>;
  read: boolean;
  createdAt: string;
}

// --- Account deletion (NDPA) ---

export interface DeletionRequestView {
  id: string;
  status: 'pending' | 'cancelled' | 'blocked' | 'completed';
  scheduledFor: string;
  blockedReason: string | null;
  createdAt: string;
}

export interface AdminDeletionRequestView extends DeletionRequestView {
  user: { id: string; name: string | null; phone: string | null; roles: string[] };
}
