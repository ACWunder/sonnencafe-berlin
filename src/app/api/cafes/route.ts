// src/app/api/cafes/route.ts

import { NextResponse } from "next/server";
import { fetchCafesFromOverpass, VIENNA_BBOX } from "@/lib/overpass";
import { FALLBACK_CAFES } from "@/lib/fallback-cafes";

// Cache key includes bounds — invalidates automatically when VIENNA_BBOX changes
const CURRENT_BBOX_KEY = `${VIENNA_BBOX.south},${VIENNA_BBOX.west},${VIENNA_BBOX.north},${VIENNA_BBOX.east}`;
let cachedCafes: Awaited<ReturnType<typeof fetchCafesFromOverpass>> | null = null;
let cachedBboxKey = "";
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function GET(request: Request) {
  // Serve from cache only if bounds haven't changed and cache is still fresh
  if (cachedCafes && cachedBboxKey === CURRENT_BBOX_KEY && Date.now() - cacheTimestamp < CACHE_TTL) {
    return NextResponse.json({ cafes: cachedCafes, source: "cache" });
  }

  try {
    const cafes = await fetchCafesFromOverpass();

    if (cafes.length === 0) {
      return NextResponse.json({ cafes: FALLBACK_CAFES, source: "fallback" });
    }

    cachedCafes = cafes;
    cachedBboxKey = CURRENT_BBOX_KEY;
    cacheTimestamp = Date.now();

    return NextResponse.json({ cafes, source: "overpass" });
  } catch (error) {
    console.error("Overpass API error:", error);
    return NextResponse.json(
      { cafes: FALLBACK_CAFES, source: "fallback", error: "Overpass API unavailable, using fallback data" },
      { status: 200 } // still return 200 with fallback
    );
  }
}
