'use client';

import type * as Leaflet from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { useConfig } from '@/lib/config';
import { useI18n } from '@/lib/i18n';

export type L = typeof Leaflet;

/**
 * A Leaflet map with the configured tiles. Leaflet needs a browser, so it is
 * loaded on the client. `onReady` receives the map and the library once.
 */
export function LeafletMap({
  center,
  zoom = 12,
  onReady,
  label,
  height = 480,
}: {
  center: [number, number];
  zoom?: number;
  onReady: (map: Leaflet.Map, L: L) => void | (() => void);
  label: string;
  height?: number;
}) {
  const { tiles } = useConfig();
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const ready = useRef(onReady);
  ready.current = onReady;

  useEffect(() => {
    let map: Leaflet.Map | null = null;
    let cleanup: void | (() => void);
    let cancelled = false;
    void import('leaflet').then((mod) => {
      const L = (mod as unknown as { default?: L }).default ?? (mod as unknown as L);
      if (cancelled || !ref.current) return;
      map = L.map(ref.current, { zoomControl: true }).setView(center, zoom);
      const layer = L.tileLayer(tiles.url, { attribution: tiles.attribution, maxZoom: 19 });
      layer.on('tileerror', () => setFailed(true));
      layer.addTo(map);
      cleanup = ready.current(map, L);
    });
    return () => {
      cancelled = true;
      if (typeof cleanup === 'function') cleanup();
      map?.remove();
    };
  }, []);

  return (
    <div className="map-frame">
      <div ref={ref} className="map" style={{ height }} role="application" aria-label={label} />
      {failed && <p className="small muted map-note">{t('map.tilesFailed')}</p>}
    </div>
  );
}
