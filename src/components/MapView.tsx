// src/components/MapView.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Cafe, TimeState, SunTimeline, SunTimelineData } from "@/types";
import { getSunPosition, getSunTimes } from "@/lib/sun";
import { calcShadowPolygon } from "@/lib/buildingShadow";
import type { BuildingFeature } from "@/app/api/buildings/route";

// ─── spatial grid for fast building lookups ───────────────────────────────────
// Indexes buildings by grid cell so nearby-building queries are O(1) instead of O(n).
const GRID_CELL = 0.004; // ~0.004° ≈ 440m per cell; shadow radius is ~200m

class BuildingGrid {
  private cells = new Map<string, BuildingFeature[]>();

  constructor(buildings: BuildingFeature[]) {
    for (const b of buildings) {
      const key = BuildingGrid.key(b.polygon[0][0], b.polygon[0][1]);
      let cell = this.cells.get(key);
      if (!cell) { cell = []; this.cells.set(key, cell); }
      cell.push(b);
    }
  }

  private static key(lat: number, lng: number): string {
    return `${Math.floor(lat / GRID_CELL)},${Math.floor(lng / GRID_CELL)}`;
  }

  getNearby(lat: number, lng: number): BuildingFeature[] {
    const result: BuildingFeature[] = [];
    const row = Math.floor(lat / GRID_CELL);
    const col = Math.floor(lng / GRID_CELL);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const bs = this.cells.get(`${row + dr},${col + dc}`);
        if (bs) result.push(...bs);
      }
    }
    return result;
  }
}

// ─── constants ────────────────────────────────────────────────────────────────

// Full Berlin area (used for map bounds / fallback)
const BERLIN_BOUNDS = {
  south: 52.4546381, west: 13.3362902,
  north: 52.5585856, east: 13.4721073,
} as const;

const BERLIN_CENTER: [number, number] = [
  (BERLIN_BOUNDS.south + BERLIN_BOUNDS.north) / 2,
  (BERLIN_BOUNDS.west  + BERLIN_BOUNDS.east)  / 2,
];

const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
const FALLBACK_HEIGHT = 18;
const _ZOOM16_PX = (Math.pow(2, 16) * 256) / 360; // px per degree at zoom 16

// Per-district config: shadow canvas bounds (with border buffer for accuracy),
// map fly-to center [lng, lat], and buildings file path.
type DistrictBounds = { south: number; west: number; north: number; east: number };
// Bounds are computed from the exact OSM district polygon bboxes + 0.005° buffer
// for shadow rendering accuracy at district edges. Centers are bbox midpoints.
const DISTRICT_CONFIG: Record<string, {
  bounds: DistrictBounds;
  center: [number, number]; // [lng, lat] for MapLibre
  file: string;
}> = {
  "Mitte": {
    bounds: { south: 52.499, west: 13.361, north: 52.545, east: 13.434 },
    center: [13.398, 52.522],
    file: "/buildings-mitte.json",
  },
  "Kreuzberg": {
    bounds: { south: 52.478, west: 13.363, north: 52.514, east: 13.458 },
    center: [13.411, 52.496],
    file: "/buildings-kreuzberg.json",
  },
  "Prenzlauer Berg": {
    bounds: { south: 52.515, west: 13.392, north: 52.564, east: 13.477 },
    center: [13.434, 52.539],
    file: "/buildings-prenzlauer-berg.json",
  },
  "Schöneberg": {
    bounds: { south: 52.450, west: 13.331, north: 52.510, east: 13.382 },
    center: [13.356, 52.480],
    file: "/buildings-schoeneberg.json",
  },
};

function shadowCanvasSize(b: DistrictBounds) {
  return {
    w: Math.ceil((b.east - b.west) * _ZOOM16_PX),
    h: Math.ceil((b.north - b.south) * _ZOOM16_PX),
  };
}

function shadowCoords(b: DistrictBounds): [[number,number],[number,number],[number,number],[number,number]] {
  return [
    [b.west, b.north], [b.east, b.north],
    [b.east, b.south], [b.west, b.south],
  ];
}

// ─── types ────────────────────────────────────────────────────────────────────

interface MapViewProps {
  timeState: TimeState;
  cafes: Cafe[];
  visibleCafeIds: Set<string>;
  selectedCafe: Cafe | null;
  onCafeSelect: (cafe: Cafe | null) => void;
  onSunRemaining: (data: Record<string, number | null>) => void;
  onSunTimeline: (data: SunTimelineData) => void;
  activeDistrict: string;
}

// ─── sun computation (unchanged) ─────────────────────────────────────────────

