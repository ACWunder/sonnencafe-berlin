// src/components/Header.tsx
"use client";

import { Sun } from "lucide-react";
import type { TimeState } from "@/types";

interface HeaderProps {
  timeState: TimeState;
  onTimeChange: (t: TimeState) => void;
  onNowSunny: () => void;
  sunnyCount: number;
  totalCount: number;
}

export function Header({
  timeState,
  onTimeChange,
  onNowSunny,
  sunnyCount,
  totalCount,
}: HeaderProps) {
  return (
    <header className="bg-white border-b border-stone-200 px-4 py-3 flex items-center gap-4 shrink-0 z-10 shadow-sm">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-2">
        <div className="w-8 h-8 rounded-lg bg-sun-400 flex items-center justify-center shadow-sm">
          <Sun className="w-5 h-5 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="font-display font-bold text-stone-900 text-base leading-tight">
            SonnenCafé
          </h1>
          <p className="text-xs text-stone-400 font-body leading-tight">Wien</p>
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-8 bg-stone-200 hidden sm:block" />

      {/* Date input */}
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-stone-400 font-body hidden sm:block">Datum</label>
        <input
          type="date"
          value={timeState.date}
          onChange={(e) =>
            onTimeChange({ ...timeState, date: e.target.value })
          }
          className="text-sm font-body text-stone-700 border border-stone-200 rounded-lg px-2.5 py-1.5 bg-stone-50 focus:outline-none focus:ring-2 focus:ring-sun-300 focus:border-sun-400 transition-all"
        />
      </div>

      {/* Time input */}
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-stone-400 font-body hidden sm:block">Uhrzeit</label>
        <input
          type="time"
          value={timeState.time}
          onChange={(e) =>
            onTimeChange({ ...timeState, time: e.target.value })
          }
          className="text-sm font-body text-stone-700 border border-stone-200 rounded-lg px-2.5 py-1.5 bg-stone-50 focus:outline-none focus:ring-2 focus:ring-sun-300 focus:border-sun-400 transition-all"
        />
      </div>

      {/* Divider */}
      <div className="w-px h-8 bg-stone-200 hidden sm:block" />

      {/* Quick action */}
      <button
        onClick={onNowSunny}
        className="flex items-center gap-1.5 bg-sun-400 hover:bg-sun-500 text-white text-sm font-body font-medium px-3 py-1.5 rounded-lg transition-all shadow-sm hover:shadow active:scale-95"
      >
        <Sun className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Jetzt sonnige Cafés</span>
        <span className="sm:hidden">Jetzt</span>
      </button>

      {/* Stats */}
      {totalCount > 0 && (
        <div className="ml-auto text-xs text-stone-400 font-body hidden lg:flex items-center gap-1">
          <span className="text-sun-500 font-medium">{sunnyCount}</span>
          <span>von</span>
          <span className="font-medium text-stone-600">{totalCount}</span>
          <span>sonnig</span>
        </div>
      )}
    </header>
  );
}
