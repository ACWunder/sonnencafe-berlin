// Run with: node scripts/fetch-buildings.mjs
// Fetches all buildings for the district bbox and saves to public/buildings-cache.json

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const BBOX = "52.4546381,13.3362902,52.5585856,13.4721073"; // Mitte, Kreuzberg, Prenzlauer Berg, Schöneberg

const query = `
[out:json][timeout:60];
(
  way["building"](${BBOX});
  relation["building"](${BBOX});
);
out body;
>;
out skel qt;
`.trim();

function assembleRing(wayIds, wayNodes, nodeCoords) {
  const segments = wayIds.map((id) => wayNodes.get(id) ?? []).filter((s) => s.length >= 2);
  if (segments.length === 0) return [];
  if (segments.length === 1) {
    return segments[0].map((id) => nodeCoords.get(id)).filter(Boolean);
  }
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

function parseHeight(tags) {
  if (tags?.height) {
    const h = parseFloat(String(tags.height));
    if (!isNaN(h) && h > 0) return h;
  }
  if (tags?.["building:levels"]) {
    const levels = parseFloat(String(tags["building:levels"]));
    if (!isNaN(levels) && levels > 0) return Math.round(levels * 3.2);
  }
  return 18;
}

console.log("Fetching buildings from Overpass...");
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

const buildings = [];
for (const el of data.elements) {
  if (el.type === "way" && el.tags?.building) {
    const polygon = el.nodes.map((id) => nodeCoords.get(id)).filter(Boolean);
    if (polygon.length >= 3) buildings.push({ id: el.id, polygon, height: parseHeight(el.tags) });
  } else if (el.type === "relation" && el.tags?.building) {
    const outerWayIds = (el.members ?? [])
      .filter((m) => m.type === "way" && m.role === "outer")
      .map((m) => m.ref);
    if (outerWayIds.length === 0) continue;
    const polygon = assembleRing(outerWayIds, wayNodes, nodeCoords);
    if (polygon.length >= 3) buildings.push({ id: el.id, polygon, height: parseHeight(el.tags) });
  }
}

import { writeFileSync, mkdirSync } from "fs";
mkdirSync("public", { recursive: true });
writeFileSync("public/buildings-cache.json", JSON.stringify({ buildings, bbox: BBOX, generated: new Date().toISOString() }));
console.log(`✓ Saved ${buildings.length} buildings to public/buildings-cache.json`);
