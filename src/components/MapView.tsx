// src/components/MapView.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Cafe, TimeState, SunTimeline, SunTimelineData } from "@/types";
import { getSunPosition, getSunTimes } from "@/lib/sun";
import { calcShadowPolygon } from "@/lib/buildingShadow";
import type { BuildingFeature } from "@/app/api/buildings/route";

// Exact OSM bounds for districts 6 (Mariahilf), 7 (Neubau), 8 (Josefstadt)
// — must match overpass.ts VIENNA_BBOX exactly
const DISTRICT_BOUNDS = {
  south: 48.1883, west: 16.3369,
  north: 48.2154, east: 16.3660,
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

// ─── shadow drawing ───────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawShadows(
  L: any, layer: any, buildings: BuildingFeature[],
  timeState: TimeState, shadowPane: string,
  shadowStore: [number, number][][],
) {
  layer.clearLayers();
  shadowStore.length = 0;

  const date = new Date(`${timeState.date}T${timeState.time}:00`);
  const sunPos = getSunPosition(NEUBAU_CENTER[0], NEUBAU_CENTER[1], date);
  if (sunPos.altitudeDeg <= 0) return;

  buildings.forEach((b) => {
    const shadow = calcShadowPolygon(b.polygon, b.height ?? FALLBACK_HEIGHT, sunPos.altitudeDeg, sunPos.azimuthDeg);
    if (shadow.length < 3) return;
    shadowStore.push(shadow);
    L.polygon(shadow as [number, number][], {
      color: "transparent",
      fillColor: "#334155",
      fillOpacity: 1.0,
      interactive: false,
      pane: shadowPane,
    }).addTo(layer);
  });
}

