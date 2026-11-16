import QRCode from 'qrcode';

/** A QR code as rows of dark runs ({start, length} in modules), for drawing with plain views. */
export function qrRuns(value: string): {
  size: number;
  rows: { start: number; length: number }[][];
} {
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const rows: { start: number; length: number }[][] = [];
  for (let r = 0; r < n; r++) {
    const runs: { start: number; length: number }[] = [];
    let c = 0;
    while (c < n) {
      if (qr.modules.get(r, c)) {
        const start = c;
        while (c < n && qr.modules.get(r, c)) c++;
        runs.push({ start, length: c - start });
      } else c++;
    }
    rows.push(runs);
  }
  return { size: n, rows };
}
