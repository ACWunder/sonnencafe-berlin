// src/lib/fallback-cafes.ts
// Used when Overpass API is temporarily unavailable

import type { Cafe } from "@/types";

// Known cafés in Berlin
export const FALLBACK_CAFES: Cafe[] = [
  {
    id: "fallback-1",
    name: "Bonanza Coffee Roasters",
    lat: 52.5338,
    lng: 13.4228,
    address: "Oderberger Str. 35",
    district: "Prenzlauer Berg",
    amenity: "cafe",
  },
  {
    id: "fallback-2",
    name: "Café am Neuen See",
    lat: 52.5141,
    lng: 13.3380,
    address: "Lichtensteinallee 2",
    district: "Mitte",
    amenity: "cafe",
  },
];
