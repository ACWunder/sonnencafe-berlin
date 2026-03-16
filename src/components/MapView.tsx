// src/components/MapView.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Cafe, TimeState, SunTimeline, SunTimelineData } from "@/types";
import { getSunPosition, getSunTimes } from "@/lib/sun";
import { calcShadowPolygon } from "@/lib/buildingShadow";
import type { BuildingFeature } from "@/app/api/buildings/route";

// OSM bounds for districts 5 (Margareten), 6 (Mariahilf), 7 (Neubau), 8 (Josefstadt)
// — must match overpass.ts VIENNA_BBOX exactly
const DISTRICT_BOUNDS = {
  south: 48.175, west: 16.333,
  north: 48.230, east: 16.375,
} as const;

const MAP_CENTER: [number, number] = [
  (DISTRICT_BOUNDS.south + DISTRICT_BOUNDS.north) / 2,
  (DISTRICT_BOUNDS.west  + DISTRICT_BOUNDS.east)  / 2,
];
// Alias used for sun position calculation
const NEUBAU_CENTER = MAP_CENTER;
const FALLBACK_HEIGHT = 18;

interface MapViewProps {
  timeState: TimeState;
  cafes: Cafe[];
  selectedCafe: Cafe | null;
  onCafeSelect: (cafe: Cafe | null) => void;
  onSunRemaining: (data: Record<string, number | null>) => void;
  onSunTimeline: (data: SunTimelineData) => void;
}

/**
 * Returns minutes the point in front of the cafe will still be in sun,
 * or null if it's already in shadow.  Uses 10-min steps, max 4 h.
 * Only considers buildings within 150 m to keep it fast.
 */
function calcSunRemaining(
  cafe: Cafe,
  currentDate: Date,
  buildings: BuildingFeature[],
): number | null {
  const STEP_MS  = 10 * 60 * 1000;
  const MAX_STEPS = 24; // 4 hours
  const OFFSET_M  = 10;

  // Pre-filter: shadows max ~100 m at reasonable sun altitudes (18m / tan(10°) ≈ 102m)
  const LAT_MAX = 150 / 111_000;
  const LNG_MAX = 150 / (111_000 * Math.cos((cafe.lat * Math.PI) / 180));
  const nearby = buildings.filter((b) => {
    const [bLat, bLng] = b.polygon[0];
    return Math.abs(bLat - cafe.lat) < LAT_MAX && Math.abs(bLng - cafe.lng) < LNG_MAX;
  });

  for (let step = 0; step <= MAX_STEPS; step++) {
    const date   = new Date(currentDate.getTime() + step * STEP_MS);
    const sunPos = getSunPosition(cafe.lat, cafe.lng, date);

    if (sunPos.altitudeDeg <= 0) return step === 0 ? null : (step - 1) * 10;

    const azRad  = (sunPos.azimuthDeg * Math.PI) / 180;
    const dlat   = (OFFSET_M * Math.cos(azRad)) / 111_000;
    const dlng   = (OFFSET_M * Math.sin(azRad)) / (111_000 * Math.cos((cafe.lat * Math.PI) / 180));
    const chkLat = cafe.lat + dlat;
    const chkLng = cafe.lng + dlng;

    const inShadow = nearby.some((b) => {
      const poly = calcShadowPolygon(b.polygon, b.height ?? FALLBACK_HEIGHT, sunPos.altitudeDeg, sunPos.azimuthDeg);
      return poly.length >= 3 && pointInPolygon(chkLat, chkLng, poly);
    });

    if (inShadow) return step === 0 ? null : (step - 1) * 10;
  }
  return MAX_STEPS * 10; // still sunny after 4 h → show ">4h"
}

/**
 * Compute a sun/shade timeline for a cafe from sunrise to sunset.
 * Uses 20-minute intervals. Nearby buildings are pre-filtered once.
 */
