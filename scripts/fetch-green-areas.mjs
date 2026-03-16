// Run with: node scripts/fetch-green-areas.mjs
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const BBOX = "48.175,16.333,48.230,16.375";

const query = `
[out:json][timeout:60];
(
  way["leisure"~"park|garden|pitch"](${BBOX});
  way["landuse"~"grass|meadow|park|cemetery|allotments"](${BBOX});
  way["natural"~"wood|scrub|heath|grassland"](${BBOX});
  relation["leisure"~"park|garden"](${BBOX});
  relation["landuse"~"grass|meadow|park"](${BBOX});
);
out body;
>;
out skel qt;
`.trim();

function assembleRing(wayIds, wayNodes, nodeCoords) {
  const segments = wayIds.map((id) => wayNodes.get(id) ?? []).filter((s) => s.length >= 2);
  if (segments.length === 0) return [];
  if (segments.length === 1) return segments[0].map((id) => nodeCoords.get(id)).filter(Boolean);
  const ring = [...segments[0]];
  const remaining = segments.slice(1);
  for (let iter = 0; iter < remaining.length * 2; iter++) {
    const tail = ring[ring.length - 1];
    const idx = remaining.findIndex((s) => s[0] === tail || s[s.length - 1] === tail);
    if (idx === -1) break;
    const seg = remaining.splice(idx, 1)[0];
    if (seg[0] === tail) ring.push(...seg.slice(1));
    else ring.push(...seg.slice(0, -1).reverse());
  }
  return ring.map((id) => nodeCoords.get(id)).filter(Boolean);
}

console.log("Fetching green areas from Overpass...");
const res = await fetch(OVERPASS_URL, {
  method: "POST",
  body: `data=${encodeURIComponent(query)}`,
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
});
if (!res.ok) throw new Error(`Overpass error: ${res.status}`);
const data = await res.json();
console.log(`Got ${data.elements.length} elements`);

const nodeCoords = new Map();
const wayNodes = new Map();
for (const el of data.elements) {
  if (el.type === "node") nodeCoords.set(el.id, [el.lat, el.lon]);
  else if (el.type === "way") wayNodes.set(el.id, el.nodes);
}

const areas = [];
for (const el of data.elements) {
  if (el.type === "way" && el.tags) {
    const polygon = (el.nodes ?? []).map((id) => nodeCoords.get(id)).filter(Boolean);
    if (polygon.length >= 3) areas.push({ id: el.id, polygon });
  } else if (el.type === "relation" && el.tags) {
    const outerWayIds = (el.members ?? []).filter((m) => m.type === "way" && m.role === "outer").map((m) => m.ref);
    if (outerWayIds.length === 0) continue;
    const polygon = assembleRing(outerWayIds, wayNodes, nodeCoords);
    if (polygon.length >= 3) areas.push({ id: el.id, polygon });
  }
}

import { writeFileSync } from "fs";
writeFileSync("public/green-areas-cache.json", JSON.stringify({ areas, bbox: BBOX, generated: new Date().toISOString() }));
console.log(`✓ Saved ${areas.length} green areas to public/green-areas-cache.json`);
