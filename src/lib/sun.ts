// src/lib/sun.ts

import SunCalc from "suncalc";
import type { SunPosition } from "@/types";

/**
 * Get the sun's position for a given location and time.
 * SunCalc uses radians; we convert to degrees for readability.
 * Azimuth in SunCalc is measured from SOUTH, clockwise → we convert to from-NORTH.
 */
export function getSunPosition(
  lat: number,
  lng: number,
  date: Date
): SunPosition {
  const pos = SunCalc.getPosition(date, lat, lng);

  const altitudeDeg = (pos.altitude * 180) / Math.PI;
  // SunCalc azimuth: S=0, E=π/2 (actually measured from S, clockwise when viewed from above)
  // Convert to standard meteorological: N=0, clockwise
  let azimuthDeg = ((pos.azimuth * 180) / Math.PI + 180) % 360;

  return {
    altitude: pos.altitude,
    azimuth: pos.azimuth,
    altitudeDeg,
    azimuthDeg,
  };
}

/**
 * Returns true if the sun is above the horizon.
 */
export function isSunUp(lat: number, lng: number, date: Date): boolean {
  const pos = getSunPosition(lat, lng, date);
  return pos.altitudeDeg > 0;
}

/**
 * Get sun times (sunrise, sunset, etc.) for a given location and date.
 */
export function getSunTimes(lat: number, lng: number, date: Date) {
  return SunCalc.getTimes(date, lat, lng);
}

/**
 * Format sun altitude as a human-friendly description.
 */
export function describeSunAltitude(altitudeDeg: number): string {
  if (altitudeDeg <= 0) return "Sonne unter dem Horizont";
  if (altitudeDeg < 10) return "Sehr flacher Sonnenstand";
  if (altitudeDeg < 25) return "Niedriger Sonnenstand";
  if (altitudeDeg < 45) return "Mittlerer Sonnenstand";
  return "Hoher Sonnenstand";
}