function calcDayTimeline(
  cafe: Cafe,
  date: Date,
  buildings: BuildingFeature[],
): SunTimeline {
  const INTERVAL_MIN = 20;
  const OFFSET_M = 10;

  const LAT_MAX = 150 / 111_000;
  const LNG_MAX = 150 / (111_000 * Math.cos((cafe.lat * Math.PI) / 180));
  const nearby = buildings.filter((b) => {
    const [bLat, bLng] = b.polygon[0];
    return Math.abs(bLat - cafe.lat) < LAT_MAX && Math.abs(bLng - cafe.lng) < LNG_MAX;
  });

  const times = getSunTimes(cafe.lat, cafe.lng, date);
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

/** Ray-casting point-in-polygon test. */
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

// ─── shadow rendering ─────────────────────────────────────────────────────────

// Compute viewport-culled shadow polygons into shadowStore for cafe status checks only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeViewportShadows(
  buildings: BuildingFeature[],
  timeState: TimeState,
  shadowStore: [number, number][][],
) {
  shadowStore.length = 0;
  const date = new Date(`${timeState.date}T${timeState.time}:00`);
  const sunPos = getSunPosition(NEUBAU_CENTER[0], NEUBAU_CENTER[1], date);
  if (sunPos.altitudeDeg <= 0) {
    shadowStore.push([
      [DISTRICT_BOUNDS.south, DISTRICT_BOUNDS.west],
      [DISTRICT_BOUNDS.north, DISTRICT_BOUNDS.west],
      [DISTRICT_BOUNDS.north, DISTRICT_BOUNDS.east],
      [DISTRICT_BOUNDS.south, DISTRICT_BOUNDS.east],
    ]);
    return;
  }
  for (const b of buildings) {
    const shadow = calcShadowPolygon(b.polygon, b.height ?? FALLBACK_HEIGHT, sunPos.altitudeDeg, sunPos.azimuthDeg);
    if (shadow.length >= 3) shadowStore.push(shadow as [number, number][]);
  }
}

