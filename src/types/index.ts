// src/types/index.ts

export type SunStatus = "sunny" | "partial" | "shady";

export interface Cafe {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string;
  district?: string;
  tags?: Record<string, string>;
  amenity?: string;
}

export interface CafeWithSun extends Cafe {
  sunStatus: SunStatus;
  sunAltitude: number;   // degrees above horizon
  sunAzimuth: number;    // degrees clockwise from north
  shadowScore: number;   // 0 = full sun, 1 = full shade
}

export interface SunPosition {
  altitude: number; // radians
  azimuth: number;  // radians (north = 0, clockwise)
  altitudeDeg: number;
  azimuthDeg: number;
}

export interface Building {
  id: string;
  lat: number;
  lng: number;
  height: number; // meters
  polygon?: [number, number][];
}

export interface FilterState {
  onlySunny: boolean;
  amenityTypes: string[];
  sortBy: "sunny" | "name" | "distance";
}

export interface SunTimeline {
  inSun: boolean[];    // one per slot, true = sunny
  startMinute: number; // minute-of-day for slot[0] (≈ sunrise)
  intervalMin: number; // minutes between slots
}

export type SunTimelineData = Record<string, SunTimeline>;

export interface TimeState {
  date: string;   // ISO date string YYYY-MM-DD
  time: string;   // HH:MM
}

export interface OverpassCafe {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  nodes?: number[];   // way constituent node IDs
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  elements: OverpassCafe[];
}
