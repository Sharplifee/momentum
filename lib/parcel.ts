/**
 * Utah parcel lookup — exact property boundaries, not estimates.
 *
 * Utah's Geospatial Resource Center publishes surveyed parcel polygons statewide
 * (~1.6M records). Given an address we pull the actual lot shape, pin the interior
 * pole of inaccessibility (guaranteed inside the lot even for concave cul-de-sac
 * and flag lots, unlike an area-weighted centroid), and measure the distance from
 * that pin to the farthest boundary vertex — the smallest circle centered inside
 * the lot that fully contains it.
 */

import polylabel from "polylabel";

const PARCEL_QUERY =
  "https://services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services/UtahStatewideParcels/FeatureServer/0/query";
const CENSUS_GEOCODE =
  "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

const SERVICE_COUNTIES = ["SaltLake", "Utah"];

const ABBREV: Record<string, string> = {
  " LANE": " LN", " DRIVE": " DR", " CIRCLE": " CIR", " COVE": " CV", " ROAD": " RD",
  " STREET": " ST", " COURT": " CT", " AVENUE": " AVE", " PLACE": " PL", " BOULEVARD": " BLVD",
  " PARKWAY": " PKWY", " TERRACE": " TER", " TRAIL": " TRL", " WAY": " WAY", " LOOP": " LOOP",
  " HOLLOW": " HOLW", " RIDGE": " RDG", " POINT": " PT", " SQUARE": " SQ", " HEIGHTS": " HTS",
  " GLEN": " GLN", " MANOR": " MNR", " CROSSING": " XING", " HIGHWAY": " HWY", " ALLEY": " ALY",
  " BEND": " BND", " CANYON": " CYN", " ESTATES": " EST", " MEADOW": " MDW", " MEADOWS": " MDWS",
  " GROVE": " GRV", " VALLEY": " VLY", " SPRING": " SPG", " SPRINGS": " SPGS", " SUMMIT": " SMT",
  " VIEW": " VW", " GARDEN": " GDN", " GARDENS": " GDNS", " CREEK": " CRK", " HILL": " HL",
  " HILLS": " HLS", " KNOLL": " KNL", " KNOLLS": " KNLS", " PASS": " PASS", " FALLS": " FLS",
};

const DIRECTIONS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]);

function normalize(a: string | null | undefined): string {
  let s = (a ?? "").toUpperCase().trim();
  for (const [k, v] of Object.entries(ABBREV)) s = s.split(k).join(v);
  return s.replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
}

export function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Pole of inaccessibility — the point inside the polygon farthest from any edge.
 * Guaranteed inside the lot, unlike an area-weighted centroid which lands outside
 * concave (cul-de-sac, flag-lot) shapes. Longitude is scaled by cos(latitude)
 * before running so the search isn't skewed by the lat/lng aspect ratio at this
 * latitude (~1 deg lng ≈ 0.76 deg lat worth of ground distance in northern Utah).
 */
export function interiorPin(ring: number[][]): { lat: number; lng: number } {
  const avgLat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const cosLat = Math.cos((avgLat * Math.PI) / 180);
  const scaled = [ring.map(([lng, lat]) => [lng * cosLat, lat])];
  const [x, y] = polylabel(scaled as any, 1e-8);
  return { lat: y, lng: x / cosLat };
}

function farthestVertexMeters(pt: { lat: number; lng: number }, ring: number[][]): number {
  return Math.max(...ring.map((p) => metersBetween(pt.lat, pt.lng, p[1], p[0])));
}

/** Retry ArcGIS calls with exponential backoff — the FeatureServer returns 503 intermittently. */
async function fetchJsonWithRetry(url: string, attempts = 4): Promise<any> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`http ${res.status}`);
      const json = await res.json();
      if (json?.error) throw new Error(`arcgis error: ${JSON.stringify(json.error)}`);
      return json;
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * 2 ** i));
    }
  }
  throw lastErr;
}

/** The most distinctive token(s) in a street name for a targeted LIKE query — skips bare direction letters. */
function streetStem(streetWords: string[]): string | null {
  const words = streetWords.filter((w) => !DIRECTIONS.has(w) && w.length > 0);
  if (!words.length) return null;
  const alpha = words.filter((w) => /[A-Z]/.test(w) && w.length >= 3);
  if (alpha.length) return alpha.reduce((a, b) => (b.length > a.length ? b : a));
  return words[0];
}

