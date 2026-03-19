// src/lib/overpass.ts

import type { Cafe, OverpassResponse } from "@/types";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// OSM bounding box covering Mitte, Kreuzberg, Prenzlauer Berg, Schöneberg
export const BERLIN_BBOX = {
  south: 52.4546381,
  west: 13.3362902,
  north: 52.5585856,
  east: 13.4721073,
};

export const BERLIN_FULL_BBOX = BERLIN_BBOX;

export function buildOverpassQuery(): string {
  const bbox = `${BERLIN_FULL_BBOX.south},${BERLIN_FULL_BBOX.west},${BERLIN_FULL_BBOX.north},${BERLIN_FULL_BBOX.east}`;

  return `
[out:json][timeout:60];
(
  node["amenity"="cafe"](${bbox});
  way["amenity"="cafe"](${bbox});
  node["amenity"="coffee_shop"](${bbox});
  way["amenity"="coffee_shop"](${bbox});
  node["amenity"="bistro"](${bbox});
  way["amenity"="bistro"](${bbox});
  node["amenity"="bar"]["cuisine"~"coffee",i](${bbox});
  way["amenity"="bar"]["cuisine"~"coffee",i](${bbox});
  node["amenity"="restaurant"]["cuisine"~"coffee_shop|kaffeehaus|cafe|brunch",i](${bbox});
  way["amenity"="restaurant"]["cuisine"~"coffee_shop|kaffeehaus|cafe|brunch",i](${bbox});
  node["shop"="coffee"](${bbox});
  way["shop"="coffee"](${bbox});
  node["shop"="tea"](${bbox});
  way["shop"="tea"](${bbox});
  node["cuisine"~"coffee_shop|espresso|cappuccino|kaffeehaus|breakfast|sandwich",i](${bbox});
  way["cuisine"~"coffee_shop|espresso|cappuccino|kaffeehaus|breakfast|sandwich",i](${bbox});
  node["shop"="bakery"](${bbox});
  way["shop"="bakery"](${bbox});
  node["shop"="pastry"](${bbox});
  way["shop"="pastry"](${bbox});
  node["shop"="deli"](${bbox});
  way["shop"="deli"](${bbox});
  node["craft"="coffee_roaster"](${bbox});
  way["craft"="coffee_roaster"](${bbox});
  node["amenity"="ice_cream"](${bbox});
  way["amenity"="ice_cream"](${bbox});
);
out body;
>;
out body qt;
  `.trim();
}

export async function fetchCafesFromOverpass(): Promise<Cafe[]> {
  const query = buildOverpassQuery();

  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    next: { revalidate: 3600 }, // Cache for 1 hour in Next.js
  });

  if (!response.ok) {
    throw new Error(`Overpass API error: ${response.status}`);
  }

  const data: OverpassResponse = await response.json();
  return parseOverpassCafes(data);
}

// Tags that identify a café-type element (as opposed to plain geometry nodes
// or entrance nodes that arrive in the response via `>; out body qt`)
function isCafeElement(tags: Record<string, string>): boolean {
  if (tags.amenity === "cafe" || tags.amenity === "coffee_shop" || tags.amenity === "bistro" || tags.amenity === "ice_cream") return true;
  if (tags.shop === "coffee" || tags.shop === "tea" || tags.shop === "bakery" || tags.shop === "pastry" || tags.shop === "deli") return true;
  if (tags.craft === "coffee_roaster") return true;
  if (/coffee_shop|kaffeehaus|cafe|brunch|espresso|cappuccino|breakfast|sandwich/i.test(tags.cuisine ?? "")) return true;
  if (tags.amenity === "bar" && /coffee/i.test(tags.cuisine ?? "")) return true;
  return false;
}

// For a Way polygon, find the midpoint of the edge that is farthest from the
// polygon's centroid.  This selects the building's most exterior face —
// typically the street-facing facade — without needing any road data.
function streetFacingPoint(
  nodeIds: number[],
  nodeCoords: Map<number, { lat: number; lon: number }>,
  centLat: number,
  centLon: number,
): { lat: number; lon: number } | null {
  const pts = nodeIds
    .map((id) => nodeCoords.get(id))
    .filter((p): p is { lat: number; lon: number } => p !== undefined);

  if (pts.length < 2) return null;

  let bestDist = -1;
  let best: { lat: number; lon: number } | null = null;

  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const midLat = (a.lat + b.lat) / 2;
    const midLon = (a.lon + b.lon) / 2;
    // Use degree-space distance (equirectangular, fine for <1 km)
    const dist = Math.hypot(midLat - centLat, midLon - centLon);
    if (dist > bestDist) {
      bestDist = dist;
      best = { lat: midLat, lon: midLon };
    }
  }

  return best;
}

