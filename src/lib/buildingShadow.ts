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
 * Preserves the actual building outline (including L-shapes, courtyards, etc.)
 * by computing the silhouette: only edges that face away from the sun cast a
 * shadow boundary.  The result is the building footprint extended by the
 * silhouette edge projections, stitched into a single closed polygon.
 *
 * Falls back to a convex-hull union if the silhouette walk fails (degenerate
 * geometry, < 3 vertices, etc.).
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

  if (verts.length < 3) return [];

  // ── silhouette projection ─────────────────────────────────────────────────
  // For each polygon edge, determine if it faces the sun (dot product of the
  // edge outward normal with the shadow direction > 0 → edge faces away from
  // sun → it is a silhouette edge and casts a shadow boundary).
  //
  // Shadow direction vector in [lat, lng] space:
  const sdLat = dlat;
  const sdLng = dlng;

  // Identify silhouette vertices: a vertex is on the silhouette boundary when
  // the edges on either side of it have different facing directions.
  const n = verts.length;
  const facing: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const [lat0, lng0] = verts[i];
    const [lat1, lng1] = verts[(i + 1) % n];
    // Edge vector
    const eLat = lat1 - lat0;
    const eLng = lng1 - lng0;
    // Outward normal (rotate edge 90° right for a CCW polygon = outward)
    const nLat =  eLng;
    const nLng = -eLat;
    // Dot with shadow direction — positive means facing away from sun (shadow side)
    facing.push(nLat * sdLat + nLng * sdLng > 0);
  }

  // Build shadow polygon:
  // Walk around the polygon. When we cross from non-silhouette → silhouette,
  // emit the original vertex AND its projected twin. When we cross back,
  // emit only the projected twin (close the shadow cap). Accumulate all points
  // and take their convex hull to guarantee a valid, non-self-intersecting ring.
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const [lat, lng] = verts[i];
    pts.push([lat, lng]);
    if (facing[i]) {
      pts.push([lat + dlat, lng + dlng]);
    }
  }

  if (pts.length < 3) {
    // Fallback: project all vertices
    const shifted: [number, number][] = verts.map(([lat, lng]) => [lat + dlat, lng + dlng]);
    return convexHull([...verts, ...shifted]);
  }

  return convexHull(pts);
}
