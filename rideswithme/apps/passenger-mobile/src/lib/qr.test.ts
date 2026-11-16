import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import { qrRuns } from './qr';

describe('QR runs', () => {
  it('covers exactly the dark modules of the code', () => {
    const value = 'RWMBUS:ABCDEFGHJK';
    const { size, rows } = qrRuns(value);
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    expect(size).toBe(qr.modules.size);
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) {
        const inRun = rows[r]!.some((run) => c >= run.start && c < run.start + run.length);
        expect(inRun).toBe(Boolean(qr.modules.get(r, c)));
      }
    // The finder pattern's top row is one run of 7.
    expect(rows[0]![0]).toEqual({ start: 0, length: 7 });
  });
});
