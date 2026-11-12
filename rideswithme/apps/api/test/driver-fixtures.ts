import type {
  DocumentType,
  DocumentUploadTicket,
  DriverOnboardingView,
} from '@rideswithme/shared-types';
import type { Harness } from './harness';

export const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  Buffer.alloc(200, 7),
]);
export const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(200, 3),
]);
export const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');

let plateCounter = 0;
export function nextPlate() {
  plateCounter++;
  return `KTN${String(100 + plateCounter).slice(-3)}XA`;
}
let ninCounter = 0;
export function nextNin() {
  ninCounter++;
  return String(20_000_000_000 + ninCounter);
}

export function inDays(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Asks for an upload URL, PUTs the bytes to object storage, returns the ticket. */
export async function uploadFile(
  h: Harness,
  auth: string,
  documentType: DocumentType,
  body: Buffer,
  contentType: 'image/jpeg' | 'image/png' | 'application/pdf',
): Promise<DocumentUploadTicket> {
  const res = await h.http
    .post('/v1/driver/documents/uploads')
    .set('Authorization', auth)
    .send({ documentType, contentType, sizeBytes: body.length })
    .expect(200);
  const ticket = res.body as DocumentUploadTicket;
  const put = await fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.headers, body });
  if (!put.ok) throw new Error(`Upload failed: ${put.status} ${await put.text()}`);
  return ticket;
}

const NEEDS_EXPIRY = new Set<DocumentType>([
  'drivers_licence',
  'vehicle_registration',
  'insurance_certificate',
  'roadworthiness_certificate',
  'operating_permit',
]);

export async function addDocument(
  h: Harness,
  auth: string,
  documentType: DocumentType,
  extra: Record<string, string> = {},
) {
  const isPhoto = documentType === 'profile_photo' || documentType.startsWith('vehicle_photo');
  const ticket = await uploadFile(
    h,
    auth,
    documentType,
    isPhoto ? JPEG : PDF,
    isPhoto ? 'image/jpeg' : 'application/pdf',
  );
  const res = await h.http
    .post('/v1/driver/documents')
    .set('Authorization', auth)
    .send({
      uploadId: ticket.uploadId,
      ...(NEEDS_EXPIRY.has(documentType) && { expiresOn: inDays(365) }),
      ...(documentType === 'drivers_licence' && { documentNumber: 'KTN-12345-AB67' }),
      ...extra,
    })
    .expect(201);
  return res.body as { id: string; documentType: DocumentType; status: string };
}

/** Takes a signed-in user all the way to a submitted application. */
export async function completeApplication(
  h: Harness,
  auth: string,
  categoryKey = 'car',
): Promise<DriverOnboardingView> {
  await h.http.post('/v1/driver/registration').set('Authorization', auth).expect(200);
  await h.http
    .patch('/v1/driver/profile')
    .set('Authorization', auth)
    .send({ fullName: 'Musa Abdullahi', nin: nextNin() })
    .expect(200);
  await h.http
    .put('/v1/driver/vehicle')
    .set('Authorization', auth)
    .send({
      categoryKey,
      plateNumber: nextPlate(),
      make: 'Toyota',
      model: 'Corolla',
      colour: 'Silver',
      year: 2015,
    })
    .expect(200);
  await h.http
    .put('/v1/driver/payout-account')
    .set('Authorization', auth)
    .send({ bankCode: '058', accountNumber: '0123456789', accountName: 'Musa Abdullahi' })
    .expect(200);
  const view = (await h.http.get('/v1/driver/onboarding').set('Authorization', auth).expect(200))
    .body as DriverOnboardingView;
  for (const r of view.requirements) await addDocument(h, auth, r.key);
  return (await h.http.post('/v1/driver/submit').set('Authorization', auth).expect(200))
    .body as DriverOnboardingView;
}
