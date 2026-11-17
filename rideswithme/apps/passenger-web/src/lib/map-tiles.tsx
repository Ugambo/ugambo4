'use client';

import { createContext, type ReactNode, useContext } from 'react';
import { DEFAULT_TILES, type MapTiles } from './map-defaults';

const TilesContext = createContext<MapTiles>(DEFAULT_TILES);

/** The tile server set in MAP_TILE_URL, passed from the server to the street maps. */
export function MapTilesProvider({ tiles, children }: { tiles: MapTiles; children: ReactNode }) {
  return <TilesContext.Provider value={tiles}>{children}</TilesContext.Provider>;
}

/** The tile server, never blank: falls back to OpenStreetMap. */
export function useMapTiles(): MapTiles {
  const t = useContext(TilesContext);
  return {
    url: t?.url || DEFAULT_TILES.url,
    attribution: t?.attribution || DEFAULT_TILES.attribution,
  };
}