function calcSunRemaining(
  cafe: Cafe,
  currentDate: Date,
  buildings: BuildingFeature[],
): number | null {
  const STEP_MS   = 10 * 60 * 1000;
  const MAX_STEPS = 24;
  const OFFSET_M  = 10;
  const LAT_MAX   = 200 / 111_000;
  const LNG_MAX   = 200 / (111_000 * Math.cos((cafe.lat * Math.PI) / 180));

  // Hard cap: result can never exceed actual minutes until sunset
  const sunTimes = getSunTimes(cafe.lat, cafe.lng, currentDate);
  const minsUntilSunset = Math.max(0, Math.floor((sunTimes.sunset.getTime() - currentDate.getTime()) / 60_000));
  if (minsUntilSunset === 0) return null;

  const nearby = buildings.filter((b) => {
    const [bLat, bLng] = b.polygon[0];
    return Math.abs(bLat - cafe.lat) < LAT_MAX && Math.abs(bLng - cafe.lng) < LNG_MAX;
  });

  for (let step = 0; step <= MAX_STEPS; step++) {
    const date   = new Date(currentDate.getTime() + step * STEP_MS);
    const sunPos = getSunPosition(cafe.lat, cafe.lng, date);
    if (sunPos.altitudeDeg <= 0) return step === 0 ? null : Math.min((step - 1) * 10, minsUntilSunset);

    const azRad  = (sunPos.azimuthDeg * Math.PI) / 180;
    const dlat   = (OFFSET_M * Math.cos(azRad)) / 111_000;
    const dlng   = (OFFSET_M * Math.sin(azRad)) / (111_000 * Math.cos((cafe.lat * Math.PI) / 180));
    const chkLat = cafe.lat + dlat;
    const chkLng = cafe.lng + dlng;

    const inShadow = nearby.some((b) => {
      const poly = calcShadowPolygon(b.polygon, b.height ?? FALLBACK_HEIGHT, sunPos.altitudeDeg, sunPos.azimuthDeg);
      return poly.length >= 3 && pointInPolygon(chkLat, chkLng, poly);
    });
    if (inShadow) return step === 0 ? null : Math.min((step - 1) * 10, minsUntilSunset);
  }
  return Math.min(MAX_STEPS * 10, minsUntilSunset);
}

function calcDayTimeline(
  cafe: Cafe,
  date: Date,
  buildings: BuildingFeature[],
): SunTimeline {
  const INTERVAL_MIN = 20;
  const OFFSET_M     = 10;
  const LAT_MAX      = 200 / 111_000;
  const LNG_MAX      = 200 / (111_000 * Math.cos((cafe.lat * Math.PI) / 180));

  const nearby = buildings.filter((b) => {
    const [bLat, bLng] = b.polygon[0];
    return Math.abs(bLat - cafe.lat) < LAT_MAX && Math.abs(bLng - cafe.lng) < LNG_MAX;
  });

  const times       = getSunTimes(cafe.lat, cafe.lng, date);
  const startMinute = times.sunrise.getHours() * 60 + times.sunrise.getMinutes();
  const endMinute   = times.sunset.getHours()  * 60 + times.sunset.getMinutes();
  const inSun: boolean[] = [];

  for (let minute = startMinute; minute <= endMinute; minute += INTERVAL_MIN) {
    const slotDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(),
      Math.floor(minute / 60), minute % 60, 0, 0);
    const sunPos = getSunPosition(cafe.lat, cafe.lng, slotDate);
    if (sunPos.altitudeDeg <= 0) { inSun.push(false); continue; }

    const azRad  = (sunPos.azimuthDeg * Math.PI) / 180;
    const dlat   = (OFFSET_M * Math.cos(azRad)) / 111_000;
    const dlng   = (OFFSET_M * Math.sin(azRad)) / (111_000 * Math.cos((cafe.lat * Math.PI) / 180));
    const chkLat = cafe.lat + dlat;
    const chkLng = cafe.lng + dlng;

    const inShadow = nearby.some((b) => {
      const poly = calcShadowPolygon(b.polygon, b.height ?? FALLBACK_HEIGHT, sunPos.altitudeDeg, sunPos.azimuthDeg);
      return poly.length >= 3 && pointInPolygon(chkLat, chkLng, poly);
    });
    inSun.push(!inShadow);
  }

  return { inSun, startMinute, intervalMin: INTERVAL_MIN };
}

function pointInPolygon(lat: number, lng: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [lati, lngi] = poly[i];
    const [latj, lngj] = poly[j];
    if ((lngi > lng) !== (lngj > lng) &&
        lat < ((latj - lati) * (lng - lngi)) / (lngj - lngi) + lati) {
      inside = !inside;
    }
  }
  return inside;
}

// ─── shadow canvas renderer ───────────────────────────────────────────────────
// Draws all shadow polygons onto a single canvas with one ctx.fill() call.
// Because the entire path is filled at once, overlapping building shadows
// produce no opacity stacking — the result is a flat uniform dark layer.

