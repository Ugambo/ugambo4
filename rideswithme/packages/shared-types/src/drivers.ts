export const DOCUMENT_TYPES = [
  'profile_photo',
  'national_id',
  'drivers_licence',
  'vehicle_registration',
  'vehicle_photo_front',
  'vehicle_photo_rear',
  'vehicle_photo_interior',
  'insurance_certificate',
  'roadworthiness_certificate',
  'operating_permit',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_STATUSES = ['pending', 'approved', 'rejected', 'expired'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DRIVER_STATUSES = [
  'onboarding',
  'pending_review',
  'approved',
  'rejected',
  'suspended',
] as const;
export type DriverStatus = (typeof DRIVER_STATUSES)[number];

/** File types accepted for upload. Photos are images only; documents may also be PDF. */
export const UPLOAD_CONTENT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export type UploadContentType = (typeof UPLOAD_CONTENT_TYPES)[number];
export const PHOTO_CONTENT_TYPES: readonly UploadContentType[] = ['image/jpeg', 'image/png'];
export const MAX_DOCUMENT_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface VehicleCategorySummary {
  key: string;
  name: string;
  description: string;
  seats: number;
  requiredDocuments: DocumentType[];
}

export interface DocumentTypeInfo {
  key: DocumentType;
  name: string;
  scope: 'driver' | 'vehicle';
  media: 'photo' | 'document';
  requiresExpiry: boolean;
  requiresNumber: boolean;
}

export interface DriverDocumentView {
  id: string;
  documentType: DocumentType;
  /** Effective status: an approved document past its expiry date reads as expired. */
  status: DocumentStatus;
  contentType: string;
  sizeBytes: number;
  numberLast4: string | null;
  /** Last valid day, YYYY-MM-DD, Nigerian time. */
  expiresOn: string | null;
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export type RequirementStatus = 'missing' | DocumentStatus;

export interface DocumentRequirement extends DocumentTypeInfo {
  /** Status of the most recent upload, or "missing". */
  status: RequirementStatus;
  latest: DriverDocumentView | null;
  /** True when some approved upload of this type is still in date. */
  hasValidApproval: boolean;
}

export type SubmissionGap =
  | { code: 'FULL_NAME' }
  | { code: 'NIN' }
  | { code: 'PAYOUT_ACCOUNT' }
  | { code: 'VEHICLE' }
  | { code: 'DOCUMENT'; documentType: DocumentType };

export type OnlineBlocker =
  | { code: 'ACCOUNT_NOT_ACTIVE' }
  | { code: 'DRIVER_NOT_APPROVED' }
  | { code: 'NO_ACTIVE_VEHICLE' }
  | { code: 'VEHICLE_CATEGORY_DISABLED' }
  | { code: 'DOCUMENT_NOT_APPROVED'; documentType: DocumentType }
  | { code: 'DOCUMENT_EXPIRED'; documentType: DocumentType }
  /** Owes more commission (from cash trips) than allowed; top up the driver wallet. */
  | { code: 'WALLET_DEBT'; owedKobo: number; limitKobo: number };

export interface DriverVehicleView {
  id: string;
  category: { key: string; name: string };
  plateNumber: string;
  make: string;
  model: string;
  colour: string;
  year: number;
}

export interface DriverOnboardingView {
  userId: string;
  status: DriverStatus;
  rejectionReason: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  profile: { fullName: string | null; ninLast4: string | null };
  payoutAccount: { bankCode: string; accountName: string; accountNumberLast4: string } | null;
  vehicle: DriverVehicleView | null;
  requirements: DocumentRequirement[];
  /** Profile and documents may only be edited while onboarding or after a rejection. */
  editable: boolean;
  submission: { ready: boolean; gaps: SubmissionGap[] };
  eligibility: { canGoOnline: boolean; blockers: OnlineBlocker[] };
}

export interface DocumentUploadTicket {
  uploadId: string;
  /** PUT the file here with exactly these headers before it expires. */
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
}

export interface AdminDriverListItem {
  userId: string;
  fullName: string | null;
  phone: string | null;
  status: DriverStatus;
  vehicleCategory: string | null;
  plateNumber: string | null;
  pendingDocuments: number;
  /** When the oldest outstanding item (submission or pending document) arrived. */
  waitingSince: string | null;
  submittedAt: string | null;
}

export interface AdminDriverDetail extends DriverOnboardingView {
  phone: string | null;
  accountStatus: 'active' | 'suspended' | 'deleted';
  /** Every upload, newest first, including replaced and rejected ones. */
  documentHistory: DriverDocumentView[];
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export interface DocumentViewUrl {
  url: string;
  contentType: string;
  expiresAt: string;
}
