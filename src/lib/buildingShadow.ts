// src/lib/buildingShadow.ts

/**
 * Compute the convex hull of a set of 2-D points using the monotone-chain
 * algorithm (O(n log n)).  Returns vertices in counter-clockwise order.
 *
 * Using the convex hull for shadow projection means concave features
 * (courtyards, recesses, U-shapes) can never create sunny islands inside
 * the shadow: the building is treated as a single, solid, light-blocking mass.
 */
function convexHull(pts: [number, number][]): [number, number][] {
  const n = pts.length;
  if (n < 3) return pts;

  // Sort by lat, then by lng
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

  // Remove last point of each half (it's the first point of the other half)
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/**
 * Calculate the shadow polygon for a building footprint.
 *
 * The footprint is first reduced to its convex hull so that concave
 * features (courtyards, L-shapes, recesses) are ignored.  The shadow
 * is then formed by projecting each hull vertex in the shadow direction
 * and unioning the hull with the shifted hull.
 *
 * @param polygon        Building footprint as [lat, lng] vertices
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

  // Use convex hull → inner courtyards / recesses cast no spurious light
  const hull = convexHull(verts);

  const shifted: [number, number][] = hull.map(([lat, lng]) => [lat + dlat, lng + dlng]);

  // Shadow area = convex hull of ALL original + shifted points.
  // Simply concatenating hull + reversed-shifted creates self-intersecting edges
  // for oblique sun angles, which produces gaps along the outer shadow boundary.
  // The convex hull of the combined point set is always a valid, gap-free polygon.
  return convexHull([...hull, ...shifted]);
}
