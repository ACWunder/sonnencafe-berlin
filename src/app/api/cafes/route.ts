// src/app/api/cafes/route.ts

import { NextResponse } from "next/server";
import { fetchCafesFromOverpass } from "@/lib/overpass";
import { FALLBACK_CAFES } from "@/lib/fallback-cafes";

// Simple in-memory cache for the API route
let cachedCafes: Awaited<ReturnType<typeof fetchCafesFromOverpass>> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // Serve from cache if still fresh
  if (cachedCafes && Date.now() - cacheTimestamp < CACHE_TTL) {
    return NextResponse.json({ cafes: cachedCafes, source: "cache" });
  }

  try {
    const cafes = await fetchCafesFromOverpass();

    if (cafes.length === 0) {
      return NextResponse.json({ cafes: FALLBACK_CAFES, source: "fallback" });
    }

    cachedCafes = cafes;
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
