'use client';

import type { LatLng, Place } from '@rideswithme/shared-types';
import { decodePolyline } from '@rideswithme/utilities';
import { useI18n } from '@/lib/i18n';

const W = 600;
const H = 360;
const PAD = 48;

/**
 * A to-scale sketch of the trip (pickup, destination, route and driver), drawn
 * without a map provider. Stands in for the street map until a Maps
 * JavaScript key is configured (see DECISIONS B-15).
 */
export function RouteSketch({
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
  const route = polyline ? decodePolyline(polyline) : [];
  const points: LatLng[] = [
    ...(pickup ? [pickup.location] : []),
    ...(dropoff ? [dropoff.location] : []),
    ...(driver ? [driver] : []),
    ...route,
  ];

  if (points.length === 0) {
    return <div className="sketch sketch-empty" aria-hidden />;
  }

  // Equirectangular projection, scaled so a kilometre is the same length both ways.
  const midLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const xs = points.map((p) => p.lng * kx);
  const ys = points.map((p) => p.lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 0.005);
  const scale = Math.min(
    (W - 2 * PAD) / Math.max(maxX - minX, span * 0.2),
    (H - 2 * PAD) / Math.max(maxY - minY, span * 0.2),
  );
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const project = (p: LatLng) => ({
    x: W / 2 + (p.lng * kx - cx) * scale,
    y: H / 2 - (p.lat - cy) * scale,
  });

  const line =
    route.length > 1 ? route : pickup && dropoff ? [pickup.location, dropoff.location] : [];
  const path = line
    .map(project)
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');

  return (
    <figure className="sketch">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('map.label')}>
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="var(--c-border)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#grid)" />
        {path && (
          <path
            d={path}
            fill="none"
            stroke="var(--c-primary)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={route.length > 1 ? undefined : '10 8'}
          />
        )}
        {pickup && (
          <Marker at={project(pickup.location)} colour="var(--c-success)" label={t('map.pickup')} />
        )}
        {dropoff && (
          <Marker
            at={project(dropoff.location)}
            colour="var(--c-primary)"
            label={t('map.destination')}
            square
          />
        )}
        {driver && (
          <g data-testid="sketch-driver" opacity={driverStale ? 0.5 : 1}>
            <circle
              cx={project(driver).x}
              cy={project(driver).y}
              r="12"
              fill="var(--c-accent)"
              stroke="#fff"
              strokeWidth="3"
            />
            <text x={project(driver).x + 16} y={project(driver).y + 24} className="sketch-label">
              {t('map.driver')}
            </text>
          </g>
        )}
      </svg>
      <figcaption className="small muted">{t('book.mapNote')}</figcaption>
    </figure>
  );
}

function Marker({
  at,
  colour,
  label,
  square = false,
}: {
  at: { x: number; y: number };
  colour: string;
  label: string;
  square?: boolean;
}) {
  return (
    <g>
      {square ? (
        <rect
          x={at.x - 9}
          y={at.y - 9}
          width="18"
          height="18"
          fill={colour}
          stroke="#fff"
          strokeWidth="3"
        />
      ) : (
        <circle cx={at.x} cy={at.y} r="9" fill={colour} stroke="#fff" strokeWidth="3" />
      )}
      <text x={at.x + 14} y={at.y - 10} className="sketch-label">
        {label}
      </text>
    </g>
  );
}
