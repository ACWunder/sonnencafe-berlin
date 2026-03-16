# ☀️ SonnenCafé Wien

**Finde Cafés und Spots in Wien, die genau jetzt oder zur gewünschten Uhrzeit in der Sonne liegen.**

Eine interaktive Web-App mit Karte, Sonnenstandberechnung und Schatten-Heuristik – vollständig kostenlos und mit Open-Source-Tools.

---

## Screenshots

- Karte von Wien mit farbigen Markern (sonnig = orange/gelb, schattig = grau)
- Linke Sidebar mit Filter und Café-Liste
- Detail-Panel beim Klick auf einen Spot

---

## Installation

### Voraussetzungen

- Node.js >= 18
- npm >= 9

### Setup

```bash
git clone https://github.com/dein-user/sonnencafe-wien.git
cd sonnencafe-wien
npm install
npm run dev
```

Die App ist dann erreichbar unter: **http://localhost:3000**

---

## Verwendete Bibliotheken

| Library | Zweck |
|--------|-------|
| [Next.js 14](https://nextjs.org/) | React Framework, App Router, API Routes |
| [TypeScript](https://www.typescriptlang.org/) | Typsicherheit |
| [Tailwind CSS](https://tailwindcss.com/) | Utility-first Styling |
| [Leaflet](https://leafletjs.com/) + [react-leaflet](https://react-leaflet.js.org/) | Interaktive Karte (OSM-Tiles) |
| [SunCalc](https://github.com/mourner/suncalc) | Sonnenstand-Berechnung (Azimut + Höhe) |
| [date-fns](https://date-fns.org/) | Datum-Formatierung |
| [lucide-react](https://lucide.dev/) | Icons |
| [OpenStreetMap / Overpass API](https://overpass-api.de/) | POI-Daten (Cafés, Restaurants, Bars) |

**Keine kostenpflichtigen APIs. Keine Google Maps.**

---

## Projektstruktur

```
sonnencafe-wien/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── cafes/
│   │   │       └── route.ts          # Next.js API-Route, cached Overpass-Proxy
│   │   ├── globals.css               # Globale Styles, Leaflet-Overrides, Fonts
│   │   ├── layout.tsx                # Root Layout, Metadata
│   │   └── page.tsx                  # Hauptseite, State-Management
│   ├── components/
│   │   ├── Header.tsx                # Titel, Datum/Uhrzeit-Picker, Quick-Action
│   │   ├── FilterBar.tsx             # Filter: nur sonnig, Typ, Sortierung
│   │   ├── CafeList.tsx              # Scrollbare Liste der Cafés
│   │   ├── MapView.tsx               # Leaflet-Karte, Marker, Legende
│   │   ├── CafeDetailPanel.tsx       # Detail-Panel bei Klick auf Spot
│   │   ├── SunStatusBadge.tsx        # Wiederverwendbares Status-Badge
│   │   ├── LoadingState.tsx          # Ladeanimation
│   │   └── ErrorBanner.tsx           # Fehlermeldung
│   ├── lib/
│   │   ├── overpass.ts               # Overpass-Query-Builder und -Fetcher
│   │   ├── sun.ts                    # SunCalc-Wrapper: Position, Zeiten
│   │   ├── shadow.ts                 # Schatten-Heuristik: Score → Status
│   │   └── fallback-cafes.ts         # Beispieldaten für Offline/API-Ausfall
│   └── types/
│       └── index.ts                  # Alle TypeScript-Typen
├── public/
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

---

## Funktionen

### ✅ Implementiert

- **Interaktive Karte** (Leaflet + OpenStreetMap-Tiles), initaler Fokus auf Wien Bezirke 1–9
- **Café-Daten aus Overpass API** (amenity=cafe, restaurant, bar)
- **Sonnenstandberechnung** mit SunCalc (Azimut, Höhe, Sonnenauf-/-untergang)
- **Schatten-Heuristik** für städtische Umgebung (Gebäudehöhe × Straßenbreite × Richtungsfaktor)
- **Status**: Sonnig / Teilweise sonnig / Schattig
- **Filter**: nur sonnige Spots, Typ-Filter, Sortierung (sonnig zuerst, Name, Entfernung)
- **Zeitsteuerung**: Datum + Uhrzeit wählbar, Standard = jetzt
- **URL-Parameter**: `?date=2024-07-15&time=16:00&sunny=1`
- **„Jetzt sonnige Cafés"**-Button
- **Detail-Panel** mit Sonnenstand, Azimut, Auf-/Untergangszeiten
- **Fallback-Daten** wenn Overpass API temporär nicht erreichbar
- **Caching** der Overpass-Anfragen (1h in-memory + Next.js revalidate)
- **Fehlerbehandlung** + Loading States + leere Zustände

---

## Schatten-Heuristik (Wie funktioniert sie?)

Da exakte 3D-Schattenberechnung sehr aufwändig ist, nutzt der MVP eine **praktikable Näherung**:

1. **Sonnenstand** (Höhe in Grad über dem Horizont): Je tiefer die Sonne, desto mehr Schatten.
2. **Kritischer Schattenwinkel**: `arctan(Gebäudehöhe / Straßenbreite)` – wenn die Sonne flacher einfällt als dieser Winkel, liegt man im Schatten.
3. **Gebäudehöhe**: 18m für den 1. Bezirk, 14m für dichte Innenstadtbezirke, 10m weiter außen.
4. **Straßenrichtung**: In Wien ist das Straßennetz grob N–S / O–W ausgerichtet. Je nach Azimut der Sonne wird ein Richtungsfaktor angewendet.
5. **Kombination**: Höhenfaktor (55%) + Richtungsfaktor × Dichte (45%) → Score 0–1 → Status.

**Score 0–0.3** → ☀️ Sonnig  
**Score 0.3–0.65** → ⛅ Teilweise sonnig  
**Score 0.65–1.0** → 🌥️ Schattig

---

## Mögliche nächste Schritte

### 3D-Gebäudedaten für Wien einbinden

Wien bietet exzellente Open-Government-Data-Quellen:

#### Option A: Wien OGD 3D-Gebäudemodell
- **Quelle**: https://www.data.gv.at/katalog/dataset/3d-gebaeudemodell-lod2-wien
- **Format**: CityGML / LOD2 (enthält echte Gebäudehöhen)
- **Einbindung**: Parsen der LOD2-Daten, Gebäude um jeden Café-Spot abfragen, exakte Schattenberechnung mit Ray-Casting

#### Option B: OpenStreetMap building:height Tags
- Viele Wiener Gebäude haben `building:height` oder `building:levels` in OSM
- Overpass-Query: `way["building"]["building:height"](around:100,lat,lng)`
- Bereits in `src/lib/overpass.ts` vorbereitet

#### Option C: Mapbox GL / Deck.gl mit 3D-Gebäuden
- Für echte 3D-Visualisierung: MapLibre GL JS + 3D-Gebäude-Layer
- Würde den Tile-Layer durch einen 3D-Render ersetzen

### Weitere Features
- [ ] Benutzerstandort (GPS) als Ausgangspunkt
- [ ] Notification/Alert wenn ein Lieblingsspot sonnig wird
- [ ] Tagesvorschau: Sonnengang-Timeline für einen Spot
- [ ] PWA / Mobile App
- [ ] Service Worker für Offline-Betrieb
- [ ] Echte Gebäude-Polygon-Abfrage via Overpass (around:50m)
- [ ] Wiener Gastgärten-Datenbank (tourism=outdoor_seating)

---

## Lizenz

MIT – frei verwendbar und erweiterbar.
