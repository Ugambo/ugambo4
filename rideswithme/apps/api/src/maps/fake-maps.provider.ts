import type { LatLng, Place, PlaceSuggestion, RouteSummary } from '@rideswithme/shared-types';
import { encodePolyline } from '@rideswithme/utilities';
import { haversineMeters } from '../database/geo';
import type { AutocompleteOptions, MapsProvider } from './maps.provider';

/**
 * Offline stand-in for development and tests (no Google key, no network).
 * A small gazetteer of approximate demonstration places; routes are straight
 * lines stretched by a road factor at an urban average speed. Never used in
 * production (the config refuses it).
 */
const PLACES: { id: string; name: string; area: string; lat: number; lng: number }[] = [
  {
    id: 'kano-airport',
    name: 'Mallam Aminu Kano International Airport',
    area: 'Kano',
    lat: 12.0476,
    lng: 8.5246,
  },
  { id: 'kano-kurmi', name: 'Kurmi Market', area: 'Kano City, Kano', lat: 11.9906, lng: 8.5141 },
  {
    id: 'kano-sabon-gari',
    name: 'Sabon Gari Market',
    area: 'Fagge, Kano',
    lat: 12.0087,
    lng: 8.5296,
  },
  {
    id: 'kano-buk',
    name: 'Bayero University (New Campus)',
    area: 'Gwale, Kano',
    lat: 11.9766,
    lng: 8.4769,
  },
  { id: 'kano-emir', name: "Emir's Palace", area: 'Kano City, Kano', lat: 11.9898, lng: 8.5203 },
  {
    id: 'kano-zoo',
    name: 'Kano Zoological Garden',
    area: 'Nassarawa, Kano',
    lat: 11.9739,
    lng: 8.5492,
  },
  {
    id: 'katsina-market',
    name: 'Katsina Central Market',
    area: 'Katsina',
    lat: 12.9897,
    lng: 7.6022,
  },
  {
    id: 'katsina-umyu',
    name: "Umaru Musa Yar'adua University",
    area: 'Katsina',
    lat: 12.9636,
    lng: 7.6377,
  },
  {
    id: 'abuja-airport',
    name: 'Nnamdi Azikiwe International Airport',
    area: 'Abuja',
    lat: 9.0068,
    lng: 7.2632,
  },
  { id: 'abuja-wuse', name: 'Wuse Market', area: 'Wuse, Abuja', lat: 9.0702, lng: 7.4734 },
  {
    id: 'lagos-airport',
    name: 'Murtala Muhammed International Airport',
    area: 'Ikeja, Lagos',
    lat: 6.5774,
    lng: 3.3212,
  },
  { id: 'lagos-icm', name: 'Ikeja City Mall', area: 'Ikeja, Lagos', lat: 6.6142, lng: 3.3576 },
];

const ROAD_FACTOR = 1.35;
const AVERAGE_SPEED_MPS = 22_000 / 3600; // 22 km/h

export class FakeMapsProvider implements MapsProvider {
  readonly name = 'fake';

  async autocomplete(query: string, o: AutocompleteOptions): Promise<PlaceSuggestion[]> {
    const q = query.toLowerCase();
    return PLACES.filter((p) => `${p.name} ${p.area}`.toLowerCase().includes(q))
      .sort((a, b) => (o.near ? haversineMeters(o.near, a) - haversineMeters(o.near, b) : 0))
      .slice(0, 5)
      .map((p) => ({ placeId: `fake:${p.id}`, primaryText: p.name, secondaryText: p.area }));
  }

  async placeDetails(placeId: string): Promise<Place | null> {
    const p = PLACES.find((x) => `fake:${x.id}` === placeId);
    return p
      ? {
          placeId,
          name: p.name,
          address: `${p.name}, ${p.area}`,
          location: { lat: p.lat, lng: p.lng },
        }
      : null;
  }

  async reverseGeocode(location: LatLng): Promise<Place> {
    const nearest = [...PLACES].sort(
      (a, b) => haversineMeters(location, a) - haversineMeters(location, b),
    )[0]!;
    const near = haversineMeters(location, nearest) < 2_000 ? `Near ${nearest.name}, ` : '';
    return {
      placeId: null,
      address: `${near}${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`,
      location,
    };
  }

  async route(origin: LatLng, destination: LatLng): Promise<RouteSummary> {
    const distanceMeters = Math.round(haversineMeters(origin, destination) * ROAD_FACTOR);
    return {
      distanceMeters,
      durationSeconds: Math.round(distanceMeters / AVERAGE_SPEED_MPS) + 60,
      polyline: encodePolyline([origin, destination]),
    };
  }
}
