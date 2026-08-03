/**
 * Address intelligence.
 *
 * A geocoder that only answers "no match" is close to useless for field work:
 * the address is usually nearly right, and a human looking at the street would
 * spot the problem in seconds. This module does what that human does — checks
 * whether the street exists, whether the house number is one digit out, whether
 * a direction prefix is missing or flipped, whether the city is simply named
 * something else locally — and returns ranked suggestions with a confidence and
 * a plain-English reason, rather than a failure.
 *
 * Nothing here silently overwrites an address. High-confidence corrections can
 * be auto-applied by the caller; anything less is surfaced for a human.
 */

const ADDRESS_POINTS =
  "https://services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services/UtahAddressPoints/FeatureServer/0/query";

/** Salt Lake + Utah county, the service area, with a little slack. */
const AREA_ENVELOPE = "-112.30,40.05,-111.40,41.00";

const SUFFIX: Record<string, string> = {
  DRIVE: "DR", LANE: "LN", CIRCLE: "CIR", COVE: "CV", ROAD: "RD", STREET: "ST",
  COURT: "CT", AVENUE: "AVE", PLACE: "PL", BOULEVARD: "BLVD", PARKWAY: "PKWY",
  TERRACE: "TER", TRAIL: "TRL", HIGHWAY: "HWY", CANYON: "CYN",
};

/** Interchangeable suffixes — people write Cir for Ct, Dr for Ln, constantly. */
const SUFFIX_NEIGHBOURS: Record<string, string[]> = {
  DR: ["LN", "CIR", "CT", "WAY", "RD"],
  LN: ["DR", "CIR", "CT", "WAY"],
  CIR: ["CT", "DR", "LN", "WAY"],
  CT: ["CIR", "DR", "LN"],
  WAY: ["DR", "LN", "CIR"],
  RD: ["DR", "LN"],
  ST: ["AVE", "DR"],
  AVE: ["ST", "DR"],
};

const DIRECTIONS = ["N", "S", "E", "W"];

/**
 * Cities people say vs cities the state records. "Granite" is a Salt Lake
 * County place name that is not an incorporated city; mail there is Cottonwood
 * Heights or Sandy. These are the ones that actually appear in Utah addressing.
 */
const CITY_ALIASES: Record<string, string[]> = {
  GRANITE: ["COTTONWOOD HEIGHTS", "SANDY CITY", "SALT LAKE CITY"],
  "COTTONWOOD HEIGHTS": ["GRANITE", "SANDY CITY"],
  HOLLADAY: ["CITY OF HOLLADAY", "MILLCREEK", "SALT LAKE CITY"],
  MILLCREEK: ["SALT LAKE CITY", "CITY OF HOLLADAY"],
  DRAPER: ["DRAPER CITY (SL CO)", "DRAPER CITY (UT CO)", "SANDY CITY", "RIVERTON"],
  SANDY: ["SANDY CITY", "COTTONWOOD HEIGHTS", "DRAPER CITY (SL CO)"],
  "WEST JORDAN": ["WEST JORDAN CITY", "SOUTH JORDAN"],
  "SOUTH JORDAN": ["SOUTH JORDAN CITY", "WEST JORDAN CITY", "RIVERTON"],
  RIVERTON: ["HERRIMAN TOWN", "SOUTH JORDAN CITY", "BLUFFDALE"],
  BLUFFDALE: ["RIVERTON", "DRAPER CITY (SL CO)"],
  LEHI: ["LEHI CITY", "SARATOGA SPRINGS", "AMERICAN FORK"],
  "EAGLE MOUNTAIN": ["SARATOGA SPRINGS", "LEHI"],
};

export function normalizeAddress(raw: string | null | undefined): string {
  const s = (raw ?? "").toUpperCase().replace(/[.,]/g, " ");
  return s.split(/\s+/).filter(Boolean).map((w) => SUFFIX[w] ?? w).join(" ");
}

/** Street identity: everything after the house number, ignoring direction. */
export function streetKey(full: string | null | undefined): string {
  const parts = normalizeAddress(full).split(" ").slice(1);
  if (parts[0] && DIRECTIONS.includes(parts[0])) parts.shift();
  return parts.join(" ");
}

function houseNumber(full: string): number | null {
  const n = normalizeAddress(full).split(" ")[0];
  return /^\d+$/.test(n) ? Number(n) : null;
}

function cityMatches(want: string | null | undefined, got: string | null | undefined): boolean {
  if (!want || !got) return false;
  const w = want.toUpperCase().trim();
  const g = got.toUpperCase().trim();
  if (g.includes(w) || w.includes(g)) return true;
  return (CITY_ALIASES[w] ?? []).some((alias) => g.includes(alias) || alias.includes(g));
}

