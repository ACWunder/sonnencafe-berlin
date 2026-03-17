// src/app/page.tsx
"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { format } from "date-fns";
import { Sun, Search, MapPin, X, ExternalLink, Info, Menu } from "lucide-react";
import type { Cafe, TimeState, SunTimeline, SunTimelineData } from "@/types";
import { MapView } from "@/components/MapView";
import { InstallBanner } from "@/components/InstallBanner";

export default function Home() {
  const [timeState, setTimeState] = useState<TimeState>(() => {
    const now = new Date();
    return { date: format(now, "yyyy-MM-dd"), time: format(now, "HH:mm") };
  });

  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [selectedCafe, setSelectedCafe] = useState<Cafe | null>(null);
  const [search, setSearch] = useState("");
  const [sunRemaining, setSunRemaining] = useState<Record<string, number | null>>({});
  const [sunTimelines, setSunTimelines] = useState<SunTimelineData>({});
  const listRef = useRef<HTMLUListElement>(null);

  const [showImpressum, setShowImpressum] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const cardDragStartY = useRef(0);

  const handleSunRemaining = useCallback((data: Record<string, number | null>) => {
    setSunRemaining(data);
  }, []);

  const handleSunTimeline = useCallback((data: SunTimelineData) => {
    setSunTimelines(data);
  }, []);

  useEffect(() => {
    if (!selectedCafe || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-cafe-id="${selectedCafe.id}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedCafe]);

  useEffect(() => {
    fetch("/api/cafes")
      .then((r) => r.json())
      .then((d) => setCafes(d.cafes ?? []))
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? cafes.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.address?.toLowerCase().includes(q) ||
            c.district?.toLowerCase().includes(q)
        )
      : cafes;

    return [...list].sort((a, b) => {
      const ma = sunRemaining[a.id] ?? -1;
      const mb = sunRemaining[b.id] ?? -1;
      return mb - ma;
    });
  }, [cafes, search, sunRemaining]);

  const currentMinute = (() => {
    const [h, m] = timeState.time.split(":").map(Number);
    return h * 60 + m;
  })();

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#f7f6f3]">
      <InstallBanner />

      {/* ── Header ── */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-zinc-100 px-3 py-2 flex items-center gap-2 shrink-0 z-10 overflow-hidden">
        {/* Brand */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-[8px] bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm shadow-amber-200">
            <Sun className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="font-display font-bold text-zinc-900 text-[13px] leading-none tracking-tight whitespace-nowrap">
            Sonnencafe Wien
          </h1>
        </div>

        <div className="w-px h-4 bg-zinc-100 mx-0.5 shrink-0" />

        {/* Date — styled pill, native picker underneath */}
        <label className="relative cursor-pointer group shrink-0">
          <div className="text-[11px] font-body text-zinc-600 border border-zinc-200 rounded-[8px] px-2.5 py-1 bg-zinc-50/80 group-hover:bg-amber-50/60 group-hover:border-amber-200 transition-all select-none whitespace-nowrap">
            {(() => {
              const d = new Date(timeState.date + "T12:00");
              return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}.`;
            })()}
          </div>
          <input
            type="date"
            value={timeState.date}
            onChange={(e) => setTimeState((s) => ({ ...s, date: e.target.value }))}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </label>

        {/* Time — styled pill, native picker underneath */}
        <label className="relative cursor-pointer group shrink-0">
          <div className="text-[11px] font-body text-zinc-600 border border-zinc-200 rounded-[8px] px-2.5 py-1 bg-zinc-50/80 group-hover:bg-amber-50/60 group-hover:border-amber-200 transition-all select-none tabular-nums">
            {timeState.time}
          </div>
          <input
            type="time"
            value={timeState.time}
            onChange={(e) => setTimeState((s) => ({ ...s, time: e.target.value }))}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </label>

        {/* Now */}
        <button
          onClick={() => {
            const now = new Date();
            setTimeState({ date: format(now, "yyyy-MM-dd"), time: format(now, "HH:mm") });
          }}
          className="text-[11px] font-body font-semibold bg-gradient-to-br from-amber-400 to-orange-400 hover:from-amber-500 hover:to-orange-500 text-white rounded-[8px] transition-all shadow-sm shadow-amber-200/60 active:scale-95 shrink-0 px-2.5 py-1"
        >
          Now
        </button>

        <button
          onClick={() => setShowImpressum(true)}
          className="ml-auto text-zinc-300 hover:text-zinc-500 transition-colors p-1 shrink-0"
          title="Impressum"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </header>

      {/* Impressum modal */}
      {showImpressum && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center px-6"
          onClick={() => setShowImpressum(false)}
        >
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl shadow-2xl shadow-zinc-300/50 border border-zinc-100 p-6 max-w-xs w-full cafe-card-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-bold text-zinc-900 text-[15px]">Impressum</h2>
              <button
                onClick={() => setShowImpressum(false)}
                className="w-6 h-6 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-400 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2 text-[13px] font-body text-zinc-600">
              <p className="font-semibold text-zinc-900">Sonnencafe Wien</p>
              <p className="text-zinc-400 text-[12px] leading-relaxed">
                Ein privates Projekt zur Visualisierung von Sonnenstunden an Wiener Cafés.
              </p>
              <div className="pt-2 border-t border-zinc-50">
                <p className="text-[11px] text-zinc-400 mb-1 uppercase tracking-wide font-medium">Kontakt</p>
                <a
                  href="mailto:arthur.wunder@web.de"
                  className="text-amber-500 hover:text-amber-600 transition-colors"
                >
                  arthur.wunder@web.de
                </a>
              </div>
              <div className="pt-2 border-t border-zinc-50 space-y-0.5">
                <p className="text-[11px] text-zinc-400 uppercase tracking-wide font-medium mb-1">Datenquellen</p>
                <p className="text-[11px] text-zinc-400">
                  Kartendaten ©{" "}
                  <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="text-amber-500 hover:text-amber-600">OpenStreetMap</a>
                  {" "}-Mitwirkende
                </p>
                <p className="text-[11px] text-zinc-400">
                  Kartenstil ©{" "}
                  <a href="https://carto.com/" target="_blank" rel="noopener noreferrer" className="text-amber-500 hover:text-amber-600">CARTO</a>
                </p>
                <p className="text-[11px] text-zinc-400">
                  Kartenrendering via{" "}
                  <a href="https://maplibre.org" target="_blank" rel="noopener noreferrer" className="text-amber-500 hover:text-amber-600">MapLibre GL JS</a>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile slide-in sidebar ── */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-[9998] flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onTouchEnd={(e) => { e.preventDefault(); setSidebarOpen(false); }}
            onClick={() => setSidebarOpen(false)}
          />
          {/* Panel */}
          <div
            className="relative flex flex-col bg-white h-full shadow-2xl"
            style={{ width: "min(85vw, 340px)" }}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-[7px] bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                  <Sun className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
                </div>
                <span className="font-display font-bold text-zinc-900 text-[13px]">Sonnencafe Wien</span>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="w-7 h-7 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-400 hover:text-zinc-600 transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Search */}
            <div className="px-3 pt-3 pb-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-300 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Café suchen…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-base font-body text-zinc-700 rounded-xl bg-zinc-50 border border-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-300 transition-all placeholder:text-zinc-300"
                />
              </div>
              <p className="text-[10px] text-zinc-300 mt-1.5 font-body px-0.5">
                {filtered.length} {filtered.length === 1 ? "Café" : "Cafés"}
                {search && ` · „${search}"`}
              </p>
            </div>

            {/* Cafe list */}
            <ul className="flex-1 overflow-y-auto">
              {filtered.length === 0 && (
                <li className="p-6 text-[13px] text-zinc-300 font-body text-center">Keine Ergebnisse</li>
              )}
              {filtered.map((cafe) => {
                const isSelected = selectedCafe?.id === cafe.id;
                const mins = sunRemaining[cafe.id];
                const isSunny = mins !== null && mins !== undefined;
                const timeline = sunTimelines[cafe.id];
                return (
                  <li key={cafe.id}>
                    <button
                      onClick={() => {
                        setSelectedCafe(isSelected ? null : cafe);
                        setSidebarOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2.5 transition-all duration-150 border-l-2 ${
                        isSelected ? "bg-amber-50/60 border-amber-400" : "border-transparent hover:bg-zinc-50"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 transition-colors duration-300 ${isSunny ? "bg-orange-400" : "bg-zinc-200"}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className={`text-[13px] font-body leading-snug truncate transition-colors ${isSelected ? "font-semibold text-zinc-900" : "text-zinc-700"}`}>
                              {cafe.name}
                            </p>
                            {isSunny && (
                              <span className="text-[10px] font-body font-medium text-orange-400 shrink-0">
                                {mins! >= 240 ? ">4h ☀" : mins! >= 60 ? `${Math.floor(mins! / 60)}h${mins! % 60 > 0 ? `${mins! % 60}m` : ""} ☀` : `${mins}m ☀`}
                              </span>
                            )}
                          </div>
                          {(cafe.address || cafe.district) && (
                            <p className="text-[11px] text-zinc-400 font-body mt-0.5 truncate">
                              {cafe.address || cafe.district}
                            </p>
                          )}
                          {timeline && (
                            <SunTimelineBar timeline={timeline} currentMinute={currentMinute} isSunny={isSunny} />
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* ── Single layout: sidebar (desktop) + map + bottom sheet (mobile) ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Desktop sidebar — hidden on mobile */}
        <aside className="hidden md:flex w-80 shrink-0 flex-col bg-white overflow-hidden" style={{ boxShadow: '1px 0 0 0 #f4f4f5, 4px 0 16px 0 rgba(0,0,0,0.03)' }}>
          {selectedCafe && (
            <SelectedCafeCard
              key={selectedCafe.id}
              cafe={selectedCafe}
              mins={sunRemaining[selectedCafe.id]}
              timeline={sunTimelines[selectedCafe.id]}
              currentMinute={currentMinute}
              onClose={() => setSelectedCafe(null)}
            />
          )}
          <div className="px-3 pt-3 pb-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-300 pointer-events-none" />
              <input
                type="text"
                placeholder="Café suchen…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-[13px] font-body text-zinc-700 rounded-xl bg-zinc-50 border border-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-300 transition-all placeholder:text-zinc-300"
              />
            </div>
            <p className="text-[10px] text-zinc-300 mt-1.5 font-body px-0.5">
              {filtered.length} {filtered.length === 1 ? "Café" : "Cafés"}
              {search && ` · „${search}"`}
            </p>
          </div>
          <ul ref={listRef} className="flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <li className="p-6 text-[13px] text-zinc-300 font-body text-center">Keine Ergebnisse</li>
            )}
            {filtered.map((cafe) => {
              const isSelected = selectedCafe?.id === cafe.id;
              const mins = sunRemaining[cafe.id];
              const isSunny = mins !== null && mins !== undefined;
              const timeline = sunTimelines[cafe.id];
              return (
                <li key={cafe.id} data-cafe-id={cafe.id}>
                  <button
                    onClick={() => setSelectedCafe(isSelected ? null : cafe)}
                    className={`w-full text-left px-3 py-2.5 transition-all duration-150 border-l-2 ${
                      isSelected ? "bg-amber-50/60 border-amber-400" : "border-transparent hover:bg-zinc-50"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 transition-colors duration-300 ${isSunny ? "bg-orange-400" : "bg-zinc-200"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className={`text-[13px] font-body leading-snug truncate transition-colors ${isSelected ? "font-semibold text-zinc-900" : "text-zinc-700"}`}>
                            {cafe.name}
                          </p>
                          {isSunny && (
                            <span className="text-[10px] font-body font-medium text-orange-400 shrink-0">
                              {mins! >= 240 ? ">4h ☀" : mins! >= 60 ? `${Math.floor(mins! / 60)}h${mins! % 60 > 0 ? `${mins! % 60}m` : ""} ☀` : `${mins}m ☀`}
                            </span>
                          )}
                        </div>
                        {(cafe.address || cafe.district) && (
                          <p className="text-[11px] text-zinc-400 font-body mt-0.5 truncate">
                            {cafe.address || cafe.district}
                          </p>
                        )}
                        {timeline && (
                          <SunTimelineBar timeline={timeline} currentMinute={currentMinute} isSunny={isSunny} />
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Map — always rendered once */}
        <main className="flex-1 relative overflow-hidden">
          <MapView
            timeState={timeState}
            cafes={cafes}
            selectedCafe={selectedCafe}
            onCafeSelect={setSelectedCafe}
            onSunRemaining={handleSunRemaining}
            onSunTimeline={handleSunTimeline}
          />

          {/* Hamburger — floating below app icon, mobile only */}
          <button
            onClick={() => { setSidebarOpen(true); setSelectedCafe(null); }}
            className="md:hidden absolute top-3 left-3 z-[500] w-9 h-9 bg-white/90 backdrop-blur-xl rounded-2xl border border-zinc-100 shadow-lg shadow-zinc-200/40 flex items-center justify-center text-zinc-500 active:scale-95 transition-all"
          >
            <Menu className="w-4 h-4" />
          </button>

          {/* Mobile: floating cafe card — fixed, right-aligned, same bottom as legend */}
          {selectedCafe && (
            <div
              className="md:hidden fixed z-[9999] mobile-cafe-card-enter"
              style={{ bottom: "12px", right: 0, width: "260px" }}
              onTouchStart={(e) => { cardDragStartY.current = e.touches[0].clientY; }}
              onTouchEnd={(e) => {
                const dy = e.changedTouches[0].clientY - cardDragStartY.current;
                if (dy > 60) setSelectedCafe(null);
              }}
            >
              <SelectedCafeCard
                key={selectedCafe.id}
                cafe={selectedCafe}
                mins={sunRemaining[selectedCafe.id]}
                timeline={sunTimelines[selectedCafe.id]}
                currentMinute={currentMinute}
                onClose={() => setSelectedCafe(null)}
              />
            </div>
          )}

        </main>
      </div>
    </div>
  );
}

// ─── Selected cafe card ───────────────────────────────────────────────────────
function SelectedCafeCard({
  cafe,
  mins,
  timeline,
  currentMinute,
  onClose,
}: {
  cafe: Cafe;
  mins: number | null | undefined;
  timeline?: SunTimeline;
  currentMinute: number;
  onClose: () => void;
}) {
  const isSunny = mins !== null && mins !== undefined;
  const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(cafe.name + ", Wien")}/@${cafe.lat},${cafe.lng},17z`;

  // Find next sunny time from timeline
  let nextSunMinute: number | null = null;
  if (!isSunny && timeline) {
    const { inSun, startMinute, intervalMin } = timeline;
    for (let i = 0; i < inSun.length; i++) {
      const slotMin = startMinute + i * intervalMin;
      if (slotMin > currentMinute && inSun[i]) {
        nextSunMinute = slotMin;
        break;
      }
    }
  }

  const sunLabel = isSunny
    ? mins! >= 240
      ? "Noch über 4h Sonne"
      : mins! >= 60
      ? `Noch ${Math.floor(mins! / 60)}h ${mins! % 60}min Sonne`
      : `Noch ${mins}min Sonne`
    : nextSunMinute !== null
    ? `Im Schatten · ☀ ab ${fmtMin(nextSunMinute)}`
    : "Aktuell im Schatten";

  return (
    <div className="m-3 rounded-2xl overflow-hidden border border-zinc-100 shadow-xl shadow-zinc-200/40 shrink-0 bg-white cafe-card-enter">

      {/* Card header */}
      <div className={`px-4 pt-4 pb-3.5 ${isSunny
        ? "bg-gradient-to-br from-amber-50 via-orange-50/60 to-white"
        : "bg-gradient-to-br from-zinc-50 to-white"}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="font-display font-bold text-zinc-900 text-[15px] leading-tight">
              {cafe.name}
            </h2>
            {(cafe.address || cafe.district) && (
              <div className="flex items-center gap-1 mt-1">
                <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
                <p className="text-[11px] text-zinc-500 font-body leading-none">
                  {cafe.address || cafe.district}
                </p>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-12 h-12 -m-3 rounded-full flex items-center justify-center shrink-0 mt-0.5 group"
          >
            <span className="w-6 h-6 rounded-full bg-white/80 group-hover:bg-zinc-100 border border-zinc-100 flex items-center justify-center text-zinc-400 group-hover:text-zinc-600 transition-all">
              <X className="w-3 h-3" />
            </span>
          </button>
        </div>

        {/* Sun pill */}
        <div className={`inline-flex items-center gap-1.5 mt-2.5 px-2.5 py-1 rounded-full text-[11px] font-body font-medium ${
          isSunny
            ? "bg-orange-100/80 text-orange-600"
            : "bg-zinc-100 text-zinc-500"
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${isSunny ? "bg-orange-400 sun-pulse" : "bg-zinc-400"}`} />
          {sunLabel}
        </div>
      </div>

      {/* Sun timeline */}
      {timeline && (
        <div className="px-4 pb-3 pt-1">
          <p className="text-[9px] font-body text-zinc-400 uppercase tracking-widest mb-1.5" style={{ fontWeight: 700 }}>Heute</p>
          <SunTimelineBar timeline={timeline} currentMinute={currentMinute} isSunny={isSunny} thick />
        </div>
      )}

      {/* Card footer */}
      <div className="px-3 py-2.5 border-t border-zinc-50">
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full text-[12px] font-body font-medium text-zinc-500 hover:text-zinc-700 bg-zinc-50 hover:bg-zinc-100 border border-zinc-100 rounded-xl px-3 py-2 transition-all active:scale-[0.98]"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          In Google Maps öffnen
        </a>
      </div>
    </div>
  );
}

// ─── Sun timeline bar ─────────────────────────────────────────────────────────
function fmtMin(minute: number) {
  return `${Math.floor(minute / 60).toString().padStart(2, "0")}:${(minute % 60).toString().padStart(2, "0")}`;
}

function buildSunGradient(inSun: boolean[]): string {
  if (inSun.length === 0) return "#e4e4e7";
  const stops: string[] = [];
  inSun.forEach((sunny, i) => {
    const p1 = ((i / inSun.length) * 100).toFixed(1);
    const p2 = (((i + 1) / inSun.length) * 100).toFixed(1);
    const color = sunny ? "#fb923c" : "#e4e4e7";
    stops.push(`${color} ${p1}%`, `${color} ${p2}%`);
  });
  return `linear-gradient(to right, ${stops.join(",")})`;
}

function SunTimelineBar({
  timeline,
  currentMinute,
  isSunny,
  thick = false,
}: {
  timeline: SunTimeline;
  currentMinute: number;
  isSunny: boolean;
  thick?: boolean;
}) {
  const { inSun, startMinute, intervalMin } = timeline;
  const totalMinutes = inSun.length * intervalMin;
  const endMinute = startMinute + totalMinutes;

  const nowFraction = Math.max(0, Math.min(1, (currentMinute - startMinute) / totalMinutes));
  const nowVisible = currentMinute >= startMinute && currentMinute <= endMinute;

  let nextSunMinute: number | null = null;
  if (!isSunny) {
    for (let i = 0; i < inSun.length; i++) {
      const slotMin = startMinute + i * intervalMin;
      if (slotMin > currentMinute && inSun[i]) {
        nextSunMinute = slotMin;
        break;
      }
    }
  }

  const barH = thick ? "4px" : "1px";
  const tickH = thick ? "12px" : "7px";
  const tickTop = thick ? "-4px" : "-3px";

  return (
    <div className="mt-2">
      <div className="relative rounded-full" style={{ height: barH, background: buildSunGradient(inSun) }}>
        {nowVisible && (
          <div
            className="absolute rounded-full bg-zinc-500"
            style={{
              width: "2px",
              height: tickH,
              top: tickTop,
              left: `${nowFraction * 100}%`,
              transform: "translateX(-50%)",
            }}
          />
        )}
      </div>
      <div className="flex items-center justify-between mt-0.5">
        <span className="text-zinc-300 font-body" style={{ fontSize: "9px" }}>{fmtMin(startMinute)}</span>
        {nextSunMinute !== null && (
          <span className="text-orange-400 font-body font-medium" style={{ fontSize: "9px" }}>
            ☀ {fmtMin(nextSunMinute)}
          </span>
        )}
        <span className="text-zinc-300 font-body" style={{ fontSize: "9px" }}>{fmtMin(endMinute)}</span>
      </div>
    </div>
  );
}