// ─── component ───────────────────────────────────────────────────────────────
export function MapView({ timeState, cafes, selectedCafe, onCafeSelect, onSunRemaining, onSunTimeline }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildingLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shadowLayerRef = useRef<any>(null);
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
  const timeStateRef = useRef(timeState);
  timeStateRef.current = timeState;

  const [fetching, setFetching] = useState(false);
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function updateCafeDots(L: any) {
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

      const marker = L.circleMarker([cafe.lat, cafe.lng], {
        radius: isSelected ? 7 : 4,
        color: isSelected ? "#ffffff" : "transparent",
        fillColor: color,
        fillOpacity: 1,
        weight: isSelected ? 2 : 10, // large transparent stroke = bigger click target
        interactive: true,
        pane: "cafePane",
      });

      marker.bindTooltip(cafe.name, {
        direction: "top",
        offset: [0, -6],
        className: "leaflet-cafe-tooltip",
      });

      marker.on("click", () => {
        onCafeSelectRef.current(cafe);
      });

      marker.addTo(cLayer);
    });

    // Compute sun-remaining + day timeline for all cafes (deferred to avoid blocking render)
    const buildings = Array.from(buildingCacheRef.current.values());
    const currentDate = new Date(`${timeStateRef.current.date}T${timeStateRef.current.time}:00`);
    const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 12, 0, 0);
    setTimeout(() => {
      const remaining: Record<string, number | null> = {};
      const timelines: SunTimelineData = {};
      cafesRef.current.forEach((cafe) => {
        remaining[cafe.id] = calcSunRemaining(cafe, currentDate, buildings);
        timelines[cafe.id] = calcDayTimeline(cafe, dayDate, buildings);
      });
      onSunRemainingRef.current(remaining);
      onSunTimelineRef.current(timelines);
    }, 0);
  }

  // Rebuild the building layer from cache and redraw shadows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function rebuildLayers(L: any) {
    const buildings = Array.from(buildingCacheRef.current.values());
    const bLayer = buildingLayerRef.current;
    const sLayer = shadowLayerRef.current;
    if (!bLayer || !sLayer) return;

    drawShadows(L, sLayer, buildings, timeStateRef.current, "shadowPane", shadowPolygonsRef.current);
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

  // Fetch buildings for a bbox, merge into cache, rebuild layers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function fetchForBbox(L: any, bbox: string) {
    setFetching(true);
    fetch(`/api/buildings?bbox=${bbox}`)
      .then((r) => r.json())
      .then(({ buildings }: { buildings: BuildingFeature[] }) => {
        let added = 0;
        buildings.forEach((b) => {
          if (!buildingCacheRef.current.has(b.id)) {
            buildingCacheRef.current.set(b.id, b);
            added++;
          }
        });
        if (added > 0) rebuildLayers(L);
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
      const map = L.map(mapRef.current, {
        zoomControl: false,
        minZoom: 14,
      });

      map.fitBounds(districtBounds);

      // Zoom control only on desktop — hidden via CSS on mobile
      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Attribution moved to Impressum in the UI
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: "",
        maxZoom: 19,
      }).addTo(map);
      map.attributionControl.remove();

      // Custom panes with fixed z-indices → shadows always below buildings,
      // regardless of the order polygons are added to the SVG DOM.
      const shadowPaneEl = map.createPane("shadowPane");
      shadowPaneEl.style.zIndex = "401";
      shadowPaneEl.style.opacity = "0.55";
      map.createPane("buildingPane").style.zIndex = "402";
      const cafePaneEl = map.createPane("cafePane");
      cafePaneEl.style.zIndex = "403";
      cafePaneEl.style.pointerEvents = "auto";

      // Yellow sunny overlay – only covers districts 6/7/8, not the whole world
      L.rectangle(
        [[DISTRICT_BOUNDS.south, DISTRICT_BOUNDS.west], [DISTRICT_BOUNDS.north, DISTRICT_BOUNDS.east]],
        { color: "transparent", fillColor: "#fde68a", fillOpacity: 0.38, interactive: false }
      ).addTo(map);

      // Shadows first, buildings on top → shadows only visible on open ground
      const shadowLayer = L.layerGroup().addTo(map);
      shadowLayerRef.current = shadowLayer;

      const buildingLayer = L.layerGroup().addTo(map);
      buildingLayerRef.current = buildingLayer;

      const cafeLayer = L.layerGroup().addTo(map);
      cafeLayerRef.current = cafeLayer;

      mapInstanceRef.current = map;

      // Clamp viewport bounds to district bounds before fetching buildings
      function clampedBbox(): string {
        const b = map.getBounds();
        const s = Math.max(b.getSouth(), DISTRICT_BOUNDS.south);
        const w = Math.max(b.getWest(),  DISTRICT_BOUNDS.west);
        const n = Math.min(b.getNorth(), DISTRICT_BOUNDS.north);
        const e = Math.min(b.getEast(),  DISTRICT_BOUNDS.east);
        return `${s},${w},${n},${e}`;
      }

      // Fetch buildings for initial viewport
      fetchForBbox(L, clampedBbox());

      // Re-fetch when map is moved (debounced 600 ms)
      map.on("moveend zoomend", () => {
        if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
        fetchTimerRef.current = setTimeout(() => {
          fetchForBbox(L, clampedBbox());
        }, 600);
      });
    });

    return () => {
      mounted = false;
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
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
    const sLayer = shadowLayerRef.current;
    if (!sLayer) return;
    import("leaflet").then((L) => {
      const buildings = Array.from(buildingCacheRef.current.values());
      drawShadows(L, sLayer, buildings, timeState, "shadowPane", shadowPolygonsRef.current);
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

  // Redraw dots when selection changes (size + ring update)
  useEffect(() => {
    if (!cafeLayerRef.current) return;
    import("leaflet").then((L) => updateCafeDots(L));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCafe]);

  // Pan to selected cafe
  useEffect(() => {
    if (!selectedCafe || !mapInstanceRef.current) return;
    mapInstanceRef.current.setView([selectedCafe.lat, selectedCafe.lng], 17, { animate: true, duration: 0.5 });
  }, [selectedCafe]);

  return (
    <div className="w-full h-full relative">
      <div ref={mapRef} className="w-full h-full" />

      {fetching && (
        <div className="absolute top-3 left-3 z-[1000] bg-white/80 backdrop-blur-xl rounded-2xl border border-zinc-100 shadow-lg shadow-zinc-200/30 px-3.5 py-2 flex items-center gap-2 font-body text-zinc-500" style={{ fontSize: "12px" }}>
          <div className="w-3 h-3 border-[1.5px] border-amber-400 border-t-transparent rounded-full animate-spin" />
          Gebäude laden…
        </div>
      )}

      {/* Legend + compass stacked bottom-left */}
      <div className="absolute z-[500] flex flex-col gap-2" style={{ bottom: "24px", left: "12px" }}>
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
      <div className="flex items-center gap-2">
        <div style={{ width: 12, height: 12, borderRadius: 4, background: "#e2e8f0", border: "1.5px solid #cbd5e1" }} />
        <span className="font-body text-zinc-600" style={{ fontSize: "11px" }}>Gebäude</span>
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