function scoreCandidate(candidateAddr: string, n: string, houseNumber: string, streetWords: string[]): number {
  const pa = normalize(candidateAddr);
  if (pa === n) return 100;
  const paNum = pa.split(" ")[0];
  if (paNum !== houseNumber) return 0;
  const ps = pa.split(" ").slice(1).join(" ");
  const a = new Set(streetWords);
  const b = new Set(ps.split(" "));
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return (inter / Math.max(1, union)) * 100;
}

async function queryByAddressText(houseNumber: string, city: string | null | undefined, stem: string | null) {
  const wheres = [
    city && stem
      ? `PARCEL_ADD LIKE '${houseNumber} %' AND UPPER(PARCEL_ADD) LIKE '%${stem}%' AND UPPER(PARCEL_CITY)='${city.toUpperCase().replace(/'/g, "''")}'`
      : null,
    stem ? `PARCEL_ADD LIKE '${houseNumber} %' AND UPPER(PARCEL_ADD) LIKE '%${stem}%' AND County IN ('${SERVICE_COUNTIES.join("','")}')` : null,
    `PARCEL_ADD LIKE '${houseNumber} %' AND County IN ('${SERVICE_COUNTIES.join("','")}')`,
  ].filter(Boolean) as string[];

  for (const where of wheres) {
    const params = new URLSearchParams({
      where, outFields: "PARCEL_ADD,PARCEL_CITY,PARCEL_ID", returnGeometry: "true",
      outSR: "4326", resultRecordCount: "200", f: "json",
    });
    try {
      const json = await fetchJsonWithRetry(`${PARCEL_QUERY}?${params}`);
      const feats = json?.features ?? [];
      if (feats.length) return feats;
    } catch {
      // try the next, looser where clause
    }
  }
  return [];
}

async function geocodeCensus(address: string, city: string | null | undefined): Promise<{ lat: number; lng: number } | null> {
  const full = `${address}${city ? " " + city : ""} UT`;
  const params = new URLSearchParams({ address: full, benchmark: "Public_AR_Current", format: "json" });
  try {
    const res = await fetch(`${CENSUS_GEOCODE}?${params}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    const m = json?.result?.addressMatches?.[0];
    if (!m) return null;
    return { lat: m.coordinates.y, lng: m.coordinates.x };
  } catch {
    return null;
  }
}

async function pointInParcel(lat: number, lng: number, bufferDeg = 0): Promise<any[]> {
  const build = (base: string) => {
    const params = new URLSearchParams({
      geometry: `${lng},${lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "PARCEL_ADD,PARCEL_CITY,PARCEL_ID,County,PARCEL_ACRES",
      returnGeometry: "true",
      outSR: "4326",
      resultRecordCount: "12",
      f: "json",
    });
    if (bufferDeg > 0) {
      params.set("distance", String(Math.round(bufferDeg * 111_320)));
      params.set("units", "esriSRUnit_Meter");
    }
    return `${base}?${params.toString()}`;
  };

  // Statewide first — one call covers the whole service area. Fall through to
  // the per-county services only when it comes back empty, because those are
  // more complete but cost an extra round trip each.
  for (const base of [PARCEL_QUERY, ...COUNTY_PARCEL_QUERIES]) {
    const data = await fetchJsonWithRetry(build(base)).catch(() => null);
    const feats: any[] = data?.features ?? [];
    if (feats.length) return feats;
  }
  return [];
}


const ADDRESS_POINTS_URL =
  "https://services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services/UtahAddressPoints/FeatureServer/0/query";

/** Salt Lake + Utah county bounding box, to keep the candidate set small. */
const SERVICE_AREA_ENVELOPE = "-112.30,40.20,-111.45,40.95";

/**
 * Utah Address Points — the state's authoritative address layer.
 *
 * This is a better first stop than matching against the parcel layer's own
 * PARCEL_ADD string, because a parcel's recorded address is often blank,
 * abbreviated differently, or still shows the developer's original lot
 * address. Address Points is maintained from local government address
 * authorities and carries a ParcelID, which gives a direct address -> parcel
 * link instead of a string comparison.
 */
