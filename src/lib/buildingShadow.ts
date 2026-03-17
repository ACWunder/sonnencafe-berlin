// src/lib/buildingShadow.ts

/**
 * Compute the convex hull of a set of 2-D points using the monotone-chain
 * algorithm (O(n log n)).  Returns vertices in counter-clockwise order.
 */
function convexHull(pts: [number, number][]): [number, number][] {
  const n = pts.length;
  if (n < 3) return pts;

  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: [number, number][] = [];
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }

  const upper: [number, number][] = [];
  for (const p of [...s].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/**
 * Calculate the shadow polygon for a building footprint.
 *
 * The footprint is reduced to its convex hull, then every hull vertex is
 * projected in the shadow direction.  The shadow area is the convex hull of
 * the combined original + shifted point set — this is always a valid,
 * gap-free polygon regardless of sun angle or building shape.
 *
 * @param polygon        Building footprint as [lat, lng] vertices (may be closed)
 * @param height         Building height in metres
 * @param sunAltitudeDeg Sun altitude above horizon in degrees
 * @param sunAzimuthDeg  Sun azimuth clockwise from north in degrees
 * @returns Shadow polygon as [lat, lng] array, or [] if sun is below horizon
 */
export function calcShadowPolygon(
  polygon: [number, number][],
  height: number,
  sunAltitudeDeg: number,
  sunAzimuthDeg: number
): [number, number][] {
  if (sunAltitudeDeg <= 0.5) return [];

  const altRad = (sunAltitudeDeg * Math.PI) / 180;
  const shadowLength = Math.min(height / Math.tan(altRad), 300);

  const azRad = (sunAzimuthDeg * Math.PI) / 180;
  const shadowEast  = -shadowLength * Math.sin(azRad);
  const shadowNorth = -shadowLength * Math.cos(azRad);

  const refLat = polygon[0][0];
  const dlat = shadowNorth / 111_000;
  const dlng = shadowEast  / (111_000 * Math.cos((refLat * Math.PI) / 180));

  // Remove duplicate closing vertex if present
  const verts: [number, number][] =
    polygon[0][0] === polygon[polygon.length - 1][0] &&
    polygon[0][1] === polygon[polygon.length - 1][1]
      ? polygon.slice(0, -1)
      : polygon;

  const hull    = convexHull(verts);
  const shifted: [number, number][] = hull.map(([lat, lng]) => [lat + dlat, lng + dlng]);

  return convexHull([...hull, ...shifted]);
}