async function fetchJson(url: string, attempts = 4): Promise<any> {
  let wait = 500;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(45_000) });
      if (res.ok) {
        const json = await res.json();
        if (!json?.error) return json;
      }
    } catch {
      /* ArcGIS returns 503 intermittently; that is what the retry is for */
    }
    await new Promise((r) => setTimeout(r, wait));
    wait *= 2;
  }
  return null;
}

export type AddressCandidate = {
  full_address: string;
  city: string;
  parcel_id: string | null;
  lat: number;
  lng: number;
  confidence: number;          // 0-100
  reason: string;              // plain English, shown to staff
  auto_applicable: boolean;    // safe to write without a human looking
};

/**
 * Everything on the same street, anywhere in the service area. One query, then
 * all the reasoning happens locally — the street is the anchor, because a wrong
 * house number is common and a wrong street name is rare.
 */
async function fetchStreet(address: string): Promise<any[]> {
  const key = streetKey(address);
  if (!key) return [];
  const firstWord = key.split(" ")[0].replace(/'/g, "''");
  const params = new URLSearchParams({
    where: `StreetName LIKE '${firstWord}%'`,
    outFields: "FullAdd,City,ParcelID",
    returnGeometry: "true",
    outSR: "4326",
    resultRecordCount: "2000",
    f: "json",
    geometry: AREA_ENVELOPE,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
  });
  const data = await fetchJson(`${ADDRESS_POINTS}?${params.toString()}`);
  const feats: any[] = data?.features ?? [];
  return feats.filter((f) => streetKey(f.attributes?.FullAdd) === key);
}

/**
 * Rank plausible corrections for an address that did not match exactly.
 *
 * Confidence reflects how ordinary the mistake is. A house number one digit out
 * on the right street in the right city is a typo and scores high. A number two
 * hundred out is a different property and scores low, so it surfaces as a
 * question rather than an answer.
 */
export async function suggestCorrections(
  address: string,
  city?: string | null,
  limit = 4
): Promise<AddressCandidate[]> {
  const wanted = normalizeAddress(address);
  const wantedNum = houseNumber(address);
  const parts = wanted.split(" ");
  const wantedDir = parts[1] && DIRECTIONS.includes(parts[1]) ? parts[1] : null;

  const onStreet = await fetchStreet(address);
  if (!onStreet.length) return [];

  const out: AddressCandidate[] = [];

  for (const f of onStreet) {
    const a = f.attributes ?? {};
    const full = a.FullAdd as string;
    const g = f.geometry;
    if (!full || typeof g?.y !== "number" || typeof g?.x !== "number") continue;

    const num = houseNumber(full);
    const norm = normalizeAddress(full);
    const theirParts = norm.split(" ");
    const theirDir = theirParts[1] && DIRECTIONS.includes(theirParts[1]) ? theirParts[1] : null;

    const sameCity = cityMatches(city, a.City);
    const numDelta = wantedNum != null && num != null ? Math.abs(num - wantedNum) : null;

    let confidence = 0;
    const reasons: string[] = [];

    if (norm === wanted) {
      confidence = 100;
      reasons.push("exact match");
    } else if (numDelta === 0) {
      // same number, so the difference is a direction prefix or suffix variant
      confidence = sameCity ? 92 : 78;
      if (!wantedDir && theirDir) reasons.push(`missing "${theirDir}" prefix`);
      else if (wantedDir && theirDir && wantedDir !== theirDir) reasons.push(`direction is ${theirDir}, not ${wantedDir}`);
      else reasons.push("street suffix differs");
    } else if (numDelta != null && numDelta <= 2) {
      confidence = sameCity ? 88 : 72;
      reasons.push(`house number out by ${numDelta}`);
    } else if (numDelta != null && numDelta <= 10) {
      confidence = sameCity ? 74 : 56;
      reasons.push(`house number out by ${numDelta}`);
    } else if (numDelta != null && numDelta <= 60) {
      confidence = sameCity ? 52 : 34;
      reasons.push(`nearest number on this street, ${numDelta} away`);
    } else {
      continue; // too far to be a typo — that is a different property
    }

    if (!sameCity && city) reasons.push(`recorded in ${a.City}, not ${city}`);
    if (wantedDir && theirDir && wantedDir !== theirDir && numDelta !== 0) {
      confidence -= 8;
      reasons.push(`direction ${theirDir}`);
    }

    out.push({
      full_address: full,
      city: a.City ?? "",
      parcel_id: a.ParcelID ?? null,
      lat: g.y,
      lng: g.x,
      confidence: Math.max(0, Math.min(100, Math.round(confidence))),
      reason: reasons.join("; "),
      auto_applicable: confidence >= 88,
    });
  }

  out.sort((a, b) => b.confidence - a.confidence);

  // collapse duplicates of the same corrected address
  const seen = new Set<string>();
  return out.filter((c) => {
    const k = `${c.full_address}|${c.city}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, limit);
}