async function queryAddressPoint(
  houseNumber: string,
  normalizedAddress: string
): Promise<{ lat: number; lng: number; parcelId: string | null; fullAdd: string; city: string } | null> {
  const params = new URLSearchParams({
    where: `AddNum='${houseNumber.replace(/'/g, "''")}'`,
    outFields: "FullAdd,City,ParcelID",
    returnGeometry: "true",
    outSR: "4326",
    resultRecordCount: "600",
    f: "json",
    geometry: SERVICE_AREA_ENVELOPE,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
  });
  const data = await fetchJsonWithRetry(`${ADDRESS_POINTS_URL}?${params.toString()}`).catch(() => null);
  const feats: any[] = data?.features ?? [];
  for (const f of feats) {
    if (normalize(f.attributes?.FullAdd) !== normalizedAddress) continue;
    const g = f.geometry;
    if (typeof g?.y !== "number" || typeof g?.x !== "number") continue;
    return {
      lat: g.y,
      lng: g.x,
      parcelId: f.attributes?.ParcelID ?? null,
      fullAdd: f.attributes?.FullAdd ?? "",
      city: f.attributes?.City ?? "",
    };
  }
  return null;
}

/** Fetch a parcel by its county parcel id — the link Address Points hands us. */
async function queryParcelById(parcelId: string): Promise<any | null> {
  const params = new URLSearchParams({
    where: `PARCEL_ID='${parcelId.replace(/'/g, "''")}'`,
    outFields: "PARCEL_ADD,PARCEL_CITY,PARCEL_ID,County,TAXEXEMPT_TYPE,TOTAL_MKT_VALUE,PARCEL_ACRES",
    returnGeometry: "true",
    outSR: "4326",
    resultRecordCount: "5",
    f: "json",
  });
  const data = await fetchJsonWithRetry(`${PARCEL_QUERY}?${params.toString()}`).catch(() => null);
  return data?.features?.[0] ?? null;
}


/**
 * Per-county LIR parcel services.
 *
 * The statewide layer has gaps: it reports 284,092 Utah County parcels while
 * the county's own LIR service has 327,655. Two verified Utah County addresses
 * returned nothing statewide and resolved cleanly against the county service,
 * so every spatial lookup falls back through these.
 */
const COUNTY_PARCEL_QUERIES = [
  "https://services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services/Parcels_SaltLake_LIR/FeatureServer/0/query",
  "https://services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services/Parcels_Utah_LIR/FeatureServer/0/query",
];

export type ParcelResult = {
  parcel_address: string | null;
  parcel_id: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  vertices: number;
  score: number;
  ring: number[][];
  pin_method: "interior_pin";
  match_method: "address_exact" | "address_fuzzy" | "address_point" | "geocode_point" | "geocode_buffer";
};

function toResult(feature: any, score: number, matchMethod: ParcelResult["match_method"]): ParcelResult | null {
  const ring = feature.geometry?.rings?.[0];
  if (!ring || ring.length < 4) return null;
  const pin = interiorPin(ring);
  const radius_m = Math.max(farthestVertexMeters(pin, ring), 25);
  return {
    parcel_address: feature.attributes?.PARCEL_ADD ?? null,
    parcel_id: feature.attributes?.PARCEL_ID ?? null,
    lat: Number(pin.lat.toFixed(7)),
    lng: Number(pin.lng.toFixed(7)),
    radius_m: Number(radius_m.toFixed(1)),
    vertices: ring.length,
    score: Math.round(score),
    ring,
    pin_method: "interior_pin",
    match_method: matchMethod,
  };
}

/**
 * Resolve a service address to a real surveyed parcel.
 *
 * Three tiers, each corroborated independently rather than accepted on a single
 * loosened score threshold (a low-confidence text match on the wrong lot is worse
 * than an honest miss — it bills drive-bys at a neighbor's house):
 *   1. Address text match, scored on normalized street-token overlap.
 *   2. Geocode the input (US Census interpolation, no key required) and take the
 *      parcel whose surveyed polygon actually contains that point — self-corroborating,
 *      since it's a real containment check rather than a text score.
 *   3. If the geocoded point lands just outside every polygon (e.g. a street-centerline
 *      geocode near the lot line), search a small buffer and accept only the candidate
 *      whose address text also corroborates the input.
 */
