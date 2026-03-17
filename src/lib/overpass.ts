// src/lib/overpass.ts

import type { Cafe, OverpassResponse } from "@/types";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// OSM bounding box for districts 5 (Margareten), 6 (Mariahilf), 7 (Neubau), 8 (Josefstadt)
export const VIENNA_BBOX = {
  south: 48.175,
  west: 16.333,
  north: 48.230,
  east: 16.375,
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
out body qt;
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

// Tags that identify a café-type element (as opposed to plain geometry nodes
// or entrance nodes that arrive in the response via `>; out body qt`)
function isCafeElement(tags: Record<string, string>): boolean {
  return (
    tags.amenity === "cafe" ||
    tags.shop === "coffee" ||
    (tags.amenity === "restaurant" &&
      /coffee_shop|kaffeehaus|cafe/i.test(tags.cuisine ?? ""))
  );
}

// For a Way polygon, find the midpoint of the edge that is farthest from the
// polygon's centroid.  This selects the building's most exterior face —
// typically the street-facing facade — without needing any road data.
function streetFacingPoint(
  nodeIds: number[],
  nodeCoords: Map<number, { lat: number; lon: number }>,
  centLat: number,
  centLon: number,
): { lat: number; lon: number } | null {
  const pts = nodeIds
    .map((id) => nodeCoords.get(id))
    .filter((p): p is { lat: number; lon: number } => p !== undefined);

  if (pts.length < 2) return null;

  let bestDist = -1;
  let best: { lat: number; lon: number } | null = null;

  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const midLat = (a.lat + b.lat) / 2;
    const midLon = (a.lon + b.lon) / 2;
    // Use degree-space distance (equirectangular, fine for <1 km)
    const dist = Math.hypot(midLat - centLat, midLon - centLon);
    if (dist > bestDist) {
      bestDist = dist;
      best = { lat: midLat, lon: midLon };
    }
  }

  return best;
}

function parseOverpassCafes(data: OverpassResponse): Cafe[] {
  // Build lookup tables from constituent nodes returned by `>; out body qt`.
  // These nodes have coordinates; entrance-tagged ones also carry tags.
  const nodeCoords = new Map<number, { lat: number; lon: number }>();
  const entranceNodes = new Set<number>();

  for (const el of data.elements) {
    if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) {
      nodeCoords.set(el.id, { lat: el.lat, lon: el.lon });
      if (el.tags?.entrance) entranceNodes.add(el.id);
    }
  }

  const seen = new Set<string>();

  return data.elements
    .filter((el) => {
      // Keep only real café-type elements (exclude plain geometry / entrance nodes)
      if (!el.tags || !isCafeElement(el.tags)) return false;
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
      // Start with OSM-provided position (node: direct coords; way: centroid)
      let lat = el.lat ?? el.center!.lat;
      let lon = el.lon ?? el.center!.lon;
      const tags = el.tags ?? {};

      // Refine position for Way elements:
      if (el.type === "way" && el.nodes?.length) {
        // Priority 1 — OSM entrance node (most precise: actual door position)
        const entranceId = el.nodes.find((id) => entranceNodes.has(id));
        if (entranceId) {
          const c = nodeCoords.get(entranceId);
          if (c) { lat = c.lat; lon = c.lon; }
        } else {
          // Priority 2 — midpoint of the most exterior building edge
          // (street-facing facade heuristic, no road data needed)
          const exterior = streetFacingPoint(el.nodes, nodeCoords, lat, lon);
          if (exterior) { lat = exterior.lat; lon = exterior.lon; }
        }
        // Priority 3 — fall through to centroid (already set above)
      }

      const district = guessDistrict(lat, lon);
      const name =
        tags.name ||
        tags["name:de"] ||
        tags["brand"] ||
        `${tags.amenity ?? "Café"} (unbenannt)`;

      const addr = [tags["addr:street"], tags["addr:housenumber"]]
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