function renderShadowCanvas(
  canvas: HTMLCanvasElement,
  allBuildings: BuildingFeature[],
  timeState: TimeState,
  bounds: DistrictBounds,
) {
  const ctx    = canvas.getContext("2d")!;
  const date   = new Date(`${timeState.date}T${timeState.time}:00`);
  const centerLat = (bounds.north + bounds.south) / 2;
  const centerLng = (bounds.west  + bounds.east)  / 2;
  const sunPos = getSunPosition(centerLat, centerLng, date);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#334155";

  if (sunPos.altitudeDeg <= 0) {
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const bW = bounds.east - bounds.west;
  const bH = bounds.north - bounds.south;

  ctx.beginPath();
  for (const b of allBuildings) {
    const shadow = calcShadowPolygon(
      b.polygon, b.height ?? FALLBACK_HEIGHT,
      sunPos.altitudeDeg, sunPos.azimuthDeg,
    );
    if (shadow.length < 3) continue;
    let first = true;
    for (const [lat, lng] of shadow as [number, number][]) {
      const x = (lng - bounds.west)  / bW * canvas.width;
      const y = (bounds.north - lat) / bH * canvas.height;
      if (first) { ctx.moveTo(x, y); first = false; }
      else         ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
  ctx.fill(); // single fill → union of all polygons, no opacity stacking
}

// Flip [lat, lng] polygon to GeoJSON [lng, lat] and close the ring
function polygonToGeoJSON(polygon: [number, number][]): number[][] {
  const ring = polygon.map(([lat, lng]) => [lng, lat]);
  if (ring.length > 0 &&
      (ring[0][0] !== ring[ring.length - 1][0] ||
       ring[0][1] !== ring[ring.length - 1][1])) {
    ring.push(ring[0]);
  }
  return ring;
}

// Load Twemoji sun PNG and add as map image; calls onReady when done.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadSunEmoji(map: any, onReady: () => void) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => { map.addImage("cafe-sunny", img); onReady(); };
  img.onerror = () => {
    // Fallback: plain orange circle
    const c = document.createElement("canvas"); c.width = 40; c.height = 40;
    const ctx = c.getContext("2d")!;
    ctx.beginPath(); ctx.arc(20, 20, 18, 0, Math.PI * 2);
    ctx.fillStyle = "#f59e0b"; ctx.fill();
    map.addImage("cafe-sunny", ctx.getImageData(0, 0, 40, 40), { pixelRatio: 2 });
    onReady();
  };
  img.src = "/sun-emoji.png";
}

// ─── component ────────────────────────────────────────────────────────────────

export function MapView({
  timeState, cafes, visibleCafeIds, selectedCafe, onCafeSelect, onSunRemaining, onSunTimeline,
  activeDistrict,
}: MapViewProps) {
  const mapRef         = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  const mapReadyRef    = useRef(false);  // true once map 'load' event fired

  const shadowCanvasRef    = useRef<HTMLCanvasElement | null>(null);
  const buildingGridRef    = useRef<BuildingGrid | null>(null);
  const shadowWorkerRef    = useRef<Worker | null>(null);
  const buildingCacheRef   = useRef<Map<number, BuildingFeature>>(new Map());
  // Persistent per-district building cache so district switches are instant after first load
  const districtBuildingCacheRef = useRef<Map<string, BuildingFeature[]>>(new Map());
  const sunGenRef          = useRef(0);
  const currentBoundsRef   = useRef<DistrictBounds>(DISTRICT_CONFIG["Mitte"].bounds);
  const activeDistrictRef  = useRef(activeDistrict);
  activeDistrictRef.current = activeDistrict;
  // true when the current selectedCafe change came from a map marker click
  // (not from the sidebar list) — used to skip zoom in the pan effect
  const selectFromMapRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const locationMarkerRef = useRef<any>(null);

  // Stable refs so event handlers always see current prop values
  const cafesRef          = useRef<Cafe[]>(cafes);
  cafesRef.current        = cafes;
  const visibleCafeIdsRef = useRef<Set<string>>(visibleCafeIds);
  visibleCafeIdsRef.current = visibleCafeIds;
  const selectedCafeRef   = useRef<Cafe | null>(selectedCafe);
  selectedCafeRef.current = selectedCafe;
  const onCafeSelectRef   = useRef(onCafeSelect);
  onCafeSelectRef.current = onCafeSelect;
  const onSunRemainingRef = useRef(onSunRemaining);
  onSunRemainingRef.current = onSunRemaining;
  const onSunTimelineRef  = useRef(onSunTimeline);
  onSunTimelineRef.current = onSunTimeline;
  const timeStateRef      = useRef(timeState);
  timeStateRef.current    = timeState;

  const [fetching,  setFetching]  = useState(false);
  const [locating,  setLocating]  = useState(false);

  // ── helpers ────────────────────────────────────────────────────────────────

  // Push updated café GeoJSON to the map source.
  // recomputeSunData = true → also kick off the heavy sun-remaining/timeline
  // computation in idle-time chunks (generation-guarded against stale runs).
  function updateCafesSource(recomputeSunData = true) {
    const map = mapInstanceRef.current;
    if (!map || !mapReadyRef.current) return;
    const source = map.getSource("cafes-source");
    if (!source) return;

    const ts     = timeStateRef.current;
    const date   = new Date(`${ts.date}T${ts.time}:00`);
    const sunPos = getSunPosition(BERLIN_CENTER[0], BERLIN_CENTER[1], date);
    const OFFSET_M = 10;
    const azRad  = (sunPos.azimuthDeg * Math.PI) / 180;
    const selId  = selectedCafeRef.current?.id ?? null;

    const allBuildings = Array.from(buildingCacheRef.current.values());

    // Only render cafés that are currently visible (active district + restaurant toggle).
    // cafesRef may contain all districts; visibleCafeIdsRef is the fast filter.
    const visibleCafes = cafesRef.current.filter((c) => visibleCafeIdsRef.current.has(c.id));

    // Only run shadow check for cafés visible in the current viewport.
    // Off-screen cafés are marked inShadow=true (dark dot) and get
    // corrected the next time the user pans them into view (moveend).
    const mapBounds = map.getBounds();
    const vp = mapBounds ? {
      south: mapBounds.getSouth() - 0.005,
      north: mapBounds.getNorth() + 0.005,
      west:  mapBounds.getWest()  - 0.005,
      east:  mapBounds.getEast()  + 0.005,
    } : null;

    const features = visibleCafes.map((cafe) => {
      const inViewport = !vp || (
        cafe.lat >= vp.south && cafe.lat <= vp.north &&
        cafe.lng >= vp.west  && cafe.lng <= vp.east
      );

      let chkLat = cafe.lat, chkLng = cafe.lng;
      if (sunPos.altitudeDeg > 0) {
        const dlat = (OFFSET_M * Math.cos(azRad)) / 111_000;
        const dlng = (OFFSET_M * Math.sin(azRad)) / (111_000 * Math.cos((cafe.lat * Math.PI) / 180));
        chkLat = cafe.lat + dlat;
        chkLng = cafe.lng + dlng;
      }

      let inShadow: boolean;
      if (!inViewport || sunPos.altitudeDeg <= 0) {
        inShadow = true;
      } else {
        const LAT_MAX = 200 / 111_000;
        const LNG_MAX = 200 / (111_000 * Math.cos((cafe.lat * Math.PI) / 180));
        const nearby = buildingGridRef.current
          ? buildingGridRef.current.getNearby(cafe.lat, cafe.lng)
          : allBuildings.filter((b) => {
              const [bLat, bLng] = b.polygon[0];
              return Math.abs(bLat - cafe.lat) < LAT_MAX && Math.abs(bLng - cafe.lng) < LNG_MAX;
            });
        inShadow = nearby.some((b) => {
          const poly = calcShadowPolygon(b.polygon, b.height ?? FALLBACK_HEIGHT, sunPos.altitudeDeg, sunPos.azimuthDeg);
          return poly.length >= 3 && pointInPolygon(chkLat, chkLng, poly);
        });
      }

      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [cafe.lng, cafe.lat] },
        properties: { id: cafe.id, name: cafe.name, inShadow, isSelected: cafe.id === selId },
      };
    });

    source.setData({ type: "FeatureCollection", features });

    if (!recomputeSunData) return;

    // Heavy computation: sun-remaining + day timeline for all cafés.
    // Uses requestIdleCallback so chunks only run when the browser is idle,
    // keeping map gestures smooth. Generation counter cancels stale runs.
    // Prioritise visible cafés first; out-of-viewport cafés are appended at end.
    const buildings   = Array.from(buildingCacheRef.current.values());
    const currentDate = new Date(`${ts.date}T${ts.time}:00`);
    const dayDate     = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 12, 0, 0);
    const chunkBounds = map.getBounds();
    const chunkVp = chunkBounds ? {
      south: chunkBounds.getSouth() - 0.02,
      north: chunkBounds.getNorth() + 0.02,
      west:  chunkBounds.getWest()  - 0.02,
      east:  chunkBounds.getEast()  + 0.02,
    } : null;
    // Only compute sun data for currently visible cafes (active district + toggle).
    // Viewport-visible ones first so the sidebar updates quickly.
    const visCafes = cafesRef.current.filter((c) => visibleCafeIdsRef.current.has(c.id));
    const visible = visCafes.filter((c) => !chunkVp || (
      c.lat >= chunkVp.south && c.lat <= chunkVp.north &&
      c.lng >= chunkVp.west  && c.lng <= chunkVp.east
    ));
    const offscreen = visCafes.filter((c) => chunkVp && !(
      c.lat >= chunkVp.south && c.lat <= chunkVp.north &&
      c.lng >= chunkVp.west  && c.lng <= chunkVp.east
    ));
    const allCafes = [...visible, ...offscreen];
    const remaining: Record<string, number | null> = {};
    const timelines: SunTimelineData = {};
    const CHUNK = 15;
    let idx = 0;
    const gen = ++sunGenRef.current;

    const schedule = (fn: () => void) =>
      typeof requestIdleCallback !== "undefined"
        ? requestIdleCallback(fn, { timeout: 3000 })
        : setTimeout(fn, 16);

    function processChunk() {
      if (sunGenRef.current !== gen) return;
      const end = Math.min(idx + CHUNK, allCafes.length);
      for (; idx < end; idx++) {
        const cafe = allCafes[idx];
        const nearbyForCafe = buildingGridRef.current?.getNearby(cafe.lat, cafe.lng) ?? buildings;
        remaining[cafe.id] = calcSunRemaining(cafe, currentDate, nearbyForCafe);
        timelines[cafe.id] = calcDayTimeline(cafe, dayDate, nearbyForCafe);
      }
      if (idx < allCafes.length) {
        schedule(processChunk);
      } else {
        onSunRemainingRef.current(remaining);
        onSunTimelineRef.current(timelines);
        // Sync dot colors with the accurate calcSunRemaining result
        const source = mapInstanceRef.current?.getSource("cafes-source");
        if (source && mapReadyRef.current) {
          const selId = selectedCafeRef.current?.id ?? null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (source as any).setData({
            type: "FeatureCollection",
            features: visCafes.map((cafe) => ({
              type: "Feature",
              geometry: { type: "Point", coordinates: [cafe.lng, cafe.lat] },
              properties: {
                id: cafe.id, name: cafe.name,
                inShadow: remaining[cafe.id] === null,
                isSelected: cafe.id === selId,
              },
            })),
          });
        }
      }
    }
    schedule(processChunk);
  }

  // Render shadow canvas and push it to the MapLibre image source.
  function updateShadowSource(allBuildings: BuildingFeature[], ts: TimeState) {
    const canvas = shadowCanvasRef.current;
    const map    = mapInstanceRef.current;
    if (!canvas || !map || !mapReadyRef.current) return;
    const bounds = currentBoundsRef.current;

    if (shadowWorkerRef.current) {
      // Offload rendering to worker — result comes back via worker.onmessage
      shadowWorkerRef.current.postMessage({
        type: 'render',
        timeState: ts,
        bounds,
        width: canvas.width,
        height: canvas.height,
      });
      return;
    }

    // Fallback: render synchronously on main thread
    renderShadowCanvas(canvas, allBuildings, ts, bounds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const source = map.getSource("shadow-source") as any;
    source?.updateImage({ url: canvas.toDataURL("image/png"), coordinates: shadowCoords(bounds) });
  }

  // Update café dot colors after pan/zoom. Shadow check uses per-café nearby buildings.
  function refreshViewportShadows() {
    updateCafesSource(false);
  }

  function applyDistrictBuildings(district: string, buildings: BuildingFeature[]) {
    const config = DISTRICT_CONFIG[district];
    if (!config) return;

    const { w, h } = shadowCanvasSize(config.bounds);
    const canvas = shadowCanvasRef.current;
    if (canvas) { canvas.width = w; canvas.height = h; }
    currentBoundsRef.current = config.bounds;
    sunGenRef.current++;

    buildingCacheRef.current.clear();
    buildings.forEach((b) => buildingCacheRef.current.set(b.id, b));
    buildingGridRef.current = new BuildingGrid(buildings);

    // Send buildings to shadow worker so it has them ready for render calls
    shadowWorkerRef.current?.postMessage({ type: 'init', buildings });

    const map = mapInstanceRef.current;
    if (!map || !mapReadyRef.current) return;

    const source = map.getSource("buildings-source");
    if (source) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (source as any).setData({
        type: "FeatureCollection",
        features: buildings.map((b) => ({
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [polygonToGeoJSON(b.polygon as [number,number][])] },
          properties: { id: b.id },
        })),
      });
    }

    updateShadowSource(buildings, timeStateRef.current);
    updateCafesSource(true);
    setFetching(false);
  }

  function loadDistrictBuildings(district: string) {
    const config = DISTRICT_CONFIG[district];
    if (!config) return;

    // If already cached, apply instantly — no network fetch needed
    const cached = districtBuildingCacheRef.current.get(district);
    if (cached) {
      applyDistrictBuildings(district, cached);
      return;
    }

    setFetching(true);
    fetch(config.file)
      .then((r) => r.json())
      .then(({ buildings }: { buildings: BuildingFeature[] }) => {
        districtBuildingCacheRef.current.set(district, buildings);
        if (activeDistrictRef.current === district) {
          applyDistrictBuildings(district, buildings);
        }
      })
      .catch(() => setFetching(false));
  }

  function prefetchDistrictBuildings(district: string) {
    if (districtBuildingCacheRef.current.has(district)) return;
    const config = DISTRICT_CONFIG[district];
    if (!config) return;
    fetch(config.file)
      .then((r) => r.json())
      .then(({ buildings }: { buildings: BuildingFeature[] }) => {
        districtBuildingCacheRef.current.set(district, buildings);
      })
      .catch(() => {});
  }

  function loadGreenAreas() {
    fetch("/green-areas-cache.json")
      .then((r) => r.json())
      .then(({ areas }: { areas: { id: number; polygon: [number, number][] }[] }) => {
        const map = mapInstanceRef.current;
        if (!map || !mapReadyRef.current) return;
        const source = map.getSource("green-areas-source");
        if (!source) return;
        source.setData({
          type: "FeatureCollection",
          features: areas.map((a) => ({
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [polygonToGeoJSON(a.polygon)] },
            properties: { id: a.id },
          })),
        });
      })
      .catch(() => {});
  }

  // ── init map once ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    let mounted = true;

    // Create shadow worker
    const worker = typeof window !== 'undefined'
      ? new Worker(new URL('../workers/shadow.worker.ts', import.meta.url))
      : null;
    shadowWorkerRef.current = worker;

    if (worker) {
      worker.onmessage = (e: MessageEvent) => {
        if (e.data.type !== 'rendered') return;
        const bitmap: ImageBitmap = e.data.bitmap;
        const canvas = shadowCanvasRef.current;
        const map = mapInstanceRef.current;
        if (!canvas || !map || !mapReadyRef.current) { bitmap.close(); return; }
        const ctx = canvas.getContext('2d');
        if (!ctx) { bitmap.close(); return; }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const source = map.getSource('shadow-source') as any;
        source?.updateImage({ url: canvas.toDataURL('image/png'), coordinates: shadowCoords(currentBoundsRef.current) });
      };
    }

    import("maplibre-gl").then((maplibregl) => {
      if (!mounted || !mapRef.current || mapInstanceRef.current) return;

      const map = new maplibregl.Map({
        container: mapRef.current,
        style: MAP_STYLE,
        center: DISTRICT_CONFIG[activeDistrictRef.current]?.center ?? [13.397, 52.520], // [lng, lat]
        zoom: 14,
        minZoom: 10,
        maxZoom: 19,
        attributionControl: false,
      });

      mapInstanceRef.current = map;

      map.on("load", () => {
        if (!mounted) return;
        mapReadyRef.current = true;

        // Find the first symbol layer in the base style (road/place labels, icons).
        // All our custom layers are inserted before it so labels always render on top.
        const firstSymbolId = map.getStyle().layers.find(
          (l: { type: string }) => l.type === "symbol"
        )?.id;
        const before = firstSymbolId; // undefined is fine — appends to end if no symbols

        // ── filter place labels ────────────────────────────────────────────
        // In OpenFreeMap positron, "label_other" is a catch-all that renders
        // every place class not explicitly listed (city/country/state/town/village).
        // That includes both "suburb" (= official Bezirke, keep) and
        // "neighbourhood"/"quarter" (= Grätzl like Strozziggrund, hide).
        // We replace the filter with the same match expression but add the
        // unwanted classes to the exclusion list.
        map.setFilter("label_other", [
          "match", ["get", "class"],
          ["city", "continent", "country", "hamlet", "isolated_dwelling",
           "neighbourhood", "quarter", "state", "town", "village"],
          false,
          true,
        ]);

        // ── shadow canvas — sized for the initial district (Mitte) ────────

        const initBounds = DISTRICT_CONFIG[activeDistrictRef.current]?.bounds
          ?? DISTRICT_CONFIG["Mitte"].bounds;
        const { w: initW, h: initH } = shadowCanvasSize(initBounds);
        currentBoundsRef.current = initBounds;

        const shadowCanvas = document.createElement("canvas");
        shadowCanvas.width  = initW;
        shadowCanvas.height = initH;
        shadowCanvasRef.current = shadowCanvas;

        // ── sources ────────────────────────────────────────────────────────

        map.addSource("green-areas-source", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        // Static sunny-district overlay (amber rectangle over full Berlin area)
        map.addSource("sunny-overlay-source", {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [[
                [BERLIN_BOUNDS.west,  BERLIN_BOUNDS.south],
                [BERLIN_BOUNDS.east,  BERLIN_BOUNDS.south],
                [BERLIN_BOUNDS.east,  BERLIN_BOUNDS.north],
                [BERLIN_BOUNDS.west,  BERLIN_BOUNDS.north],
                [BERLIN_BOUNDS.west,  BERLIN_BOUNDS.south],
              ]],
            },
            properties: {},
          },
        });

        // Shadow source: raster image from the offscreen canvas.
        // Image sources avoid WebGL fill-opacity accumulation from overlapping polygons.
        map.addSource("shadow-source", {
          type: "image",
          url: shadowCanvas.toDataURL("image/png"), // blank initially
          coordinates: shadowCoords(initBounds),
        });

        map.addSource("buildings-source", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addSource("cafes-source", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        // ── layers (z-order: bottom → top, all inserted before base labels) ─

        map.addLayer({
          id: "green-areas",
          type: "fill",
          source: "green-areas-source",
          paint: { "fill-color": "#86efac", "fill-opacity": 0.55 },
        }, before);

        map.addLayer({
          id: "sunny-overlay",
          type: "fill",
          source: "sunny-overlay-source",
          paint: { "fill-color": "#fde68a", "fill-opacity": 0.38 },
        }, before);

        // Raster shadow layer — opacity here is the only transparency applied;
        // the canvas itself is fully opaque dark pixels on transparent background.
        // raster-resampling: nearest prevents bilinear blur when zoomed in past
        // the canvas resolution, keeping shadow edges crisp at all zoom levels.
        map.addLayer({
          id: "shadows",
          type: "raster",
          source: "shadow-source",
          paint: { "raster-opacity": 0.55 },
        }, before);

        map.addLayer({
          id: "buildings-fill",
          type: "fill",
          source: "buildings-source",
          paint: { "fill-color": "#e2e8f0", "fill-opacity": 1.0 },
        }, before);

        map.addLayer({
          id: "buildings-outline",
          type: "line",
          source: "buildings-source",
          paint: { "line-color": "#94a3b8", "line-width": 0.8 },
        }, before);

        // Shade cafés — circle layer, always visible
        map.addLayer({
          id: "cafes",
          type: "circle",
          source: "cafes-source",
          filter: ["==", ["get", "inShadow"], true],
          paint: {
            "circle-radius": [
              "interpolate", ["linear"], ["zoom"],
              13, ["case", ["get", "isSelected"], 8, 5],
              16, ["case", ["get", "isSelected"], 10, 6],
              17, ["case", ["get", "isSelected"], 11, 7],
            ],
            "circle-color": "#374151",
            "circle-stroke-width": ["case", ["get", "isSelected"], 2.5, 1.5],
            "circle-stroke-color": "#ffffff",
          },
        }, before);

        // Sunny cafés — ☀️ emoji loaded from Twemoji PNG
        loadSunEmoji(map, () => {
          if (!mapReadyRef.current) return;
          map.addLayer({
            id: "cafes-sunny",
            type: "symbol",
            source: "cafes-source",
            filter: ["==", ["get", "inShadow"], false],
            layout: {
              "icon-image": "cafe-sunny",
              "icon-size": [
                "interpolate", ["linear"], ["zoom"],
                12, ["case", ["get", "isSelected"], 0.19, 0.13],
                14, ["case", ["get", "isSelected"], 0.25, 0.17],
                16, ["case", ["get", "isSelected"], 0.31, 0.22],
                18, ["case", ["get", "isSelected"], 0.38, 0.26],
              ],
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
              "icon-anchor": "center",
            },
          }, before);
        });

        // Invisible 32 px hit area so cafés are easy to tap on mobile
        map.addLayer({
          id: "cafes-hit",
          type: "circle",
          source: "cafes-source",
          paint: {
            "circle-radius": 16,
            "circle-opacity": 0,
            "circle-stroke-opacity": 0,
          },
        }, before);

        // ── interactions ──────────────────────────────────────────────────

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.on("click", "cafes-hit", (e: any) => {
          if (!e.features?.length) return;
          const id = e.features[0].properties?.id;
          const cafe = cafesRef.current.find((c) => c.id === id);
          if (cafe) {
            e.originalEvent.stopPropagation();
            selectFromMapRef.current = true;
            onCafeSelectRef.current(cafe);
          }
        });

        map.on("mouseenter", "cafes-hit", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "cafes-hit", () => {
          map.getCanvas().style.cursor = "";
        });

        // ── viewport events ───────────────────────────────────────────────

        // Recompute viewport shadows and redraw café dots after any pan/zoom.
        // Shadow visual layer needs no repositioning — MapLibre handles that.
        map.on("moveend", () => {
          refreshViewportShadows();
        });

        // ── load data ─────────────────────────────────────────────────────

        loadDistrictBuildings(activeDistrictRef.current);
        loadGreenAreas();

        // Pre-fetch all other district building files in the background
        // so switching districts later is instant (no network wait).
        Object.keys(DISTRICT_CONFIG).forEach((d) => {
          if (d !== activeDistrictRef.current) prefetchDistrictBuildings(d);
        });
      });
    });

    return () => {
      mounted = false;
      mapReadyRef.current = false;
      shadowWorkerRef.current?.terminate();
      shadowWorkerRef.current = null;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── redraw when time changes ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReadyRef.current) return;
    const all = Array.from(buildingCacheRef.current.values());
    if (all.length === 0) return;

    // Rebuild full visual shadow layer
    updateShadowSource(all, timeState);

    updateCafesSource(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeState]);

  // ── redraw when café list changes ─────────────────────────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current || !mapReadyRef.current) return;
    updateCafesSource(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cafes]);

  // ── instant dot update when visible set changes (district / restaurant toggle) ─
  useEffect(() => {
    if (!mapInstanceRef.current || !mapReadyRef.current) return;
    updateCafesSource(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCafeIds]);

  // ── redraw dots when selection changes ────────────────────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current || !mapReadyRef.current) return;
    updateCafesSource(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCafe]);

  // ── pan/zoom to selected café ─────────────────────────────────────────────
  useEffect(() => {
    if (!selectedCafe || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const fromMap = selectFromMapRef.current;
    selectFromMapRef.current = false;
    map.easeTo({
      center: [selectedCafe.lng, selectedCafe.lat],
      // Map clicks keep current zoom; list selections zoom to 18
      zoom: fromMap ? map.getZoom() : 15,
      duration: 500,
    });
  }, [selectedCafe]);

  // ── reload buildings when district changes ────────────────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current || !mapReadyRef.current) return;
    const config = DISTRICT_CONFIG[activeDistrict];
    // Skip the generic district flyTo when a specific café is already selected
    // (happens on cross-district café clicks: selectedCafe effect handles panning).
    if (config && !selectedCafeRef.current) {
      mapInstanceRef.current.flyTo({ center: config.center, zoom: 16, duration: 800 });
    }
    loadDistrictBuildings(activeDistrict);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDistrict]);

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full relative">
      <div ref={mapRef} className="w-full h-full" />

      {fetching && (
        <div className="absolute top-3 left-14 z-[1000] bg-white/80 backdrop-blur-xl rounded-2xl border border-zinc-100 shadow-lg shadow-zinc-200/30 px-3.5 py-2 flex items-center gap-2 font-body text-zinc-500" style={{ fontSize: "12px" }}>
          <div className="w-3 h-3 border-[1.5px] border-amber-400 border-t-transparent rounded-full animate-spin" />
          Gebäude laden…
        </div>
      )}

      {/* Locate button */}
      <button
        onClick={() => {
          if (!mapInstanceRef.current) return;
          setLocating(true);
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setLocating(false);
              import("maplibre-gl").then((maplibregl) => {
                const map = mapInstanceRef.current;
                if (!map) return;
                const { latitude: lat, longitude: lng } = pos.coords;

                locationMarkerRef.current?.remove();

                const el = document.createElement("div");
                el.style.cssText = [
                  "width:18px;height:18px;border-radius:50%;",
                  "background:#3b82f6;border:2.5px solid white;",
                  "box-shadow:0 0 0 4px rgba(59,130,246,0.25);",
                  "animation:locationPulse 2s ease-in-out infinite;",
                ].join("");

                locationMarkerRef.current = new maplibregl.Marker({ element: el })
                  .setLngLat([lng, lat])
                  .addTo(map);

                map.easeTo({ center: [lng, lat], duration: 600 });
              });
            },
            () => setLocating(false),
            { enableHighAccuracy: true, timeout: 8000 },
          );
        }}
        className="absolute top-[6.25rem] left-3 z-[500] w-9 h-9 bg-white/90 backdrop-blur-xl rounded-2xl border border-zinc-100 shadow-lg shadow-zinc-200/40 flex items-center justify-center active:scale-95 transition-all"
        title="Meinen Standort anzeigen"
      >
        {locating ? (
          <div className="w-4 h-4 border-[1.5px] border-blue-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            <circle cx="12" cy="12" r="8" strokeOpacity="0.3" />
          </svg>
        )}
      </button>

      {/* Legend + compass stacked bottom-left */}
      <div className="absolute z-[500] flex flex-col gap-2 items-start" style={{ bottom: "24px", left: "12px" }}>
        <SunCompass
          timeState={timeState}
          onNorth={() => mapInstanceRef.current?.easeTo({ bearing: 0, duration: 600 })}
        />
        <Legend />
      </div>
      <SunInfoOverlay timeState={timeState} />
    </div>
  );
}