export async function resolveParcel(address: string, city?: string | null): Promise<ParcelResult | null> {
  const n = normalize(address);
  const houseNumber = n.split(" ")[0];
  const streetWords = n.split(" ").slice(1);
  if (!houseNumber) return null;
  const stem = streetStem(streetWords);

  // Tier 1: address text match
  const feats = await queryByAddressText(houseNumber, city, stem);
  let best: { score: number; feature: any } | null = null;
  for (const f of feats) {
    const score = scoreCandidate(f.attributes?.PARCEL_ADD, n, houseNumber, streetWords);
    if (!best || score > best.score) best = { score, feature: f };
  }
  if (best) {
    if (best.score === 100) {
      const r = toResult(best.feature, best.score, "address_exact");
      if (r) return r;
    }
    if (best.score >= 85) {
      const r = toResult(best.feature, best.score, "address_fuzzy");
      if (r) return r;
    }
  }

  // Tier 1b: Utah Address Points. Authoritative, and its ParcelID gives a direct
  // link to the lot — so an address the parcel layer records under a different
  // string still resolves. If the id lookup misses, the point itself is still a
  // far better geocode than street-centreline interpolation, so fall through to
  // containment using it.
  const pt = await queryAddressPoint(houseNumber, n);
  if (pt) {
    if (pt.parcelId) {
      const byId = await queryParcelById(pt.parcelId);
      if (byId) {
        const r = toResult(byId, 100, "address_point");
        if (r) return r;
      }
    }
    const contains = await pointInParcel(pt.lat, pt.lng);
    if (contains.length === 1) {
      const r = toResult(contains[0], 95, "address_point");
      if (r) return r;
    }
  }

  // Tier 2/3: geocode + spatial containment, corroborated by the point actually
  // falling inside the surveyed lot (tier 2) or, failing that, by both proximity
  // and a non-trivial text score agreeing (tier 3).
  const geocoded = await geocodeCensus(address, city);
  if (geocoded) {
    const hits = await pointInParcel(geocoded.lat, geocoded.lng);
    if (hits.length === 1) {
      const r = toResult(hits[0], best?.score ?? 0, "geocode_point");
      if (r) return r;
    } else if (hits.length > 1) {
      // ambiguous containment (shouldn't happen for a point query, but be safe):
      // pick the one whose address text also corroborates.
      let corroborated: { score: number; feature: any } | null = null;
      for (const f of hits) {
        const score = scoreCandidate(f.attributes?.PARCEL_ADD, n, houseNumber, streetWords);
        if (score >= 40 && (!corroborated || score > corroborated.score)) corroborated = { score, feature: f };
      }
      if (corroborated) {
        const r = toResult(corroborated.feature, corroborated.score, "geocode_point");
        if (r) return r;
      }
    }

    // Buffered fallback: only accept if a nearby candidate's address text also agrees —
    // proximity alone isn't enough near a shared property line.
    const nearby = await pointInParcel(geocoded.lat, geocoded.lng, 0.0007); // ~65-80m at this latitude
    let corroborated: { score: number; feature: any; dist: number } | null = null;
    for (const f of nearby) {
      const score = scoreCandidate(f.attributes?.PARCEL_ADD, n, houseNumber, streetWords);
      if (score < 40) continue;
      const ring = f.geometry?.rings?.[0];
      if (!ring) continue;
      const pin = interiorPin(ring);
      const dist = metersBetween(geocoded.lat, geocoded.lng, pin.lat, pin.lng);
      if (dist > 80) continue;
      if (!corroborated || score > corroborated.score) corroborated = { score, feature: f, dist };
    }
    if (corroborated) {
      const r = toResult(corroborated.feature, corroborated.score, "geocode_buffer");
      if (r) return r;
    }
  }

  return null;
}

export type ResolveAllOutcome = {
  id: string; address: string; city?: string | null; matched: string | null;
  radius_m?: number; score?: number; match_method?: ParcelResult["match_method"]; note?: string;
};

/**
 * Resolve every property missing a verified interior-pin fence — new addresses
 * (parcel_ring null) and previously centroid-pinned properties (concave-lot risk).
 * Shared by the staff-triggered API route and the hourly cron route so both stay
 * in lockstep with the same selection and write logic.
 */
