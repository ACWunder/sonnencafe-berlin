// Run with: node scripts/split-buildings.mjs
// Splits public/buildings-cache.json into one file per district.
// Each building whose centroid falls within the district's rectangular bbox
// (matching DISTRICT_CONFIG in MapView.tsx) is included in that district's file.
// Buildings near bbox edges are included in BOTH adjacent files for shadow accuracy.

import { readFileSync, writeFileSync } from "fs";

// These bounds must match DISTRICT_CONFIG in src/components/MapView.tsx exactly.
const DISTRICTS = [
  { name: "Mitte",           file: "buildings-mitte.json",          south: 52.499, west: 13.361, north: 52.545, east: 13.434 },
  { name: "Kreuzberg",       file: "buildings-kreuzberg.json",       south: 52.478, west: 13.363, north: 52.514, east: 13.458 },
  { name: "Prenzlauer Berg", file: "buildings-prenzlauer-berg.json", south: 52.515, west: 13.392, north: 52.564, east: 13.477 },
  { name: "Schöneberg",      file: "buildings-schoeneberg.json",     south: 52.450, west: 13.331, north: 52.510, east: 13.382 },
];

console.log("Reading buildings-cache.json …");
const { buildings } = JSON.parse(readFileSync("public/buildings-cache.json", "utf8"));
console.log(`Total buildings: ${buildings.length}`);

const buckets = Object.fromEntries(DISTRICTS.map(d => [d.name, []]));

for (const building of buildings) {
  const pts = building.polygon;
  let cLat = 0, cLng = 0;
  for (const [lat, lng] of pts) { cLat += lat; cLng += lng; }
  cLat /= pts.length;
  cLng /= pts.length;

  for (const d of DISTRICTS) {
    if (cLat >= d.south && cLat <= d.north && cLng >= d.west && cLng <= d.east) {
      buckets[d.name].push(building);
    }
  }
}

for (const d of DISTRICTS) {
  const list = buckets[d.name];
  writeFileSync(
    `public/${d.file}`,
    JSON.stringify({ buildings: list, district: d.name, generated: new Date().toISOString() }),
  );
  console.log(`✓ ${d.name}: ${list.length} buildings → public/${d.file}`);
}
