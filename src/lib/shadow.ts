// src/lib/shadow.ts
//
// MVP Shadow Heuristic for Berlin cafés
//
// Strategy:
//  1. If sun is below horizon → shady
//  2. If sun altitude very low (<5°) → mostly shady (urban canyons block it)
//  3. We estimate "urban canyon" blocking: if azimuth points roughly toward a
//     narrow street/building wall, shade is more likely.
//  4. We use a street-orientation proxy: in Berlin's grid, streets run roughly
//     N–S and E–W. Buildings shadow eastward in the morning, westward in the
//     afternoon, northward very little.
//  5. We add a "building density" factor. In Mitte and inner districts (dense),
//     we assume buildings of ~16m (5 floors). In outer areas ~10m.
//  6. Final score is a composite: 0 = full sun, 1 = full shade.
//
// This is intentionally a heuristic, not physics. It produces sensible
// and useful results.

import type { SunPosition, SunStatus } from "@/types";
import { getSunPosition } from "./sun";

// Average building height assumptions by rough zone
const DENSE_URBAN_HEIGHT = 18; // meters – Vienna Innere Stadt / Gründerzeit
const MEDIUM_URBAN_HEIGHT = 14; // meters
const STREET_WIDTH = 16; // meters – typical Vienna street incl. pavement

/**
 * Estimate how "urban dense" a location is.
 * Simple approximation based on Berlin districts.
 */
function getUrbanDensityFactor(lat: number, lng: number): number {
  // Mitte (historic core) – very dense, tall buildings
  if (lat > 52.508 && lat < 52.535 && lng > 13.370 && lng < 13.435) return 1.0;
  // Inner districts: Mitte, Kreuzberg, Prenzlauer Berg, Schöneberg – dense Gründerzeit
  if (lat > 52.455 && lat < 52.560 && lng > 13.330 && lng < 13.475) return 0.85;
  // Slightly outer
  return 0.6;
}

/**
 * Shadow angle: the maximum sun altitude at which a building
 * of given height across a street of given width still casts shadow.
 *
 * arctan(buildingHeight / streetWidth) in degrees
 */
function criticalShadowAngle(buildingHeight: number, streetWidth: number): number {
  return (Math.atan(buildingHeight / streetWidth) * 180) / Math.PI;
}

/**
 * Estimate if the sun direction is "blocked" by a typical building in a dense
 * Berlin street grid.
 *
 * Berlin's street grid is roughly aligned N–S / E–W.
 * - Morning (azimuth ~90°/E): east-facing facades cast shadows westward
 * - Afternoon (azimuth ~270°/W): west-facing facades cast shadows eastward
 * - Midday south (azimuth ~180°/S): buildings N of spot cast shadows southward
 * - North (azimuth ~0° or 360°): rarely blocked in northern hemisphere
 *
 * We model this with a directional penalty: if azimuth is roughly E, S, or W,
 * buildings opposite are plausible.
 */
function directionBlockFactor(azimuthDeg: number): number {
  // How "blocked" is the sun direction by a typical grid building?
  // Return 0 = unblocked, 1 = fully blocked

  const az = azimuthDeg % 360;

  // South quadrant (135–225°) → most exposed in Vienna
  if (az >= 135 && az <= 225) return 0.1;

  // Southeast/Southwest (good exposure at moderate angles)
  if ((az >= 90 && az < 135) || (az > 225 && az <= 270)) return 0.3;

  // East/West (streets in these directions often create urban canyons)
  if ((az >= 60 && az < 90) || (az > 270 && az <= 300)) return 0.55;

  // NE/NW (sun rarely comes from north in Vienna)
  if ((az >= 30 && az < 60) || (az > 300 && az <= 330)) return 0.65;

  // Near north (≤30° or ≥330°) – very low, often blocked
  return 0.75;
}

/**
 * Core function: compute a shadow score (0 = full sun, 1 = full shade)
 * for a café at given coordinates and time.
 */
export function computeShadowScore(
  lat: number,
  lng: number,
  date: Date
): { score: number; sunPos: SunPosition } {
  const sunPos = getSunPosition(lat, lng, date);

  // Night or very close to horizon → dark / shady
  if (sunPos.altitudeDeg <= 0) {
    return { score: 1.0, sunPos };
  }

  const density = getUrbanDensityFactor(lat, lng);
  const buildingHeight =
    density >= 0.9
      ? DENSE_URBAN_HEIGHT
      : density >= 0.7
      ? MEDIUM_URBAN_HEIGHT
      : 10;

  const critical = criticalShadowAngle(buildingHeight, STREET_WIDTH);

  // How much of the sun is blocked by building height alone?
  let heightFactor: number;
  if (sunPos.altitudeDeg >= critical * 1.5) {
    heightFactor = 0; // sun high enough to clear most buildings
  } else if (sunPos.altitudeDeg >= critical) {
    heightFactor = 0.25; // partial
  } else if (sunPos.altitudeDeg >= critical * 0.5) {
    heightFactor = 0.6; // probably shaded
  } else {
    heightFactor = 0.9; // very low sun, very likely shaded
  }

  const dirFactor = directionBlockFactor(sunPos.azimuthDeg) * density;

  // Combined score: weighted blend
  const score = Math.min(1, heightFactor * 0.55 + dirFactor * 0.45);

  return { score, sunPos };
}

/**
 * Convert a shadow score to a SunStatus label.
 */
export function scoreToStatus(score: number): SunStatus {
  if (score <= 0.3) return "sunny";
  if (score <= 0.65) return "partial";
  return "shady";
}

/**
 * Main export: compute sun status for a café.
 */
export function computeCafeSunStatus(
  lat: number,
  lng: number,
  date: Date
): { status: SunStatus; score: number; sunPos: SunPosition } {
  const { score, sunPos } = computeShadowScore(lat, lng, date);
  const status = scoreToStatus(score);
  return { status, score, sunPos };
}

/**
 * Status display helpers
 */
export const STATUS_LABELS: Record<SunStatus, string> = {
  sunny: "Sonnig",
  partial: "Teilweise sonnig",
  shady: "Schattig",
};

export const STATUS_EMOJI: Record<SunStatus, string> = {
  sunny: "☀️",
  partial: "⛅",
  shady: "🌥️",
};
