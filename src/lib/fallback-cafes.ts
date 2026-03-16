// src/lib/fallback-cafes.ts
// Used when Overpass API is temporarily unavailable

import type { Cafe } from "@/types";

// Only cafes in the 7th district (Neubau)
export const FALLBACK_CAFES: Cafe[] = [
  {
    id: "fallback-7",
    name: "Café Westend",
    lat: 48.1976,
    lng: 16.3387,
    address: "Mariahilfer Str. 128",
    district: "7. Bezirk",
    amenity: "cafe",
  },
  {
    id: "fallback-14",
    name: "Glacis Beisl",
    lat: 48.2045,
    lng: 16.3528,
    address: "Breite Gasse 4",
    district: "7. Bezirk",
    amenity: "cafe",
  },
];
