// src/components/CafeDetailPanel.tsx
"use client";

import { X, MapPin, Clock, Compass } from "lucide-react";
import type { CafeWithSun, TimeState } from "@/types";
import { SunStatusBadge } from "./SunStatusBadge";
import { describeSunAltitude, getSunTimes } from "@/lib/sun";
import { STATUS_LABELS } from "@/lib/shadow";

interface CafeDetailPanelProps {
  cafe: CafeWithSun;
  timeState: TimeState;
  onClose: () => void;
}

export function CafeDetailPanel({ cafe, timeState, onClose }: CafeDetailPanelProps) {
  const date = new Date(`${timeState.date}T${timeState.time}:00`);
  const times = getSunTimes(cafe.lat, cafe.lng, date);

  const fmt = (d: Date) =>
    d.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });

  const sunPercent = Math.round((1 - cafe.shadowScore) * 100);

  const cardinalDir = (az: number) => {
    const dirs = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];
    return dirs[Math.round(az / 45) % 8];
  };

  return (
    <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-[500] animate-slide-up">
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xl overflow-hidden">
        {/* Header */}
        <div
          className={`px-4 py-3 ${
            cafe.sunStatus === "sunny"
              ? "bg-gradient-to-r from-sun-50 to-sun-100"
              : cafe.sunStatus === "partial"
              ? "bg-gradient-to-r from-partial-100/50 to-orange-50"
              : "bg-gradient-to-r from-slate-50 to-stone-100"
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0 pr-2">
              <h2 className="font-display font-bold text-stone-900 text-base leading-tight truncate">
                {cafe.name}
              </h2>
              {cafe.district && (
                <p className="text-xs text-stone-500 mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {cafe.district}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 bg-white/80 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-white transition-all shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-2">
            <SunStatusBadge status={cafe.sunStatus} size="md" />
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-3">
          {/* Sun score */}
          <div>
            <div className="flex justify-between text-xs text-stone-400 font-body mb-1">
              <span>Sonneneinstrahlung</span>
              <span className="font-medium text-stone-700">{sunPercent}%</span>
            </div>
            <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  cafe.sunStatus === "sunny"
                    ? "bg-gradient-to-r from-sun-300 to-sun-500"
                    : cafe.sunStatus === "partial"
                    ? "bg-gradient-to-r from-partial-200 to-partial-400"
                    : "bg-gradient-to-r from-shade-200 to-shade-400"
                }`}
                style={{ width: `${sunPercent}%` }}
              />
            </div>
          </div>

          {/* Sun details grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-stone-50 rounded-xl p-2.5">
              <p className="text-xs text-stone-400 font-body mb-0.5">Sonnenstand</p>
              <p className="text-sm font-body font-semibold text-stone-800">
                {cafe.sunAltitude.toFixed(1)}°
              </p>
              <p className="text-xs text-stone-400 font-body">
                {describeSunAltitude(cafe.sunAltitude)}
              </p>
            </div>
            <div className="bg-stone-50 rounded-xl p-2.5">
              <p className="text-xs text-stone-400 font-body mb-0.5 flex items-center gap-1">
                <Compass className="w-3 h-3" /> Azimut
              </p>
              <p className="text-sm font-body font-semibold text-stone-800">
                {cafe.sunAzimuth.toFixed(0)}°
              </p>
              <p className="text-xs text-stone-400 font-body">
                Sonne im {cardinalDir(cafe.sunAzimuth)}
              </p>
            </div>
          </div>

          {/* Sun times */}
          <div className="flex justify-between text-xs font-body text-stone-500 bg-stone-50 rounded-xl px-3 py-2">
            <span className="flex items-center gap-1">🌅 {fmt(times.sunrise)}</span>
            <span className="text-stone-300">·</span>
            <span className="flex items-center gap-1">🌇 {fmt(times.sunset)}</span>
          </div>

          {/* Address */}
          {cafe.address && (
            <p className="text-xs text-stone-400 font-body flex items-start gap-1">
              <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
              {cafe.address}
            </p>
          )}

          {/* OSM link */}
          <a
            href={`https://www.openstreetmap.org/?mlat=${cafe.lat}&mlon=${cafe.lng}#map=17/${cafe.lat}/${cafe.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center text-xs text-stone-400 hover:text-stone-600 py-1 transition-colors font-body"
          >
            In OpenStreetMap öffnen →
          </a>
        </div>
      </div>
    </div>
  );
}
