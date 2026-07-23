/**
 * Utah parcel lookup — exact property boundaries, not estimates.
 *
 * Utah's Geospatial Resource Center publishes surveyed parcel polygons statewide
 * (~1.6M records). Given an address we pull the actual lot shape, compute its true
 * centroid, and measure the distance to the farthest boundary vertex. That distance
 * is the smallest circle that fully contains the property — which is exactly the
 * geofence we want, correct even for pie-shaped cul-de-sac lots and flag lots where
 * square-lot math is meaningfully wrong.
 */

const PARCEL_QUERY =
  "https://services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services/UtahStatewideParcels/FeatureServer/0/query";

const ABBREV: Record<string, string> = {
  " LANE": " LN", " DRIVE": " DR", " CIRCLE": " CIR", " COVE": " CV", " ROAD": " RD",
  " STREET": " ST", " COURT": " CT", " AVENUE": " AVE", " PLACE": " PL", " BOULEVARD": " BLVD",
  " PARKWAY": " PKWY", " TERRACE": " TER", " TRAIL": " TRL",
};

function normalize(a: string | null | undefined): string {
  let s = (a ?? "").toUpperCase().trim();
  for (const [k, v] of Object.entries(ABBREV)) s = s.split(k).join(v);
  return s.replace(/\s+/g, " ");
}

export function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** True polygon centroid (shoelace) + distance to farthest vertex. */
export function centroidAndRadius(ring: number[][]) {
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    A += cross; cx += (x0 + x1) * cross; cy += (y0 + y1) * cross;
  }
  A *= 0.5;
  if (Math.abs(A) < 1e-14) {
    cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  } else { cx /= 6 * A; cy /= 6 * A; }
  const radius = Math.max(...ring.map((p) => metersBetween(cy, cx, p[1], p[0])));
  return { lat: cy, lng: cx, radius_m: radius };
}

export type ParcelResult = {
  parcel_address: string | null;
  parcel_id: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  vertices: number;
  score: number;
};

export async function resolveParcel(address: string, city?: string | null): Promise<ParcelResult | null> {
  const n = normalize(address);
  const houseNumber = n.split(" ")[0];
  const street = n.split(" ").slice(1).join(" ");
  if (!houseNumber) return null;

  const wheres = [
    city ? `PARCEL_ADD LIKE '${houseNumber} %' AND UPPER(PARCEL_CITY)='${city.toUpperCase().replace(/'/g, "''")}'` : null,
    `PARCEL_ADD LIKE '${houseNumber} %' AND County IN ('SaltLake','Utah')`,
  ].filter(Boolean) as string[];

  for (const where of wheres) {
    const params = new URLSearchParams({
      where, outFields: "PARCEL_ADD,PARCEL_CITY,PARCEL_ID", returnGeometry: "true",
      outSR: "4326", resultRecordCount: "120", f: "json",
    });
    let json: any;
    try {
      const res = await fetch(`${PARCEL_QUERY}?${params}`, { cache: "no-store" });
      json = await res.json();
    } catch { continue; }

    let best: { score: number; feature: any } | null = null;
    for (const f of json?.features ?? []) {
      const pa = normalize(f.attributes?.PARCEL_ADD);
      let score: number;
      if (pa === n) score = 100;
      else {
        const ps = pa.split(" ").slice(1).join(" ");
        const a = new Set(street.split(" "));
        const b = new Set(ps.split(" "));
        const inter = [...a].filter((x) => b.has(x)).length;
        const union = new Set([...a, ...b]).size;
        score = (inter / Math.max(1, union)) * 100;
      }
      if (!best || score > best.score) best = { score, feature: f };
    }

    if (best && best.score >= 70) {
      const ring = best.feature.geometry?.rings?.[0];
      if (!ring) continue;
      const { lat, lng, radius_m } = centroidAndRadius(ring);
      return {
        parcel_address: best.feature.attributes?.PARCEL_ADD ?? null,
        parcel_id: best.feature.attributes?.PARCEL_ID ?? null,
        lat: Number(lat.toFixed(7)),
        lng: Number(lng.toFixed(7)),
        radius_m: Number(radius_m.toFixed(1)),
        vertices: ring.length,
        score: Math.round(best.score),
      };
    }
  }
  return null;
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
  const streetWords = (houseNumber ? parts.slice(1) : parts).filter((w) => !/^[NSEW]$/.test(w));
  const token = streetWords.join(" ").replace(/'/g, "''");
  if (!token) return [];

  const where = houseNumber
    ? `UPPER(PARCEL_ADD) LIKE '%${token}%' AND County IN ('SaltLake','Utah')`
    : `UPPER(PARCEL_ADD) LIKE '%${token}%' AND County IN ('SaltLake','Utah')`;

  const params = new URLSearchParams({
    where, outFields: "PARCEL_ADD,PARCEL_CITY,County,PARCEL_ID",
    returnGeometry: "true", outSR: "4326", resultRecordCount: "200", f: "json",
  });

  let json: any;
  try {
    const res = await fetch(`${PARCEL_QUERY}?${params}`, { cache: "no-store" });
    json = await res.json();
  } catch { return []; }

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
    const { lat, lng, radius_m } = centroidAndRadius(ring);
    out.push({
      address: s.f.attributes?.PARCEL_ADD ?? "",
      city: s.f.attributes?.PARCEL_CITY ?? null,
      county: s.f.attributes?.County ?? null,
      parcel_id: s.f.attributes?.PARCEL_ID ?? null,
      lat: Number(lat.toFixed(7)), lng: Number(lng.toFixed(7)),
      radius_m: Number(radius_m.toFixed(1)),
      exact: s.exact,
    });
  }
  return out;
}