// ─── legend ───────────────────────────────────────────────────────────────────
function Legend() {
  return (
    <div className="bg-white/90 backdrop-blur-xl rounded-2xl border border-zinc-100 shadow-lg shadow-zinc-200/40 p-3">
      <div className="text-zinc-400 font-body uppercase tracking-widest mb-2" style={{ fontSize: "8px", fontWeight: 700, letterSpacing: "0.1em" }}>
        Legende
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <div style={{ width: 12, height: 12, borderRadius: 4, background: "#fde68a", border: "1.5px solid #f59e0b" }} />
        <span className="font-body text-zinc-600" style={{ fontSize: "11px" }}>Sonnig</span>
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <div style={{ width: 12, height: 12, borderRadius: 4, background: "#334155", opacity: 0.65 }} />
        <span className="font-body text-zinc-600" style={{ fontSize: "11px" }}>Schatten</span>
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <div style={{ width: 12, height: 12, borderRadius: 4, background: "#e2e8f0", border: "1.5px solid #cbd5e1" }} />
        <span className="font-body text-zinc-600" style={{ fontSize: "11px" }}>Gebäude</span>
      </div>
      <div className="flex items-center gap-2">
        <div style={{ width: 12, height: 12, borderRadius: 4, background: "#86efac" }} />
        <span className="font-body text-zinc-600" style={{ fontSize: "11px" }}>Grünfläche</span>
      </div>
    </div>
  );
}

