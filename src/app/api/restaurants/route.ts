// src/app/api/restaurants/route.ts

import { NextResponse } from "next/server";
import { fetchRestaurantsFromOverpass } from "@/lib/overpass";

let cachedRestaurants: Awaited<ReturnType<typeof fetchRestaurantsFromOverpass>> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function GET() {
  if (cachedRestaurants && Date.now() - cacheTimestamp < CACHE_TTL) {
    return NextResponse.json({ restaurants: cachedRestaurants, source: "cache" });
  }

  try {
    const restaurants = await fetchRestaurantsFromOverpass();
    cachedRestaurants = restaurants;
    cacheTimestamp = Date.now();
    return NextResponse.json({ restaurants, source: "overpass" });
  } catch (error) {
    console.error("Overpass API error (restaurants):", error);
    return NextResponse.json({ restaurants: [], source: "error" }, { status: 200 });
  }
}
