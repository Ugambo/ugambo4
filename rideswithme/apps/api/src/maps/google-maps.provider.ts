import type {
  Language,
  LatLng,
  Place,
  PlaceSuggestion,
  RouteSummary,
} from '@rideswithme/shared-types';
import { type AutocompleteOptions, type MapsProvider, MapsUnavailableError } from './maps.provider';

/**
 * Google Maps Platform: Places API (New) for search and details, Geocoding API
 * for reverse geocoding, Routes API for driving distance and time. The API key
 * stays on the server. Not exercised against the live APIs in development (no
 * key); verify with a real key before launch.
 */
export class GoogleMapsProvider implements MapsProvider {
  readonly name = 'google';

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly timeoutMs = 5_000,
  ) {}

  async autocomplete(query: string, o: AutocompleteOptions): Promise<PlaceSuggestion[]> {
    const body: Record<string, unknown> = {
      input: query,
      includedRegionCodes: ['ng'],
      languageCode: o.language,
      ...(o.sessionToken && { sessionToken: o.sessionToken }),
      ...(o.near && {
        locationBias: {
          circle: { center: { latitude: o.near.lat, longitude: o.near.lng }, radius: 30_000 },
        },
      }),
    };
    const res = await this.call<{
      suggestions?: {
        placePrediction?: {
          placeId: string;
          structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
          text?: { text: string };
        };
      }[];
    }>('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return (res.suggestions ?? []).flatMap((s) => {
      const p = s.placePrediction;
      if (!p) return [];
      return [
        {
          placeId: p.placeId,
          primaryText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
          secondaryText: p.structuredFormat?.secondaryText?.text ?? '',
        },
      ];
    });
  }

  async placeDetails(
    placeId: string,
    o: { language: Language; sessionToken?: string },
  ): Promise<Place | null> {
    const params = new URLSearchParams({
      languageCode: o.language,
      ...(o.sessionToken && { sessionToken: o.sessionToken }),
    });
    const res = await this.call<{
      id: string;
      displayName?: { text: string };
      formattedAddress?: string;
      location?: { latitude: number; longitude: number };
    }>(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?${params}`,
      { method: 'GET', fieldMask: 'id,displayName,formattedAddress,location' },
      true,
    );
    if (!res?.location) return null;
    return {
      placeId: res.id,
      name: res.displayName?.text ?? null,
      address: res.formattedAddress ?? res.displayName?.text ?? '',
      location: { lat: res.location.latitude, lng: res.location.longitude },
    };
  }

  async reverseGeocode(location: LatLng, language: Language): Promise<Place> {
    const params = new URLSearchParams({
      latlng: `${location.lat},${location.lng}`,
      language,
      key: this.apiKey,
    });
    const res = await this.call<{
      status: string;
      results?: { formatted_address: string; place_id: string }[];
    }>(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, {
      method: 'GET',
      keyInQuery: true,
    });
    const first = res.results?.[0];
    return {
      placeId: first?.place_id ?? null,
      address: first?.formatted_address ?? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`,
      location,
    };
  }

  async route(origin: LatLng, destination: LatLng): Promise<RouteSummary | null> {
    const res = await this.call<{
      routes?: {
        distanceMeters?: number;
        duration?: string;
        polyline?: { encodedPolyline?: string };
      }[];
    }>('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      fieldMask: 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: {
          location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
        },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        regionCode: 'ng',
      }),
    });
    const r = res.routes?.[0];
    if (!r || r.distanceMeters === undefined || !r.duration) return null;
    return {
      distanceMeters: r.distanceMeters,
      durationSeconds: Math.round(Number.parseFloat(r.duration)),
      polyline: r.polyline?.encodedPolyline ?? null,
    };
  }

  private async call<T>(
    url: string,
    o: { method: 'GET' | 'POST'; body?: string; fieldMask?: string; keyInQuery?: boolean },
    allowNotFound = false,
  ): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!o.keyInQuery) headers['X-Goog-Api-Key'] = this.apiKey;
    if (o.fieldMask) headers['X-Goog-FieldMask'] = o.fieldMask;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: o.method,
        headers,
        body: o.body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new MapsUnavailableError(`Google Maps request failed: ${(err as Error).message}`);
    }
    if (allowNotFound && res.status === 404) return null as T;
    if (!res.ok) throw new MapsUnavailableError(`Google Maps responded with HTTP ${res.status}`);
    return (await res.json()) as T;
  }
}
