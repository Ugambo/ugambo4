'use client';

import type * as Leaflet from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type { LatLng, Place } from '@rideswithme/shared-types';
import { decodePolyline } from '@rideswithme/utilities';
import { useI18n } from '@/lib/i18n';
import { useMapTiles } from '@/lib/map-tiles';

type L = typeof Leaflet;

/** Katsina city, the primary service area: where the map opens before a place is chosen. */
const HOME: [number, number] = [12.99, 7.6];

/** A marker drawn with CSS (no image files), with its label beside it. */
function marker(L: L, kind: 'pickup' | 'dropoff' | 'driver', label: string, stale = false) {
  const html =
    `<span class="pin pin-${kind}${stale ? ' pin-stale' : ''}" data-testid="map-${kind}">` +
    `<span class="pin-dot"></span><span class="pin-label">${label}</span></span>`;
  return L.divIcon({ html, className: 'pin-wrap', iconSize: [18, 18], iconAnchor: [9, 9] });
}

/**
 * A street map of the trip: pickup, destination, the route and the driver, on
 * OpenStreetMap (or the tile server in MAP_TILE_URL). Leaflet needs a browser,
 * so it loads on the client. If tiles cannot load, the markers and route still
 * show on a plain background with a note.
 */
export function StreetMap({
  pickup,
  dropoff,
  polyline,
  driver,
  driverStale = false,
}: {
  pickup: Place | null;
  dropoff: Place | null;
  polyline?: string | null;
  driver?: LatLng | null;
  driverStale?: boolean;
}) {
  const { t } = useI18n();
  const tiles = useMapTiles();
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<{ map: Leaflet.Map; L: L; layer: Leaflet.LayerGroup } | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const empty = !pickup && !dropoff && !driver;

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    void import('leaflet').then((mod) => {
      const L = (mod as unknown as { default?: L }).default ?? (mod as unknown as L);
      if (cancelled || !ref.current) return;
      const m = L.map(ref.current, { zoomControl: true, attributionControl: true }).setView(
        HOME,
        13,
      );
      // The pages send no Referer, but OpenStreetMap refuses tiles without one:
      // send just this site's origin, and only for tiles.
      L.tileLayer(tiles.url, {
        attribution: tiles.attribution,
        maxZoom: 19,
        referrerPolicy: 'strict-origin',
      })
        .on('tileerror', () => setFailed(true))
        .addTo(m);
      map.current = { map: m, L, layer: L.layerGroup().addTo(m) };
      setReady(true);
    });
    return () => {
      cancelled = true;
      map.current?.map.remove();
      map.current = null;
    };
  }, [tiles.url, tiles.attribution]);

  // Redraw the trip whenever it changes (the driver moves, a place is chosen).
  const route = polyline ?? '';
  const key = JSON.stringify([pickup?.location, dropoff?.location, route, driver, driverStale]);
  useEffect(() => {
    const current = map.current;
    if (!ready || !current) return;
    const { map: m, L, layer } = current;
    layer.clearLayers();
    const decoded = route ? decodePolyline(route) : [];
    const line =
      decoded.length > 1 ? decoded : pickup && dropoff ? [pickup.location, dropoff.location] : [];
    if (line.length > 1)
      L.polyline(
        line.map((p) => [p.lat, p.lng] as [number, number]),
        {
          // SVG attributes cannot use var(): take the theme colour as it is now.
          color:
            getComputedStyle(document.documentElement).getPropertyValue('--c-primary').trim() ||
            '#0F2A43',
          weight: 5,
          opacity: 0.85,
          dashArray: decoded.length > 1 ? undefined : '10 8',
        },
      ).addTo(layer);
    if (pickup)
      L.marker([pickup.location.lat, pickup.location.lng], {
        icon: marker(L, 'pickup', t('map.pickup')),
        keyboard: false,
      }).addTo(layer);
    if (dropoff)
      L.marker([dropoff.location.lat, dropoff.location.lng], {
        icon: marker(L, 'dropoff', t('map.destination')),
        keyboard: false,
      }).addTo(layer);
    if (driver)
      L.marker([driver.lat, driver.lng], {
        icon: marker(L, 'driver', t('map.driver'), driverStale),
        keyboard: false,
      }).addTo(layer);

    const points: [number, number][] = [
      ...line.map((p) => [p.lat, p.lng] as [number, number]),
      ...(pickup ? [[pickup.location.lat, pickup.location.lng] as [number, number]] : []),
      ...(dropoff ? [[dropoff.location.lat, dropoff.location.lng] as [number, number]] : []),
      ...(driver ? [[driver.lat, driver.lng] as [number, number]] : []),
    ];
    if (points.length === 1) m.setView(points[0]!, 15);
    else if (points.length > 1)
      m.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
  }, [ready, key]);

  return (
    <figure className={`street-map${empty ? ' sketch-empty' : ''}`}>
      <div ref={ref} className="street-map-canvas" role="application" aria-label={t('map.label')} />
      {failed && <figcaption className="small muted">{t('map.tilesFailed')}</figcaption>}
    </figure>
  );
}
