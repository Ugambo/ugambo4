import { type RawBuilder, sql } from 'kysely';
import type { LatLng } from '@rideswithme/shared-types';

/** A WGS84 point for a geography column. Note PostGIS order: longitude, latitude. */
export function point(p: LatLng): RawBuilder<string> {
  return sql<string>`ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography`;
}

/** Selects latitude and longitude of a geography point column as numbers. */
export function latOf(column: string) {
  return sql<number>`ST_Y(${sql.ref(column)}::geometry)`;
}
export function lngOf(column: string) {
  return sql<number>`ST_X(${sql.ref(column)}::geometry)`;
}

/** Great-circle distance in metres, for estimates where a road route is not needed. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Kobo stored as bigint (returned as a string) to a JS number, refusing anything unsafe. */
export function koboFromDb(value: string | number | bigint | null): number {
  const n = Number(value ?? 0);
  if (!Number.isSafeInteger(n)) throw new Error(`Unsafe kobo value from database: ${value}`);
  return n;
}
