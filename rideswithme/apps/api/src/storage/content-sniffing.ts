import type { UploadContentType } from '@rideswithme/shared-types';

/**
 * Identifies a file from its first bytes. The browser- or app-supplied content
 * type is not trusted: a file is accepted only if its bytes match.
 */
export function sniffContentType(head: Buffer): UploadContentType | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)
    return 'image/jpeg';
  if (
    head.length >= 8 &&
    head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (head.length >= 5 && head.subarray(0, 5).toString('latin1') === '%PDF-')
    return 'application/pdf';
  return null;
}
