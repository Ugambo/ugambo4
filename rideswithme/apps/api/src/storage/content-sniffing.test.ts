import { describe, expect, it } from 'vitest';
import { sniffContentType } from './content-sniffing';

describe('sniffContentType', () => {
  it('recognises JPEG, PNG and PDF by their bytes', () => {
    expect(sniffContentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toBe('image/jpeg');
    expect(sniffContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(
      'image/png',
    );
    expect(sniffContentType(Buffer.from('%PDF-1.7\n'))).toBe('application/pdf');
  });

  it('rejects anything else, including HTML and executables renamed as images', () => {
    expect(sniffContentType(Buffer.from('<html><script>'))).toBeNull();
    expect(sniffContentType(Buffer.from('MZ\x90\x00'))).toBeNull();
    expect(sniffContentType(Buffer.alloc(0))).toBeNull();
  });
});
