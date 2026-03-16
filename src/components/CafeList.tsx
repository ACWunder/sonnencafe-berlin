// src/components/CafeList.tsx
"use client";

import { MapPin } from "lucide-react";
import type { CafeWithSun } from "@/types";
import { SunStatusBadge } from "./SunStatusBadge";

interface CafeListProps {
  cafes: CafeWithSun[];
  selectedId: string | null;
  onSelect: (cafe: CafeWithSun) => void;
}

export function CafeList({ cafes, selectedId, onSelect }: CafeListProps) {
  if (cafes.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center mb-3">
          <span className="text-2xl">☁️</span>
        </div>
        <p className="text-stone-500 font-body text-sm">
          Keine Cafés für diese Filter gefunden.
        </p>
        <p className="text-stone-400 font-body text-xs mt-1">
          Andere Filter oder Uhrzeit versuchen
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-3 pt-3 pb-1">
        <p className="text-xs text-stone-400 font-body">
          {cafes.length} Spot{cafes.length !== 1 ? "s" : ""}
        </p>
      </div>
      <ul className="p-2 space-y-1">
        {cafes.map((cafe) => (
          <li key={cafe.id}>
            <button
              onClick={() => onSelect(cafe)}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition-all group ${
                selectedId === cafe.id
                  ? "bg-stone-800 text-white shadow-md"
                  : "hover:bg-stone-100 text-stone-700"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-body font-medium truncate leading-tight ${
                      selectedId === cafe.id ? "text-white" : "text-stone-800"
                    }`}
                  >
                    {cafe.name}
                  </p>
                  {cafe.district && (
                    <p
                      className={`text-xs flex items-center gap-0.5 mt-0.5 ${
                        selectedId === cafe.id
                          ? "text-stone-300"
                          : "text-stone-400"
                      }`}
                    >
                      <MapPin className="w-2.5 h-2.5 shrink-0" />
                      {cafe.district}
                    </p>
                  )}
                </div>
                <SunStatusBadge
                  status={cafe.sunStatus}
                  size="sm"
                  showLabel={false}
                />
              </div>

              {/* Sun score bar */}
              <div className="mt-2 h-1 bg-stone-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    cafe.sunStatus === "sunny"
                      ? "bg-sun-400"
                      : cafe.sunStatus === "partial"
                      ? "bg-partial-300"
                      : "bg-shade-300"
                  }`}
                  style={{ width: `${Math.round((1 - cafe.shadowScore) * 100)}%` }}
                />
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
