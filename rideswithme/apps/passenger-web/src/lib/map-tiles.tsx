'use client';

import { createContext, type ReactNode, useContext } from 'react';

export interface MapTiles {
  url: string;
  attribution: string;
}

/** OpenStreetMap's free tile server: fine for development and light use (DECISIONS D-081). */
export const DEFAULT_TILES: MapTiles = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© OpenStreetMap contributors',
};

const TilesContext = createContext<MapTiles>(DEFAULT_TILES);

/** The tile server set in MAP_TILE_URL, passed from the server to the street maps. */
export function MapTilesProvider({ tiles, children }: { tiles: MapTiles; children: ReactNode }) {
  return <TilesContext.Provider value={tiles}>{children}</TilesContext.Provider>;
}

export const useMapTiles = () => useContext(TilesContext);
