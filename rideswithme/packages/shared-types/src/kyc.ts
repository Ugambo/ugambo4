/** Passenger details and identity checks (KYC), reviewed by staff (DECISIONS D-083). */

export const GENDERS = ['female', 'male'] as const;
export type Gender = (typeof GENDERS)[number];

/** IDs a passenger may photograph; the NIN is always given as well. */
export const PASSENGER_ID_TYPES = [
  'nin_slip',
  'national_id_card',
  'drivers_licence',
  'voters_card',
  'passport',
] as const;
export type PassengerIdType = (typeof PASSENGER_ID_TYPES)[number];

export type PassengerKycStatus = 'not_started' | 'pending' | 'approved' | 'rejected';

/** What still stops a passenger booking, for their own screens. */
export interface PassengerVerificationView {
  /** False when staff have switched the requirement off in Settings. */
  required: boolean;
  /** True when booking is allowed (approved, or not required). */
  canBook: boolean;
  /** Details still missing from the profile ("fullName", "gender", "dateOfBirth", "emergencyContact"). */
  missingDetails: string[];
  status: PassengerKycStatus;
  idType: PassengerIdType | null;
  ninLast4: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

export interface KycUploadTicket {
  uploadId: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
}

/** A row in staff's review list. */
export interface AdminPassengerVerificationItem {
  userId: string;
  name: string | null;
  phone: string | null;
  status: Exclude<PassengerKycStatus, 'not_started'>;
  idType: PassengerIdType;
  ninLast4: string;
  submittedAt: string;
  reviewedAt: string | null;
}

/** Everything staff need to decide (the photos come from short-lived links). */
export interface AdminPassengerVerificationDetail extends AdminPassengerVerificationItem {
  email: string | null;
  gender: Gender | null;
  dateOfBirth: string | null;
  emergencyContact: { name: string; phone: string } | null;
  rejectionReason: string | null;
  reviewedBy: { id: string; name: string | null } | null;
}