// Pre-bake ALL shadow polygons onto a district-sized canvas at a fixed reference zoom.
// Called once per time change. Pan/zoom just CSS-transforms the canvas — zero JS per frame.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SHADOW_RENDER_ZOOM = 16;
function renderShadowMap(L: any, canvas: HTMLCanvasElement, timeState: TimeState, allBuildings: BuildingFeature[]) {
  const nwPx = L.CRS.EPSG3857.latLngToPoint(L.latLng(DISTRICT_BOUNDS.north, DISTRICT_BOUNDS.west), SHADOW_RENDER_ZOOM);
  const sePx = L.CRS.EPSG3857.latLngToPoint(L.latLng(DISTRICT_BOUNDS.south, DISTRICT_BOUNDS.east), SHADOW_RENDER_ZOOM);
  const cw = Math.ceil(sePx.x - nwPx.x);
  const ch = Math.ceil(sePx.y - nwPx.y);
  canvas.width  = cw;
  canvas.height = ch;

  const ctx = canvas.getContext("2d")!;
  const date = new Date(`${timeState.date}T${timeState.time}:00`);
  const sunPos = getSunPosition(NEUBAU_CENTER[0], NEUBAU_CENTER[1], date);
  ctx.fillStyle = "#334155";
  if (sunPos.altitudeDeg <= 0) {
    ctx.fillRect(0, 0, cw, ch);
    return;
  }
  ctx.beginPath();
  for (const b of allBuildings) {
    const shadow = calcShadowPolygon(b.polygon, b.height ?? FALLBACK_HEIGHT, sunPos.altitudeDeg, sunPos.azimuthDeg);
    if (shadow.length < 3) continue;
    let first = true;
    for (const [lat, lng] of shadow as [number, number][]) {
      const pt = L.CRS.EPSG3857.latLngToPoint(L.latLng(lat, lng), SHADOW_RENDER_ZOOM);
      const x = pt.x - nwPx.x;
      const y = pt.y - nwPx.y;
      if (first) { ctx.moveTo(x, y); first = false; }
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
  ctx.fill();
}

// ─── component ───────────────────────────────────────────────────────────────
export function MapView({ timeState, cafes, selectedCafe, onCafeSelect, onSunRemaining, onSunTimeline }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildingLayerRef = useRef<any>(null);
  const shadowMapRef = useRef<HTMLCanvasElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cafeLayerRef = useRef<any>(null);
  const shadowPolygonsRef = useRef<[number, number][][]>([]);
  const cafesRef = useRef<Cafe[]>(cafes);
  cafesRef.current = cafes;
  const selectedCafeRef = useRef<Cafe | null>(selectedCafe);
  selectedCafeRef.current = selectedCafe;
  const onCafeSelectRef = useRef(onCafeSelect);
  onCafeSelectRef.current = onCafeSelect;
  const onSunRemainingRef = useRef(onSunRemaining);
  onSunRemainingRef.current = onSunRemaining;
  const onSunTimelineRef = useRef(onSunTimeline);
  onSunTimelineRef.current = onSunTimeline;

  // All buildings ever fetched, keyed by OSM id → no duplicates when viewports overlap
  const buildingCacheRef = useRef<Map<number, BuildingFeature>>(new Map());

  // Return only buildings whose bounding box overlaps the current padded viewport.
  // pad(1.0) = 100% of viewport per side — covers canvas padding (0.6×) + max shadow
  // extension (~250 m). At zoom > 15 this yields ~200-500 buildings vs 17k total.
  function getViewportBuildings(all: BuildingFeature[]): BuildingFeature[] {
    const map = mapInstanceRef.current;
    if (!map || all.length === 0) return all;
    const b = map.getBounds().pad(1.0);
    const s = b.getSouth(), n = b.getNorth(), w = b.getWest(), e = b.getEast();
    return all.filter((bld) => {
      let bS = Infinity, bN = -Infinity, bW = Infinity, bE = -Infinity;
      for (const [lat, lng] of bld.polygon) {
        if (lat < bS) bS = lat; if (lat > bN) bN = lat;
        if (lng < bW) bW = lng; if (lng > bE) bE = lng;
      }
      return bN >= s && bS <= n && bE >= w && bW <= e;
    });
  }
  // Reposition the pre-baked shadow canvas over DISTRICT_BOUNDS at current zoom/pan.
  // Called on zoomend + moveend; during gestures the pane CSS transform handles movement.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function positionShadowMap(map: any, L: any) {
    const canvas = shadowMapRef.current;
    if (!canvas || !map) return;
    const nwPt = map.latLngToLayerPoint(L.latLng(DISTRICT_BOUNDS.north, DISTRICT_BOUNDS.west));
    const sePt = map.latLngToLayerPoint(L.latLng(DISTRICT_BOUNDS.south, DISTRICT_BOUNDS.east));
    canvas.style.width  = (sePt.x - nwPt.x) + "px";
    canvas.style.height = (sePt.y - nwPt.y) + "px";
    L.DomUtil.setPosition(canvas, nwPt);
  }

  const timeStateRef = useRef(timeState);
  timeStateRef.current = timeState;

  const [fetching, setFetching] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const locationMarkerRef = useRef<any>(null);
  const [locating, setLocating] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function updateCafeDots(L: any, recomputeSunData = true) {
    const cLayer = cafeLayerRef.current;
    if (!cLayer) return;
    cLayer.clearLayers();

    const date = new Date(`${timeStateRef.current.date}T${timeStateRef.current.time}:00`);
    const sunPos = getSunPosition(NEUBAU_CENTER[0], NEUBAU_CENTER[1], date);

    const OFFSET_M = 10;
    const azRad = (sunPos.azimuthDeg * Math.PI) / 180;
    const selectedId = selectedCafeRef.current?.id ?? null;

    cafesRef.current.forEach((cafe) => {
      let checkLat = cafe.lat;
      let checkLng = cafe.lng;

      if (sunPos.altitudeDeg > 0) {
        const dlat = (OFFSET_M * Math.cos(azRad)) / 111_000;
        const dlng = (OFFSET_M * Math.sin(azRad)) / (111_000 * Math.cos((cafe.lat * Math.PI) / 180));
        checkLat = cafe.lat + dlat;
        checkLng = cafe.lng + dlng;
      }

      const inShadow = sunPos.altitudeDeg <= 0 || shadowPolygonsRef.current.some((poly) =>
        pointInPolygon(checkLat, checkLng, poly)
      );

      const isSelected = cafe.id === selectedId;
      const color = inShadow ? "#374151" : "#ea580c";

      // Zoom-dependent radius: small when zoomed out, larger when zoomed in
      const zoom = mapInstanceRef.current?.getZoom() ?? 15;
      const baseRadius = zoom >= 17 ? 5 : zoom >= 16 ? 4 : 3;
      const radius = isSelected ? baseRadius + 3 : baseRadius;

      // Visual dot — non-interactive so the hit area underneath handles events
      L.circleMarker([cafe.lat, cafe.lng], {
        radius,
        color: isSelected ? "#ffffff" : "#ea580c",
        fillColor: color,
        fillOpacity: 1,
        weight: isSelected ? 2 : 0,
        interactive: false,
        pane: "cafePane",
      }).addTo(cLayer);

      // Large transparent hit area (~32 px diameter touch target) — canvas renderer
      // uses geometric containsPoint(radius) so fillOpacity doesn't affect hit detection.
      const hitArea = L.circleMarker([cafe.lat, cafe.lng], {
        radius: 16,
        color: "transparent",
        fillColor: "#000",
        fillOpacity: 0,
        weight: 0,
        interactive: true,
        pane: "cafePane",
      });

      hitArea.on("click", () => {
        onCafeSelectRef.current(cafe);
      });

      hitArea.addTo(cLayer);
    });

    // Heavy computation: sun-remaining + day timeline for all cafes.
    // Skipped on selection-change (data doesn't change, only dot appearance does).
    // Processed in chunks of 15 so the UI stays responsive on mobile.
    if (!recomputeSunData) return;

    const buildings = Array.from(buildingCacheRef.current.values());
    const currentDate = new Date(`${timeStateRef.current.date}T${timeStateRef.current.time}:00`);
    const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 12, 0, 0);
    const allCafes = [...cafesRef.current];
    const remaining: Record<string, number | null> = {};
    const timelines: SunTimelineData = {};
    const CHUNK = 15;
    let idx = 0;

    function processChunk() {
      const end = Math.min(idx + CHUNK, allCafes.length);
      for (; idx < end; idx++) {
        const cafe = allCafes[idx];
        remaining[cafe.id] = calcSunRemaining(cafe, currentDate, buildings);
        timelines[cafe.id] = calcDayTimeline(cafe, dayDate, buildings);
      }
      if (idx < allCafes.length) {
        setTimeout(processChunk, 0); // yield to UI between chunks
      } else {
        onSunRemainingRef.current(remaining);
        onSunTimelineRef.current(timelines);
      }
    }

    setTimeout(processChunk, 0);
  }

  // Rebuild the building layer from cache and redraw shadows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function rebuildLayers(L: any) {
    const buildings = Array.from(buildingCacheRef.current.values());
    const bLayer = buildingLayerRef.current;
    if (!bLayer) return;

    const shadowCanvas = shadowMapRef.current;
    if (shadowCanvas) {
      renderShadowMap(L, shadowCanvas, timeStateRef.current, buildings);
      positionShadowMap(mapInstanceRef.current, L);
    }
    computeViewportShadows(getViewportBuildings(buildings), timeStateRef.current, shadowPolygonsRef.current);
    updateCafeDots(L);

    bLayer.clearLayers();
    buildings.forEach((b) => {
      L.polygon(b.polygon as [number, number][], {
        color: "#94a3b8",
        weight: 0.8,
        fillColor: "#e2e8f0",
        fillOpacity: 1.0,
        interactive: false,
        pane: "buildingPane",
      }).addTo(bLayer);
    });
  }

  // Load all buildings from pre-built static JSON (served via CDN, no Overpass call)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function loadStaticBuildings(L: any) {
    setFetching(true);
    fetch("/buildings-cache.json")
      .then((r) => r.json())
      .then(({ buildings }: { buildings: BuildingFeature[] }) => {
        buildings.forEach((b) => buildingCacheRef.current.set(b.id, b));
        rebuildLayers(L);
        setFetching(false);
      })
      .catch(() => setFetching(false));
  }

  // ── init map once ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((mapRef.current as any)._leaflet_id) return;

    let mounted = true;

    import("leaflet").then((L) => {
      if (!mounted || !mapRef.current || mapInstanceRef.current) return;

      const districtBounds = L.latLngBounds(
        [DISTRICT_BOUNDS.south, DISTRICT_BOUNDS.west],
        [DISTRICT_BOUNDS.north, DISTRICT_BOUNDS.east],
      );
      const renderer = L.canvas({ padding: 1.0 }); // render 1× viewport beyond edges
      const map = L.map(mapRef.current, {
        zoomControl: false,
        minZoom: 12,
        preferCanvas: true,   // Canvas renderer: far faster for 12k+ polygons
        renderer,
        zoomSnap: 0.5,        // Smoother zoom steps
        zoomDelta: 0.5,
        wheelPxPerZoomLevel: 80,
        // fadeAnimation defaults to true — keeps old tiles visible as placeholders
        // while new zoom-level tiles load, so background is rarely exposed
      });

      map.fitBounds(districtBounds);

      // Zoom control only on desktop — hidden via CSS on mobile
      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Tile options: load continuously while panning, buffer extra tiles
      const tileOptions = {
        attribution: "",
        maxZoom: 19,
        keepBuffer: 6,            // Pre-load 6 tiles outside viewport in each direction
        updateWhenIdle: false,    // Load tiles while panning, not just when stopped
        updateWhenZooming: false, // Don't reload tiles mid-gesture (avoids jank on mobile)
      };

      // Attribution moved to Impressum in the UI
      // Base map without labels — labels are added on top of all overlays
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", tileOptions).addTo(map);
      map.attributionControl.remove();

      // z-order: green → shadows → buildings → location → labels → cafes
      map.createPane("greenPane").style.zIndex = "400";
      const shadowPaneEl = map.createPane("shadowPane");
      shadowPaneEl.style.zIndex = "401";
      shadowPaneEl.style.opacity = "0.55";
      map.createPane("buildingPane").style.zIndex = "402";
      const cafePaneEl = map.createPane("cafePane");
      cafePaneEl.style.zIndex = "405"; // above labels
      cafePaneEl.style.pointerEvents = "auto";

      // Pre-create canvas renderers for each custom pane with padding=0.6.
      // Leaflet default is 0.1 (10% of viewport).
      // padding=0.6 → canvas = 2.2× viewport in each dimension.
      // During zoom-out the CSS transform shrinks the canvas visually;
      // 2.2× gives coverage down to a ~0.45× scale factor (≈1 full zoom level
      // out) before any edge is exposed — without needing any canvas draws
      // during the gesture (which would block the main thread and cause jank).
      (map as any)._paneRenderers = (map as any)._paneRenderers ?? {};
      // shadowPane uses a raw canvas overlay (shadowMapRef) — no Leaflet renderer needed.
      (["greenPane", "buildingPane", "cafePane"] as const).forEach((pane) => {
        const r = L.canvas({ padding: 0.6, pane });
        (map as any)._paneRenderers[pane] = r;
        r.addTo(map);
      });

      // Yellow sunny overlay – only covers districts 6/7/8, not the whole world
      L.rectangle(
        [[DISTRICT_BOUNDS.south, DISTRICT_BOUNDS.west], [DISTRICT_BOUNDS.north, DISTRICT_BOUNDS.east]],
        { color: "transparent", fillColor: "#fde68a", fillOpacity: 0.38, interactive: false }
      ).addTo(map);

      // Shadow map: pre-baked canvas positioned over DISTRICT_BOUNDS.
      // Shadows rendered once per time change; pan/zoom handled by CSS transform.
      const shadowCanvas = document.createElement("canvas");
      shadowCanvas.style.position = "absolute";
      shadowCanvas.style.pointerEvents = "none";
      // leaflet-zoom-animated enables the CSS transition so the canvas
      // participates in pinch-zoom animation exactly like L.ImageOverlay.
      L.DomUtil.addClass(shadowCanvas, "leaflet-zoom-animated");
      map.getPane("shadowPane")!.appendChild(shadowCanvas);
      shadowMapRef.current = shadowCanvas;

      const buildingLayer = L.layerGroup().addTo(map);
      buildingLayerRef.current = buildingLayer;

      const cafeLayer = L.layerGroup().addTo(map);
      cafeLayerRef.current = cafeLayer;

      mapInstanceRef.current = map;

      // Load buildings + green areas from static CDN files
      loadStaticBuildings(L);
      fetch("/green-areas-cache.json")
        .then((r) => r.json())
        .then(({ areas }: { areas: { id: number; polygon: [number, number][] }[] }) => {
          areas.forEach((a) => {
            L.polygon(a.polygon, {
              color: "transparent",
              fillColor: "#86efac",
              fillOpacity: 0.55,
              interactive: false,
              pane: "greenPane",
            }).addTo(map);
          });
        })
        .catch(() => {});

      // Canvas layer updates during pan and zoom.
      //
      // ZOOM: zero canvas draws during the gesture. The browser composites
      // the CSS transform entirely on the GPU — any synchronous canvas draw
      // (even one per 150 ms) blocks the main thread and produces the
      // "different frames" stutter the user sees. padding=0.6 above gives
      // a 2.2× canvas so the pre-drawn content covers ~1 full zoom-level
      // of zoom-out before any edge is exposed. One clean redraw fires on
      // zoomend once the user lifts their fingers.
      //
      // PAN: redraw every animation frame via RAF. Moving the canvas is
      // cheap (no zoom-scale arithmetic) and keeps buildings flush with
      // the tiles while dragging.
      const redrawPanes = () => {
        const pr: Record<string, unknown> = (map as any)._paneRenderers ?? {};
        Object.values(pr).forEach((r: any) => r?._update?.());
      };

      let isZooming = false;
      let moveRafId: number | null = null;

      map.on("zoomstart", () => {
        isZooming = true;
        if (moveRafId !== null) { cancelAnimationFrame(moveRafId); moveRafId = null; }
      });

      // Pan only — skip entirely during zoom so the gesture is pure GPU CSS.
      map.on("move", () => {
        if (isZooming || moveRafId !== null) return;
        moveRafId = requestAnimationFrame(() => {
          moveRafId = null;
          redrawPanes();
        });
      });

      // Reposition shadow canvas on zoom/pan settle, refresh viewport cafe status.
      const refreshShadows = () => {
        positionShadowMap(map, L);
        const all = Array.from(buildingCacheRef.current.values());
        computeViewportShadows(getViewportBuildings(all), timeStateRef.current, shadowPolygonsRef.current);
      };

      // Single clean repaint after zoom settles.
      map.on("zoomend", () => {
        isZooming = false;
        refreshShadows();
        updateCafeDots(L, false);
        redrawPanes();
      });

      // Reposition + refresh viewport shadows after pan ends.
      map.on("moveend", () => {
        if (!isZooming) refreshShadows();
      });

      // Animate shadow canvas during pinch zoom — same pattern as L.ImageOverlay.
      // zoomanim fires once at gesture start; CSS transition (leaflet-zoom-animated)
      // handles the smooth interpolation. setTransform(offset, scale) is the
      // exact same call Leaflet uses internally for image overlays.
      map.on("zoomanim", (e: any) => {
        const canvas = shadowMapRef.current;
        if (!canvas) return;
        const scale = map.getZoomScale(e.zoom);
        const offset = (map as any)._latLngToNewLayerPoint(
          [DISTRICT_BOUNDS.north, DISTRICT_BOUNDS.west], e.zoom, e.center);
        L.DomUtil.setTransform(canvas, offset, scale);
      });

      // Location pane below labels
      const locationPane = map.createPane("locationPane");
      locationPane.style.zIndex = "403";

      // Labels pane above buildings/shadows, below cafes
      const labelsPane = map.createPane("labelsPane");
      labelsPane.style.zIndex = "404";
      labelsPane.style.pointerEvents = "none";
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png", {
        ...tileOptions,
        pane: "labelsPane",
      }).addTo(map);
    });

    return () => {
      mounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── redraw shadows when time changes ──────────────────────────────────────
  // Redraw shadows + cafe dots when time changes
  useEffect(() => {
    const canvas = shadowMapRef.current;
    if (!canvas) return;
    import("leaflet").then((L) => {
      const all = Array.from(buildingCacheRef.current.values());
      renderShadowMap(L, canvas, timeState, all);
      positionShadowMap(mapInstanceRef.current, L);
      computeViewportShadows(getViewportBuildings(all), timeState, shadowPolygonsRef.current);
      updateCafeDots(L);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeState]);

  // Redraw cafe dots when cafe list arrives / changes
  useEffect(() => {
    if (!cafeLayerRef.current) return;
    import("leaflet").then((L) => updateCafeDots(L));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cafes]);

  // Redraw dots when selection changes — only visual update, no sun recomputation
  useEffect(() => {
    if (!cafeLayerRef.current) return;
    import("leaflet").then((L) => updateCafeDots(L, false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCafe]);

  // Pan to selected cafe without changing zoom
  useEffect(() => {
    if (!selectedCafe || !mapInstanceRef.current) return;
    mapInstanceRef.current.panTo([selectedCafe.lat, selectedCafe.lng], { animate: true, duration: 0.4 });
  }, [selectedCafe]);

  return (
    <div className="w-full h-full relative">
      <div ref={mapRef} className="w-full h-full" />

      {fetching && (
        <div className="absolute top-3 left-14 z-[1000] bg-white/80 backdrop-blur-xl rounded-2xl border border-zinc-100 shadow-lg shadow-zinc-200/30 px-3.5 py-2 flex items-center gap-2 font-body text-zinc-500" style={{ fontSize: "12px" }}>
          <div className="w-3 h-3 border-[1.5px] border-amber-400 border-t-transparent rounded-full animate-spin" />
          Gebäude laden…
        </div>
      )}

      {/* Locate button — top-left below hamburger */}
      <button
        onClick={() => {
          if (!mapInstanceRef.current) return;
          setLocating(true);
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setLocating(false);
              import("leaflet").then((L) => {
                const map = mapInstanceRef.current;
                if (!map) return;
                const { latitude: lat, longitude: lng } = pos.coords;

                // Remove old marker
                if (locationMarkerRef.current) {
                  locationMarkerRef.current.remove();
                }

                // Pulsing blue dot via DivIcon
                const icon = L.divIcon({
                  className: "",
                  html: `<div style="
                    width:18px;height:18px;border-radius:50%;
                    background:#3b82f6;border:2.5px solid white;
                    box-shadow:0 0 0 4px rgba(59,130,246,0.25);
                    animation:locationPulse 2s ease-in-out infinite;
                  "></div>`,
                  iconSize: [18, 18],
                  iconAnchor: [9, 9],
                });

                locationMarkerRef.current = L.marker([lat, lng], {
                  icon,
                  interactive: false,
                  pane: "locationPane",
                }).addTo(map);

                map.panTo([lat, lng], { animate: true, duration: 0.6 });
              });
            },
            () => setLocating(false),
            { enableHighAccuracy: true, timeout: 8000 },
          );
        }}
        className="absolute top-14 left-3 z-[500] w-9 h-9 bg-white/90 backdrop-blur-xl rounded-2xl border border-zinc-100 shadow-lg shadow-zinc-200/40 flex items-center justify-center active:scale-95 transition-all"
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
        <SunCompass timeState={timeState} />
        <Legend />
      </div>
      <SunInfoOverlay timeState={timeState} />
    </div>
  );
}

// ─── legend ──────────────────────────────────────────────────────────────────
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

// ─── sun compass ─────────────────────────────────────────────────────────────
function SunCompass({ timeState }: { timeState: TimeState }) {
  const date = new Date(`${timeState.date}T${timeState.time}:00`);
  const pos = getSunPosition(NEUBAU_CENTER[0], NEUBAU_CENTER[1], date);
  const isUp = pos.altitudeDeg > 0;

  const size = 52;
  const r = size / 2;
  const pad = 10;
  const innerR = r - pad;
  const distFraction = isUp ? Math.max(0, 1 - pos.altitudeDeg / 90) : 1.0;
  const azRad = (pos.azimuthDeg * Math.PI) / 180;
  const sx = r + distFraction * innerR * Math.sin(azRad);
  const sy = r - distFraction * innerR * Math.cos(azRad);

  return (
    <div className="bg-white/90 backdrop-blur-xl rounded-2xl border border-zinc-100 shadow-lg shadow-zinc-200/40 p-2 inline-flex">
      <svg width={size} height={size}>
        <defs>
          <radialGradient id="skyGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#bfdbfe" />
            <stop offset="100%" stopColor="#dbeafe" />
          </radialGradient>
        </defs>
        <circle cx={r} cy={r} r={innerR} fill="url(#skyGrad)" stroke="#93c5fd" strokeWidth="1" />
        <circle cx={r} cy={r} r={innerR * 0.67} fill="none" stroke="#93c5fd" strokeWidth="0.5" strokeDasharray="3,3" />
        <line x1={r} y1={pad / 2} x2={r} y2={size - pad / 2} stroke="#bfdbfe" strokeWidth="0.5" />
        <line x1={pad / 2} y1={r} x2={size - pad / 2} y2={r} stroke="#bfdbfe" strokeWidth="0.5" />
        <text x={r} y={5} textAnchor="middle" fontSize="5" fill="#64748b" fontFamily="DM Sans, sans-serif" fontWeight="600">N</text>
        <text x={r} y={size - 1} textAnchor="middle" fontSize="5" fill="#64748b" fontFamily="DM Sans, sans-serif" fontWeight="600">S</text>
        <text x={3} y={r + 2} textAnchor="middle" fontSize="5" fill="#64748b" fontFamily="DM Sans, sans-serif" fontWeight="600">W</text>
        <text x={size - 3} y={r + 2} textAnchor="middle" fontSize="5" fill="#64748b" fontFamily="DM Sans, sans-serif" fontWeight="600">O</text>
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
  const date = new Date(`${timeState.date}T${timeState.time}:00`);
  const times = getSunTimes(NEUBAU_CENTER[0], NEUBAU_CENTER[1], date);
  const fmt = (d: Date) => d.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });

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