function parseOverpassCafes(data: OverpassResponse): Cafe[] {
  // Build lookup tables from constituent nodes returned by `>; out body qt`.
  // These nodes have coordinates; entrance-tagged ones also carry tags.
  const nodeCoords = new Map<number, { lat: number; lon: number }>();
  const entranceNodes = new Set<number>();

  for (const el of data.elements) {
    if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) {
      nodeCoords.set(el.id, { lat: el.lat, lon: el.lon });
      if (el.tags?.entrance) entranceNodes.add(el.id);
    }
  }

  const seen = new Set<string>();

  return data.elements
    .filter((el) => {
      // Keep only real café-type elements (exclude plain geometry / entrance nodes)
      if (!el.tags || !isCafeElement(el.tags)) return false;
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      return lat !== undefined && lon !== undefined;
    })
    .filter((el) => {
      const key = `${el.type}-${el.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((el) => {
      // Start with OSM-provided position (node: direct coords; way: centroid)
      let lat = el.lat ?? el.center!.lat;
      let lon = el.lon ?? el.center!.lon;
      const tags = el.tags ?? {};

      // Refine position for Way elements:
      if (el.type === "way" && el.nodes?.length) {
        // Priority 1 — OSM entrance node (most precise: actual door position)
        const entranceId = el.nodes.find((id) => entranceNodes.has(id));
        if (entranceId) {
          const c = nodeCoords.get(entranceId);
          if (c) { lat = c.lat; lon = c.lon; }
        } else {
          // Priority 2 — midpoint of the most exterior building edge
          // (street-facing facade heuristic, no road data needed)
          const exterior = streetFacingPoint(el.nodes, nodeCoords, lat, lon);
          if (exterior) { lat = exterior.lat; lon = exterior.lon; }
        }
        // Priority 3 — fall through to centroid (already set above)
      }

      const district = guessDistrict(lat, lon);
      const name =
        tags.name ||
        tags["name:de"] ||
        tags["brand"] ||
        `${tags.amenity ?? "Café"} (unbenannt)`;

      const addr = [tags["addr:street"], tags["addr:housenumber"]]
        .filter(Boolean)
        .join(" ");

      return {
        id: `${el.type}-${el.id}`,
        name,
        lat,
        lng: lon,
        address: addr || undefined,
        district,
        tags,
        amenity: tags.amenity,
      } satisfies Cafe;
    });
}

// ── Exact district polygons from OpenStreetMap (simplified via Ramer-Douglas-Peucker ε=0.00015) ──
// Polygon vertices are [lat, lng]. Source: OSM relations, fetched 2026-03-18.
// Districts: Mitte (rel. 16566), Kreuzberg (rel. 55765), Prenzlauer Berg (rel. 407713), Schöneberg (rel. 55751)
const DISTRICT_POLYGONS: Array<{ name: string; ring: [number, number][] }> = [
  {
    name: "Mitte",
    ring: [[52.5179611,13.4267494],[52.5180693,13.4261515],[52.5182898,13.4263036],[52.5183762,13.4259489],[52.5197438,13.4269188],[52.5195865,13.4283998],[52.5212028,13.4291879],[52.5227924,13.4255523],[52.5229415,13.4265191],[52.5232938,13.426501],[52.5239632,13.4237733],[52.5274633,13.4154317],[52.5286212,13.4113137],[52.529665,13.4055857],[52.5306051,13.4060864],[52.5323485,13.4064243],[52.5343479,13.4083499],[52.5346898,13.4074862],[52.5401877,13.4047046],[52.5404013,13.4041908],[52.537447,13.3931312],[52.5352616,13.3898557],[52.5331793,13.3877416],[52.5377677,13.3821339],[52.5401484,13.379742],[52.537033,13.374555],[52.5380288,13.3729884],[52.5359913,13.3686093],[52.5366213,13.3678819],[52.5356771,13.3658989],[52.5324407,13.36938],[52.5303427,13.370997],[52.5275278,13.3737789],[52.5268662,13.3738047],[52.5265082,13.3734103],[52.5264918,13.3710528],[52.5252239,13.3710363],[52.5248267,13.3716961],[52.5228009,13.3717855],[52.5226174,13.3736518],[52.5218957,13.3752891],[52.5212096,13.3759305],[52.5199859,13.3763704],[52.519565,13.3770025],[52.5176951,13.3768575],[52.5168229,13.3772438],[52.5163006,13.3765486],[52.5158305,13.3768146],[52.5156371,13.377373],[52.5129279,13.3768505],[52.5124089,13.3768188],[52.5123583,13.3770286],[52.5099505,13.3765301],[52.509293,13.3765976],[52.5079658,13.3776503],[52.5069995,13.3789222],[52.5080775,13.3992301],[52.5093816,13.4002283],[52.5077718,13.4044429],[52.5082102,13.4052837],[52.5061832,13.4080301],[52.5069278,13.4099694],[52.5048911,13.4115252],[52.5040371,13.4140723],[52.5049185,13.4149072],[52.5041685,13.4176016],[52.5050177,13.4182136],[52.5050603,13.4189443],[52.5056491,13.4194305],[52.5050785,13.4215419],[52.50498,13.423038],[52.5051819,13.4249569],[52.5057986,13.4267083],[52.5056674,13.4271997],[52.5085626,13.4294017],[52.5122343,13.4227803],[52.5150695,13.4250962],[52.5179611,13.4267494]],
  },
  {
    name: "Kreuzberg",
    ring: [[52.4899002,13.4396363],[52.4906049,13.4398843],[52.494856,13.4455486],[52.4948733,13.4474502],[52.4970891,13.4506551],[52.4977068,13.4529296],[52.4979034,13.4526893],[52.4982378,13.452723],[52.4989347,13.4514301],[52.4990616,13.4504406],[52.5005142,13.4465111],[52.5029237,13.4414479],[52.5045554,13.4371366],[52.5053824,13.4360036],[52.5085626,13.4294017],[52.5056674,13.4271997],[52.5057986,13.4267083],[52.5051819,13.4249569],[52.50498,13.423038],[52.5050785,13.4215419],[52.5056491,13.4194305],[52.5050603,13.4189443],[52.5050177,13.4182136],[52.5041685,13.4176016],[52.5049185,13.4149072],[52.5040371,13.4140723],[52.5048911,13.4115252],[52.5069278,13.4099694],[52.5061832,13.4080301],[52.5082102,13.4052837],[52.5077718,13.4044429],[52.5093816,13.4002283],[52.5080775,13.3992301],[52.5069995,13.3789222],[52.5079658,13.3776503],[52.5033759,13.3749797],[52.5032356,13.3746784],[52.504164,13.3736093],[52.501634,13.3713442],[52.4998602,13.3708251],[52.498879,13.3695143],[52.4987765,13.3697289],[52.4978546,13.3695581],[52.4968792,13.3686363],[52.4944781,13.3684148],[52.4939555,13.3685807],[52.4933357,13.3682291],[52.4932859,13.3692527],[52.4916704,13.3765623],[52.4904497,13.3754648],[52.4893656,13.375413],[52.4893189,13.3748892],[52.4879703,13.373518],[52.4877505,13.3734818],[52.4877318,13.3741755],[52.4851671,13.3740185],[52.4851739,13.371719],[52.484979,13.3716065],[52.4848587,13.3862684],[52.4858229,13.3862812],[52.4857753,13.3942612],[52.4841256,13.394234],[52.4840216,13.3946131],[52.4837388,13.4012255],[52.4827923,13.4063457],[52.4854769,13.4067496],[52.4871133,13.4084232],[52.4887471,13.4077228],[52.4888602,13.4078874],[52.4871637,13.421256],[52.4863837,13.4237047],[52.488182,13.42535],[52.4958638,13.4203999],[52.4954452,13.4224899],[52.4903871,13.4382776],[52.4896095,13.4392625],[52.4896586,13.4396279],[52.4899002,13.4396363]],
  },
  {
    name: "Prenzlauer Berg",
    ring: [[52.5489369,13.3992913],[52.5508856,13.3988998],[52.5507038,13.396846],[52.551418,13.3976298],[52.5526001,13.3980635],[52.5563437,13.3971769],[52.5583105,13.3971237],[52.5585856,13.3979215],[52.5579879,13.4029841],[52.5574395,13.4144932],[52.5546324,13.415028],[52.5539512,13.4149339],[52.5525876,13.4272766],[52.5515448,13.4299764],[52.5517556,13.4300713],[52.5509445,13.4339649],[52.5486609,13.4427498],[52.5471701,13.4470109],[52.547339,13.4472381],[52.5468075,13.4480318],[52.5445296,13.4535971],[52.5448319,13.4544813],[52.5445371,13.4547623],[52.5446405,13.4550722],[52.5440444,13.4556206],[52.5436753,13.455061],[52.5384497,13.4676477],[52.5366569,13.4663842],[52.5361418,13.4677852],[52.5347123,13.4687427],[52.5326337,13.4633894],[52.5293579,13.4606745],[52.5282648,13.4561965],[52.5257681,13.4591177],[52.524504,13.4627561],[52.5240617,13.4660225],[52.5232994,13.4685852],[52.5220083,13.4707457],[52.5206943,13.4721073],[52.5199276,13.4626951],[52.5212723,13.4552901],[52.5224576,13.4561572],[52.5225523,13.4557998],[52.5277958,13.4521828],[52.5264084,13.4471683],[52.5310256,13.4422774],[52.5287778,13.4387482],[52.5288005,13.4383106],[52.529548,13.4374816],[52.5280952,13.4250269],[52.5278778,13.4248545],[52.527915,13.4236421],[52.5255456,13.4197532],[52.5274633,13.4154317],[52.5286212,13.4113137],[52.529665,13.4055857],[52.5306051,13.4060864],[52.5323485,13.4064243],[52.5343479,13.4083499],[52.5346898,13.4074862],[52.5401877,13.4047046],[52.5404013,13.4041908],[52.5402134,13.4035279],[52.5405059,13.4033783],[52.5401245,13.4020309],[52.5433764,13.4002456],[52.5465304,13.3992065],[52.5466455,13.4003037],[52.5489369,13.3992913]],
  },
  {
    name: "Schöneberg",
    ring: [[52.4851671,13.3740185],[52.4877318,13.3741755],[52.4877505,13.3734818],[52.4879703,13.373518],[52.4893189,13.3748892],[52.4893656,13.375413],[52.4904497,13.3754648],[52.4916704,13.3765623],[52.4932859,13.3692527],[52.4933357,13.3682291],[52.4939555,13.3685807],[52.4944781,13.3684148],[52.4968792,13.3686363],[52.4978546,13.3695581],[52.4987765,13.3697289],[52.499662,13.3625368],[52.5019066,13.3543284],[52.5049347,13.3414287],[52.5008675,13.3369059],[52.4999828,13.3391852],[52.4978387,13.3379785],[52.4958626,13.3372728],[52.494072,13.3374467],[52.4910006,13.3370663],[52.4907224,13.3375528],[52.4903618,13.3369497],[52.4896794,13.3368996],[52.4880485,13.3372152],[52.4785242,13.3370669],[52.4785899,13.3433791],[52.4781517,13.3438697],[52.4732251,13.3375677],[52.4684519,13.3373359],[52.4674461,13.3362902],[52.4663747,13.3384772],[52.4665662,13.3387892],[52.4655533,13.3388827],[52.4616763,13.344969],[52.4592622,13.3478207],[52.4589882,13.347558],[52.4587569,13.349036],[52.456778,13.349081],[52.4566224,13.350909],[52.4571248,13.3529836],[52.4566799,13.3537145],[52.4556509,13.3542161],[52.4556219,13.3559727],[52.4572936,13.3558191],[52.4567756,13.3592848],[52.4557229,13.3589983],[52.4548585,13.3593119],[52.456031,13.3619939],[52.4558696,13.364081],[52.454895,13.3639657],[52.4546381,13.3666046],[52.4556992,13.3666595],[52.4556163,13.3701761],[52.4568206,13.3696201],[52.4583974,13.3697495],[52.4586884,13.3706014],[52.4594054,13.3709482],[52.4600654,13.3707913],[52.4605298,13.3699144],[52.4671648,13.3702487],[52.4720317,13.3710864],[52.4725931,13.3686029],[52.4733276,13.3674041],[52.4746621,13.3665277],[52.4756167,13.3662409],[52.4851739,13.371719],[52.4851671,13.3740185]],
  },
];

/** Ray-casting point-in-polygon test. Polygon vertices are [lat, lng]. */
function pointInDistrict(lat: number, lng: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Precomputed district centroids for nearest-district fallback
const DISTRICT_CENTROIDS = DISTRICT_POLYGONS.map(({ name, ring }) => ({
  name,
  lat: ring.reduce((s, [y]) => s + y, 0) / ring.length,
  lng: ring.reduce((s, [, x]) => s + x, 0) / ring.length,
}));

/** Returns the Berlin district name ("Mitte", "Kreuzberg", "Prenzlauer Berg", "Schöneberg") or "Berlin". */
function guessDistrict(lat: number, lng: number): string {
  for (const { name, ring } of DISTRICT_POLYGONS) {
    if (pointInDistrict(lat, lng, ring)) return name;
  }
  // Fallback: assign to nearest district centroid (handles gaps at polygon boundaries)
  let bestDist = Infinity, bestName = "Berlin";
  for (const { name, lat: cLat, lng: cLng } of DISTRICT_CENTROIDS) {
    const d = Math.hypot(lat - cLat, lng - cLng);
    if (d < bestDist) { bestDist = d; bestName = name; }
  }
  return bestDist < 0.05 ? bestName : "Berlin";
}
