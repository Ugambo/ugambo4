'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** A QR code drawn in the browser (nothing is sent anywhere). */
export function QrImage({ value, size = 200, alt }: { value: string; size?: number; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void QRCode.toDataURL(value, { margin: 1, width: size * 2, errorCorrectionLevel: 'M' }).then(
      (url) => {
        if (live) setSrc(url);
      },
    );
    return () => {
      live = false;
    };
  }, [value, size]);
  return src ? (
    <img className="ticket-qr" src={src} width={size} height={size} alt={alt} />
  ) : (
    <span className="ticket-qr" style={{ width: size, height: size }} aria-hidden="true" />
  );
}
