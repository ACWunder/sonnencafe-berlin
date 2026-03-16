// src/app/api/buildings/route.ts
import { NextRequest, NextResponse } from "next/server";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

export interface BuildingFeature {
  id: number;
  polygon: [number, number][]; // [lat, lng]
  height: number; // meters
}

/**
 * Try to assemble a closed ring from a list of way-node-arrays.
 * Ways may need to be reversed to form a continuous chain.
 * Returns the assembled [lat, lng] ring, or [] if assembly fails.
 */
function assembleRing(
  wayIds: number[],
  wayNodes: Map<number, number[]>,
  nodeCoords: Map<number, [number, number]>
): [number, number][] {
  if (wayIds.length === 0) return [];

  // Collect segments: each is an ordered list of node ids
  const segments: number[][] = wayIds
    .map((id) => wayNodes.get(id) ?? [])
    .filter((s) => s.length >= 2);

  if (segments.length === 0) return [];

  // Single-way case (most common)
  if (segments.length === 1) {
    return segments[0]
      .map((id) => nodeCoords.get(id))
      .filter(Boolean) as [number, number][];
  }

  // Multi-way case: chain segments into a single ring
  const ring: number[] = [...segments[0]];
  const remaining = segments.slice(1);

  for (let iter = 0; iter < remaining.length * 2; iter++) {
    const tail = ring[ring.length - 1];
    const idx = remaining.findIndex(
      (s) => s[0] === tail || s[s.length - 1] === tail
    );
    if (idx === -1) break;
    const seg = remaining.splice(idx, 1)[0];
    if (seg[0] === tail) {
      ring.push(...seg.slice(1));
    } else {
      ring.push(...seg.slice(0, -1).reverse());
    }
  }

  return ring
    .map((id) => nodeCoords.get(id))
    .filter(Boolean) as [number, number][];
}

const FALLBACK_HEIGHT = 18; // meters, used when no OSM height data available

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseHeight(tags: Record<string, any>): number {
  // 1. Explicit height tag (may have " m" suffix)
  if (tags?.height) {
    const h = parseFloat(String(tags.height));
    if (!isNaN(h) && h > 0) return h;
  }
  // 2. Number of floors × typical Vienna Gründerzeit floor height
  if (tags?.["building:levels"]) {
    const levels = parseFloat(String(tags["building:levels"]));
    if (!isNaN(levels) && levels > 0) return Math.round(levels * 3.2);
  }
  return FALLBACK_HEIGHT;
}

export async function GET(req: NextRequest) {
  const bbox = req.nextUrl.searchParams.get("bbox"); // "south,west,north,east"
  if (!bbox) return NextResponse.json({ error: "bbox required" }, { status: 400 });

  // Fetch both ways and relations with building tag.
  // The recursive descent (>) fetches all member ways + their nodes.
  const query = `
    [out:json][timeout:40];
    (
      way["building"](${bbox});
      relation["building"](${bbox});
    );
    out body;
    >;
    out skel qt;
  `;

  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      body: `data=${encodeURIComponent(query)}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) throw new Error(`Overpass error ${res.status}`);
    const data = await res.json();

    // node id → [lat, lng]
    const nodeCoords = new Map<number, [number, number]>();
    // way id → node id list
    const wayNodes = new Map<number, number[]>();

    for (const el of data.elements) {
      if (el.type === "node") {
        nodeCoords.set(el.id, [el.lat, el.lon]);
      } else if (el.type === "way") {
        wayNodes.set(el.id, el.nodes as number[]);
      }
    }

    const buildings: BuildingFeature[] = [];

    for (const el of data.elements) {
      // ── Simple way with building tag ──────────────────────────────────────
      if (el.type === "way" && el.tags?.building) {
        const polygon: [number, number][] = (el.nodes as number[])
          .map((id: number) => nodeCoords.get(id))
          .filter(Boolean) as [number, number][];

        if (polygon.length >= 3) {
          buildings.push({ id: el.id, polygon, height: parseHeight(el.tags)});
        }
        continue;
      }

      // ── Relation (multipolygon) with building tag ─────────────────────────
      if (el.type === "relation" && el.tags?.building) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const outerWayIds: number[] = (el.members as any[])
          .filter((m) => m.type === "way" && m.role === "outer")
          .map((m: { ref: number }) => m.ref);

        if (outerWayIds.length === 0) continue;

        const polygon = assembleRing(outerWayIds, wayNodes, nodeCoords);
        if (polygon.length >= 3) {
          buildings.push({ id: el.id, polygon, height: parseHeight(el.tags)});
        }
      }
    }

    return NextResponse.json({ buildings }, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e), buildings: [] }, { status: 500 });
  }
}