export async function resolveAllUnresolvedProperties(
  db: import("@supabase/supabase-js").SupabaseClient,
  propertyId?: string
): Promise<ResolveAllOutcome[]> {
  let q = db.from("properties").select("id, address, city, state, parcel_ring, pin_method");
  q = propertyId ? q.eq("id", propertyId) : q.or("parcel_ring.is.null,pin_method.neq.interior_pin");

  const { data: props } = await q;
  const results: ResolveAllOutcome[] = [];
  for (const p of props ?? []) {
    const parcel = await resolveParcel(p.address, p.city);
    if (parcel) {
      await db.from("properties").update({
        lat: parcel.lat,
        lng: parcel.lng,
        geofence_radius_m: parcel.radius_m,
        parcel_address: parcel.parcel_address,
        parcel_ring: parcel.ring,
        pin_method: parcel.pin_method,
        fence_mode: "polygon",
        geocode_source: "ugrc_parcel",
        geocoded_at: new Date().toISOString(),
      }).eq("id", p.id);
      results.push({
        id: p.id, address: p.address, city: p.city, matched: parcel.parcel_address,
        radius_m: parcel.radius_m, score: parcel.score, match_method: parcel.match_method,
      });
    } else {
      results.push({ id: p.id, address: p.address, city: p.city, matched: null, note: "no parcel found in Utah's records — needs staff review" });
    }
  }
  return results;
}

/**
 * Address autocomplete against real county parcel records.
 *
 * Typing "2891 Highland" returns the actual parcels that exist, so a shorthand or
 * mistyped address gets corrected to a surveyed property instead of silently
 * geocoding to a guessed point on a street centerline.
 */
export type AddressSuggestion = {
  address: string;
  city: string | null;
  county: string | null;
  parcel_id: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  exact: boolean;
};

export async function suggestAddresses(query: string, limit = 8): Promise<AddressSuggestion[]> {
  const n = normalize(query);
  if (n.length < 4) return [];
  const parts = n.split(" ");
  const houseNumber = /^\d+$/.test(parts[0]) ? parts[0] : null;
  const streetWords = (houseNumber ? parts.slice(1) : parts).filter((w) => !DIRECTIONS.has(w));
  const token = streetWords.join(" ").replace(/'/g, "''");
  if (!token) return [];

  const where = `UPPER(PARCEL_ADD) LIKE '%${token}%' AND County IN ('${SERVICE_COUNTIES.join("','")}')`;

  const params = new URLSearchParams({
    where, outFields: "PARCEL_ADD,PARCEL_CITY,County,PARCEL_ID",
    returnGeometry: "true", outSR: "4326", resultRecordCount: "200", f: "json",
  });

  let json: any;
  try {
    json = await fetchJsonWithRetry(`${PARCEL_QUERY}?${params}`);
  } catch {
    return [];
  }

  const scored = (json?.features ?? []).map((f: any) => {
    const pa = normalize(f.attributes?.PARCEL_ADD);
    const paNum = pa.split(" ")[0];
    let score = 0;
    if (houseNumber) {
      if (paNum === houseNumber) score += 60;
      else if (/^\d+$/.test(paNum)) score += Math.max(0, 40 - Math.abs(Number(paNum) - Number(houseNumber)) / 5);
    }
    const ps = new Set(pa.split(" "));
    const overlap = streetWords.filter((w) => ps.has(w)).length;
    score += (overlap / Math.max(1, streetWords.length)) * 40;
    return { score, f, exact: houseNumber != null && paNum === houseNumber };
  }).sort((a: any, b: any) => b.score - a.score).slice(0, limit);

  const out: AddressSuggestion[] = [];
  for (const s of scored) {
    const ring = s.f.geometry?.rings?.[0];
    if (!ring) continue;
    const pin = interiorPin(ring);
    const radius_m = Math.max(farthestVertexMeters(pin, ring), 25);
    out.push({
      address: s.f.attributes?.PARCEL_ADD ?? "",
      city: s.f.attributes?.PARCEL_CITY ?? null,
      county: s.f.attributes?.County ?? null,
      parcel_id: s.f.attributes?.PARCEL_ID ?? null,
      lat: Number(pin.lat.toFixed(7)), lng: Number(pin.lng.toFixed(7)),
      radius_m: Number(radius_m.toFixed(1)),
      exact: s.exact,
    });
  }
  return out;
}
