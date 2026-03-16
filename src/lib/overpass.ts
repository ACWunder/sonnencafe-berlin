// src/lib/overpass.ts

import type { Cafe, OverpassResponse } from "@/types";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// OSM bounding box for districts 6 (Mariahilf), 7 (Neubau), 8 (Josefstadt)
export const VIENNA_BBOX = {
  south: 48.1883,
  west: 16.3369,
  north: 48.2154,
  east: 16.3660,
};

export const VIENNA_FULL_BBOX = VIENNA_BBOX;

export function buildOverpassQuery(): string {
  const bbox = `${VIENNA_FULL_BBOX.south},${VIENNA_FULL_BBOX.west},${VIENNA_FULL_BBOX.north},${VIENNA_FULL_BBOX.east}`;

  // Cast the net wide:
  // 1. amenity=cafe (standard)
  // 2. amenity=restaurant with a coffee/kaffeehaus cuisine tag
  // 3. shop=coffee (roasters / coffee bars)
  // Both node and way so area-mapped places are included.
  return `
[out:json][timeout:30];
(
  node["amenity"="cafe"](${bbox});
  way["amenity"="cafe"](${bbox});
  node["amenity"="restaurant"]["cuisine"~"coffee_shop|kaffeehaus|cafe",i](${bbox});
  way["amenity"="restaurant"]["cuisine"~"coffee_shop|kaffeehaus|cafe",i](${bbox});
  node["shop"="coffee"](${bbox});
  way["shop"="coffee"](${bbox});
);
out body;
>;
out skel qt;
  `.trim();
}

export async function fetchCafesFromOverpass(): Promise<Cafe[]> {
  const query = buildOverpassQuery();

  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    next: { revalidate: 3600 }, // Cache for 1 hour in Next.js
  });

  if (!response.ok) {
    throw new Error(`Overpass API error: ${response.status}`);
  }

  const data: OverpassResponse = await response.json();
  return parseOverpassCafes(data);
}

function parseOverpassCafes(data: OverpassResponse): Cafe[] {
  const seen = new Set<string>();

  return data.elements
    .filter((el) => {
      // Only elements that have tags (nodes from `>` have no tags)
      if (!el.tags) return false;
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      return lat !== undefined && lon !== undefined;
    })
    .filter((el) => {
      const key = `${el.type}-${el.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((el) => {
      const lat = el.lat ?? el.center!.lat;
      const lon = el.lon ?? el.center!.lon;
      const tags = el.tags ?? {};

      const district = guessDistrict(lat, lon);
      const name =
        tags.name ||
        tags["name:de"] ||
        tags["brand"] ||
        `${tags.amenity ?? "Café"} (unbenannt)`;

      const addr = [
        tags["addr:street"],
        tags["addr:housenumber"],
      ]
        .filter(Boolean)
        .join(" ");

      return {
        id: `${el.type}-${el.id}`,
        name,
        lat,
        lng: lon,
        address: addr || undefined,
        district,
        tags,
        amenity: tags.amenity,
      } satisfies Cafe;
    });
}

// Simple district lookup by lat/lng for Vienna's 1st–9th districts
function guessDistrict(lat: number, lng: number): string {
  // Rough bounding polygons – good enough for MVP display
  if (lat > 48.208 && lat < 48.218 && lng > 16.365 && lng < 16.385) return "1. Bezirk";
  if (lat > 48.198 && lat < 48.215 && lng > 16.348 && lng < 16.375) return "1./6./7. Bezirk";
  if (lat > 48.215 && lat < 48.235 && lng > 16.33 && lng < 16.37) return "8./9. Bezirk";
  if (lat > 48.195 && lat < 48.215 && lng > 16.375 && lng < 16.41) return "3. Bezirk";
  if (lat > 48.18 && lat < 48.205 && lng > 16.34 && lng < 16.37) return "5./6. Bezirk";
  if (lat > 48.205 && lat < 48.225 && lng > 16.31 && lng < 16.35) return "7./8. Bezirk";
  return "Wien";
}
