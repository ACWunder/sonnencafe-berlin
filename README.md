# ☀️ Sonnencafe Wien

**Welches Café in Wien liegt gerade in der Sonne?**

Sonnencafe Wien berechnet in Echtzeit, welche Cafés im 6., 7. und 8. Bezirk gerade in der Sonne liegen – basierend auf echten Gebäudedaten aus OpenStreetMap und präziser Schattenberechnung für jede Uhrzeit und jeden Tag.

🌐 **[sonnencafe-wien.vercel.app](https://sonnencafe-wien.vercel.app)**

---

## Features

- **Echtzeit-Schattenberechnung** — Gebäudepolygone aus OSM werden mit dem aktuellen Sonnenstand (Azimut + Höhe via SunCalc) zu Schattenpolygonen projiziert
- **Echte Gebäudehöhen** — aus OSM-Tags (`height`, `building:levels`), Fallback 18 m
- **Café-Daten live** — Overpass API mit `amenity=cafe`, `shop=coffee` und Kaffeehaus-Restaurants
- **Sonnenstunden pro Café** — wie lange liegt ein Café noch in der Sonne? (bis zu 4 h voraus, 10-Minuten-Schritte)
- **Tages-Zeitstrahl** — visueller Balken von Sonnenaufgang bis -untergang für jedes Café
- **Zeitreise** — Datum und Uhrzeit frei wählbar
- **PWA** — als App installierbar (iOS & Android), inkl. Install-Banner mit Anleitung
- **Mobile-optimiert** — Hamburger-Sidebar, Google-Maps-Style Café-Karte, Touch-Gesten (wischen zum Schließen)

---

## Wie funktioniert die Schattenberechnung?

```
Sonnenstand (SunCalc)
    → Azimut + Höhenwinkel
    → Schattenvektor pro Gebäude
    → Konvexe Hülle des projizierten Schattenpolygons
    → Ray-Casting: liegt der Café-Punkt im Schatten?
```

1. Für jeden Zeitschritt wird der Sonnenstand (Azimut, Höhe) berechnet
2. Jedes Gebäude aus OSM wird mit seiner Höhe entlang des Sonnenvektors projiziert
3. Das entstandene Schattenpolygon wird mit dem Monotone-Chain-Algorithmus zur konvexen Hülle
4. Per Ray-Casting-Test wird geprüft, ob ein Café-Punkt (10 m in Sonnenrichtung versetzt) im Schatten liegt
5. Das passiert für alle Cafés in 15er-Chunks (nicht-blockierend) und für den ganzen Tag (20-Minuten-Slots)

---

## Tech Stack

| | |
|---|---|
| **Framework** | [Next.js 14](https://nextjs.org/) — App Router, API Routes, ImageResponse |
| **Karte** | [Leaflet](https://leafletjs.com/) mit benutzerdefinierten SVG-Panes |
| **Tiles** | [CARTO Light](https://carto.com/basemaps/) via OpenStreetMap |
| **Gebäude & Cafés** | [Overpass API](https://overpass-api.de/) (OSM) |
| **Astronomie** | [SunCalc](https://github.com/mourner/suncalc) |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/), Playfair Display + DM Sans |
| **Icons** | [Lucide](https://lucide.dev/) |
| **Hosting** | [Vercel](https://vercel.com/) |

Keine kostenpflichtigen APIs. Kein Google Maps. Alles Open Source.

---

## Lokale Entwicklung

```bash
git clone https://github.com/ACWunder/sonnencafe-wien.git
cd sonnencafe-wien
npm install
npm run dev
```

→ [http://localhost:3000](http://localhost:3000)

---

## Projektstruktur

```
src/
├── app/
│   ├── api/
│   │   ├── cafes/route.ts       # Overpass-Proxy für Cafés (1h Cache)
│   │   └── buildings/route.ts   # Overpass-Proxy für Gebäude (bbox-basiert)
│   ├── icon.tsx                 # App-Icon (PNG via ImageResponse)
│   ├── apple-icon.tsx           # iOS Home-Screen-Icon (180×180)
│   ├── manifest.ts              # PWA Manifest
│   ├── layout.tsx               # Meta-Tags, PWA, Open Graph
│   └── page.tsx                 # Hauptseite + alle UI-Komponenten
├── components/
│   ├── MapView.tsx              # Leaflet-Karte, Schatten, Marker, Kompass
│   └── InstallBanner.tsx        # "Zum Home-Bildschirm" Anleitung (iOS/Android)
└── lib/
    ├── overpass.ts              # Overpass-Query-Builder
    ├── buildingShadow.ts        # Schattenpolygon + konvexe Hülle (Monotone Chain)
    ├── sun.ts                   # SunCalc-Wrapper
    └── fallback-cafes.ts        # Fallback-Daten bei API-Ausfall
```

---

## Abgedecktes Gebiet

Wiener Bezirke **6 (Mariahilf)**, **7 (Neubau)** und **8 (Josefstadt)** — das dichteste Café-Viertel der Stadt.

```
Bounding Box: 48.1883°N – 48.2154°N  /  16.3369°E – 16.3660°E
```

---

## Lizenz

MIT
