import type {
  Language,
  LatLng,
  Place,
  PlaceSuggestion,
  RouteSummary,
} from '@rideswithme/shared-types';

export interface AutocompleteOptions {
  /** Prefer results near here (usually the user's position). */
  near?: LatLng;
  language: Language;
  /** Groups autocomplete and details calls into one billing session (Google). */
  sessionToken?: string;
}

/** Vendor-neutral maps interface. Results are always limited to Nigeria. */
export interface MapsProvider {
  readonly name: string;
  autocomplete(query: string, options: AutocompleteOptions): Promise<PlaceSuggestion[]>;
  placeDetails(
    placeId: string,
    options: { language: Language; sessionToken?: string },
  ): Promise<Place | null>;
  reverseGeocode(location: LatLng, language: Language): Promise<Place>;
  /** Driving route. Null when no route exists. */
  route(origin: LatLng, destination: LatLng): Promise<RouteSummary | null>;
}

export const MAPS_PROVIDER = Symbol('MAPS_PROVIDER');

export class MapsUnavailableError extends Error {}
