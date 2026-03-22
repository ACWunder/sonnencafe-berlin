export const BERLIN_BOUNDS = {
  south: 52.450,
  west:  13.331,
  north: 52.564,
  east:  13.477,
} as const;

export const MAP_CENTER: [number, number] = [52.507, 13.404]; // center of 4 Berlin districts

export const DEFAULT_SUN_LOCATION = MAP_CENTER;

// Zoom level below which café markers are hidden
export const MIN_MARKER_ZOOM = 14;

// Zoom level below which building tiles are not loaded
export const MIN_BUILDING_ZOOM = 13;

// Tile dimensions for viewport-based building fetching
export const TILE_LAT = 0.04;
export const TILE_LNG = 0.06;

// Maximum number of building tiles kept in the LRU cache
export const MAX_TILE_CACHE = 20;
