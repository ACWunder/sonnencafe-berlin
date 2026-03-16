// src/components/FilterBar.tsx
"use client";

import { Sun, Coffee, SortAsc } from "lucide-react";
import type { FilterState } from "@/types";

interface FilterBarProps {
  filters: FilterState;
  onFilterChange: (f: FilterState) => void;
}

export function FilterBar({ filters, onFilterChange }: FilterBarProps) {
  const toggle = (key: keyof FilterState, value: unknown) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const toggleAmenity = (type: string) => {
    const current = filters.amenityTypes;
    if (current.includes(type)) {
      // Don't remove last one
      if (current.length === 1) return;
      toggle("amenityTypes", current.filter((t) => t !== type));
    } else {
      toggle("amenityTypes", [...current, type]);
    }
  };

  return (
    <div className="p-4 border-b border-stone-100 space-y-3">
      {/* Only sunny toggle */}
      <button
        onClick={() => toggle("onlySunny", !filters.onlySunny)}
        className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-body font-medium transition-all ${
          filters.onlySunny
            ? "bg-sun-100 text-sun-700 border border-sun-300 shadow-sm"
            : "bg-stone-50 text-stone-500 border border-stone-200 hover:border-stone-300"
        }`}
      >
        <Sun
          className={`w-4 h-4 ${filters.onlySunny ? "text-sun-500" : "text-stone-400"}`}
        />
        Nur sonnige Spots
        {filters.onlySunny && (
          <span className="ml-auto w-2 h-2 bg-sun-400 rounded-full" />
        )}
      </button>

      {/* Amenity types */}
      <div>
        <p className="text-xs text-stone-400 font-body mb-2 uppercase tracking-wide">
          Typ
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { id: "cafe", label: "Café", emoji: "☕" },
            { id: "restaurant", label: "Restaurant", emoji: "🍽️" },
            { id: "bar", label: "Bar", emoji: "🍷" },
          ].map(({ id, label, emoji }) => (
            <button
              key={id}
              onClick={() => toggleAmenity(id)}
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-all font-body ${
                filters.amenityTypes.includes(id)
                  ? "bg-stone-800 text-white border-stone-800"
                  : "bg-white text-stone-500 border-stone-200 hover:border-stone-400"
              }`}
            >
              <span>{emoji}</span>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Sort */}
      <div>
        <p className="text-xs text-stone-400 font-body mb-2 uppercase tracking-wide">
          Sortierung
        </p>
        <div className="flex gap-2">
          {[
            { id: "sunny", label: "Sonnig" },
            { id: "name", label: "Name" },
            { id: "distance", label: "Zentrum" },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() =>
                toggle("sortBy", id as FilterState["sortBy"])
              }
              className={`flex-1 text-xs py-1.5 px-2 rounded-lg border transition-all font-body ${
                filters.sortBy === id
                  ? "bg-stone-800 text-white border-stone-800"
                  : "bg-white text-stone-500 border-stone-200 hover:border-stone-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
