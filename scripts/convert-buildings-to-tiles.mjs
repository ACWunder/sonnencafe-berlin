#!/usr/bin/env node
// scripts/convert-buildings-to-tiles.mjs
// Converts Berlin's per-district building JSON files into Vienna-style tile files.
// Run: node scripts/convert-buildings-to-tiles.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const TILES_DIR  = path.join(PUBLIC_DIR, "tiles");

const TILE_LAT = 0.04;
const TILE_LNG = 0.06;

const DISTRICT_FILES = [
  "buildings-mitte.json",
  "buildings-kreuzberg.json",
  "buildings-prenzlauer-berg.json",
  "buildings-schoeneberg.json",
];

// Group buildings by tile key "r_c"
const tileMap = new Map(); // key → buildings[]

let totalBuildings = 0;

for (const filename of DISTRICT_FILES) {
  const filePath = path.join(PUBLIC_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`Warning: ${filename} not found, skipping.`);
    continue;
  }
  const { buildings } = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  console.log(`  ${filename}: ${buildings.length} buildings`);
  totalBuildings += buildings.length;

  for (const building of buildings) {
    const [lat, lng] = building.polygon[0];
    const r = Math.floor(lat / TILE_LAT);
    const c = Math.floor(lng / TILE_LNG);
    const key = `${r}_${c}`;

    if (!tileMap.has(key)) tileMap.set(key, []);
    tileMap.get(key).push(building);
  }
}

// Create tiles directory
if (!fs.existsSync(TILES_DIR)) {
  fs.mkdirSync(TILES_DIR, { recursive: true });
}

// Write tile files
let tilesCreated = 0;
for (const [key, buildings] of tileMap.entries()) {
  const outPath = path.join(TILES_DIR, `${key}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ buildings }));
  tilesCreated++;
}

console.log(`\nSummary:`);
console.log(`  Total buildings processed: ${totalBuildings}`);
console.log(`  Tiles created: ${tilesCreated}`);
console.log(`  Output directory: ${TILES_DIR}`);
console.log(`Done!`);
