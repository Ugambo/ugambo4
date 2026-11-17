import type {
  Language,
  LatLng,
  Place,
  PlaceSuggestion,
  RouteSummary,
} from '@rideswithme/shared-types';
import { encodePolyline } from '@rideswithme/utilities';
import { type AutocompleteOptions, type MapsProvider, MapsUnavailableError } from './maps.provider';

const BASE = 'https://api.geoapify.com';

interface GeoapifyResult {
  place_id?: string;
  name?: string;
  formatted?: string;
  address_line1?: string;
  address_line2?: string;
  lat: number;
  lon: number;
}

/**
 * Geoapify (OpenStreetMap data): search as you type, place details, reverse
 * geocoding and driving routes, with one key and no card on the free plan
 * (DECISIONS D-082). Results are limited to Nigeria and prefer places near the
 * user, or near `home` (the primary service area) when their position is not
 * known. The key stays on the server.
 */
export class GeoapifyMapsProvider implements MapsProvider {
  readonly name = 'geoapify';

  constructor(
    private readonly apiKey: string,
    private readonly home: LatLng,
    private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly timeoutMs = 5_000,
  ) {}

  async autocomplete(query: string, o: AutocompleteOptions): Promise<PlaceSuggestion[]> {
    const near = o.near ?? this.home;
    const res = await this.call<{ results?: GeoapifyResult[] }>('/v1/geocode/autocomplete', {
      text: query,
      filter: 'countrycode:ng',
      bias: `proximity:${near.lng},${near.lat}`,
      lang: o.language,
      limit: '6',
      format: 'json',
    });
    return (res.results ?? []).flatMap((r) =>
      r.place_id
        ? [
            {
              placeId: r.place_id,
              primaryText: r.address_line1 ?? r.name ?? r.formatted ?? '',
              secondaryText: r.address_line2 ?? '',
            },
          ]
        : [],
    );
  }

  async placeDetails(placeId: string, o: { language: Language }): Promise<Place | null> {
    const res = await this.call<{
      features?: { properties: GeoapifyResult }[];
    }>('/v2/place-details', { id: placeId, features: 'details', lang: o.language }, true);
    const p = res?.features?.[0]?.properties;
    if (!p || typeof p.lat !== 'number' || typeof p.lon !== 'number') return null;
    return {
      placeId,
      name: p.name ?? p.address_line1 ?? null,
      address: p.formatted ?? p.name ?? '',
      location: { lat: p.lat, lng: p.lon },
    };
  }

  async reverseGeocode(location: LatLng, language: Language): Promise<Place> {
    const res = await this.call<{ results?: GeoapifyResult[] }>('/v1/geocode/reverse', {
      lat: String(location.lat),
      lon: String(location.lng),
      lang: language,
      format: 'json',
    });
    const first = res.results?.[0];
    return {
      placeId: first?.place_id ?? null,
      address: first?.formatted ?? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`,
      location,
    };
  }

  async route(origin: LatLng, destination: LatLng): Promise<RouteSummary | null> {
    const res = await this.call<{
      features?: {
        properties?: { distance?: number; time?: number };
        geometry?: { type: string; coordinates: number[][][] | number[][] };
      }[];
    }>('/v1/routing', {
      waypoints: `${origin.lat},${origin.lng}|${destination.lat},${destination.lng}`,
      mode: 'drive',
    });
    const f = res.features?.[0];
    const distance = f?.properties?.distance;
    const time = f?.properties?.time;
    if (!f || distance === undefined || time === undefined) return null;
    // A MultiLineString (one line per leg) or a LineString, as [lon, lat] pairs.
    const g = f.geometry;
    const lines = !g
      ? []
      : g.type === 'MultiLineString'
        ? (g.coordinates as number[][][]).flat()
        : (g.coordinates as number[][]);
    const points = lines.map(([lng, lat]) => ({ lat: lat!, lng: lng! }));
    return {
      distanceMeters: Math.round(distance),
      durationSeconds: Math.round(time),
      polyline: points.length > 1 ? encodePolyline(points) : null,
    };
  }

  private async call<T>(
    path: string,
    params: Record<string, string>,
    allowNotFound = false,
  ): Promise<T> {
    const url = `${BASE}${path}?${new URLSearchParams({ ...params, apiKey: this.apiKey })}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (err) {
      throw new MapsUnavailableError(`Geoapify request failed: ${(err as Error).message}`);
    }
    if (allowNotFound && (res.status === 404 || res.status === 400)) return null as T;
    // Never put the URL in the error: it carries the key.
    if (!res.ok) throw new MapsUnavailableError(`Geoapify responded with HTTP ${res.status}`);
    return (await res.json()) as T;
  }
}
