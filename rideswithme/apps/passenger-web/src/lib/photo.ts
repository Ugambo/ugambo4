'use client';

import { ApiError, type ClientErrorCode } from '@rideswithme/api-client';
import { CSRF_HEADER } from '@rideswithme/web-core/client';

/**
 * Makes a phone photo a sensible size before upload: at most 1600 px on the
 * long side, as JPEG. Big camera photos (5-10 MB) become a few hundred KB, and
 * HEIC photos from iPhones (which browsers can show but the API does not
 * accept) become JPEG.
 */
export async function shrinkPhoto(file: File): Promise<{ blob: Blob; preview: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('not_image'));
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) throw new Error('not_image');
    return { blob, preview: canvas.toDataURL('image/jpeg', 0.6) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Sends a photo through this site's server (see /api/kyc-upload); returns the upload id. */
export async function uploadKycPhoto(kind: 'id' | 'selfie', blob: Blob): Promise<string> {
  const res = await fetch(`/api/kyc-upload?kind=${kind}`, {
    method: 'POST',
    headers: { 'Content-Type': blob.type, ...CSRF_HEADER },
    body: blob,
  });
  const body = (await res.json().catch(() => null)) as {
    uploadId?: string;
    error?: { code: ClientErrorCode; message: string };
  } | null;
  if (!res.ok || !body?.uploadId)
    // The site's usual error messages (by code) then apply.
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.message ?? 'Upload failed',
    );
  return body.uploadId;
}
