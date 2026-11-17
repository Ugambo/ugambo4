/**
 * Plain values (not a client module), so the server layout and the street map
 * both read the real defaults. A server component importing a non-component
 * value from a 'use client' file gets a reference stub instead of the value.
 */
export interface MapTiles {
  url: string;
  attribution: string;
}

/** OpenStreetMap's free tile server: fine for development and light use (DECISIONS D-081). */
export const DEFAULT_TILES: MapTiles = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© OpenStreetMap contributors',
};