// ─── sun compass ──────────────────────────────────────────────────────────────
function SunCompass({ timeState, onNorth }: { timeState: TimeState; onNorth?: () => void }) {
  const date = new Date(`${timeState.date}T${timeState.time}:00`);
  const pos  = getSunPosition(BERLIN_CENTER[0], BERLIN_CENTER[1], date);
  const isUp = pos.altitudeDeg > 0;

  const size         = 52;
  const r            = size / 2;
  const pad          = 10;
  const innerR       = r - pad;
  const distFraction = isUp ? Math.max(0, 1 - pos.altitudeDeg / 90) : 1.0;
  const azRad        = (pos.azimuthDeg * Math.PI) / 180;
  const sx           = r + distFraction * innerR * Math.sin(azRad);
  const sy           = r - distFraction * innerR * Math.cos(azRad);

  return (
    <div
      onClick={onNorth}
      className="bg-white/90 backdrop-blur-xl rounded-2xl border border-zinc-100 shadow-lg shadow-zinc-200/40 p-2 inline-flex cursor-pointer hover:border-zinc-200 active:scale-95 transition-transform"
      title="Karte nach Norden ausrichten"
    >
      <svg width={size} height={size}>
        <defs>
          <radialGradient id="skyGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#bfdbfe" />
            <stop offset="100%" stopColor="#dbeafe" />
          </radialGradient>
        </defs>
        <circle cx={r} cy={r} r={innerR} fill="url(#skyGrad)" stroke="#93c5fd" strokeWidth="1" />
        <circle cx={r} cy={r} r={innerR * 0.67} fill="none" stroke="#93c5fd" strokeWidth="0.5" strokeDasharray="3,3" />
        <line x1={r} y1={pad / 2} x2={r} y2={size - pad / 2} stroke="#bfdbfe" strokeWidth="0.5" />
        <line x1={pad / 2} y1={r} x2={size - pad / 2} y2={r} stroke="#bfdbfe" strokeWidth="0.5" />
        <text x={r} y={5}          textAnchor="middle" fontSize="5" fill="#64748b" fontFamily="Figtree, sans-serif" fontWeight="600">N</text>
        <text x={r} y={size - 1}   textAnchor="middle" fontSize="5" fill="#64748b" fontFamily="Figtree, sans-serif" fontWeight="600">S</text>
        <text x={3}          y={r + 2} textAnchor="middle" fontSize="5" fill="#64748b" fontFamily="Figtree, sans-serif" fontWeight="600">W</text>
        <text x={size - 3}   y={r + 2} textAnchor="middle" fontSize="5" fill="#64748b" fontFamily="Figtree, sans-serif" fontWeight="600">O</text>
        {isUp ? (
          <>
            <circle cx={sx} cy={sy} r={5} fill="#fde68a" opacity="0.5" />
            <circle cx={sx} cy={sy} r={3} fill="#fbbf24" stroke="#f59e0b" strokeWidth="1" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
              const rad = (angle * Math.PI) / 180;
              return (
                <line
                  key={angle}
                  x1={sx + 4 * Math.cos(rad)} y1={sy + 4 * Math.sin(rad)}
                  x2={sx + 6 * Math.cos(rad)} y2={sy + 6 * Math.sin(rad)}
                  stroke="#f59e0b" strokeWidth="1" strokeLinecap="round"
                />
              );
            })}
          </>
        ) : (
          <text x={r} y={r + 5} textAnchor="middle" fontSize="16" fill="#94a3b8">🌙</text>
        )}
      </svg>
    </div>
  );
}

// ─── sun info ─────────────────────────────────────────────────────────────────
function SunInfoOverlay({ timeState }: { timeState: TimeState }) {
  const date  = new Date(`${timeState.date}T${timeState.time}:00`);
  const times = getSunTimes(BERLIN_CENTER[0], BERLIN_CENTER[1], date);
  const fmt   = (d: Date) => d.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="absolute top-3 right-3 z-[500] bg-white/80 backdrop-blur-xl rounded-2xl border border-zinc-100 shadow-lg shadow-zinc-200/30 px-3.5 py-2">
      <div className="flex items-center gap-2.5 font-body text-zinc-500" style={{ fontSize: "12px" }}>
        <span>🌅 {fmt(times.sunrise)}</span>
        <span className="text-zinc-200">·</span>
        <span>🌇 {fmt(times.sunset)}</span>
      </div>
    </div>
  );
}
