/**
 * The service area, without a database.
 *
 * Client components and anything that must not pull the service-role client
 * into the browser bundle read this. It is also the fallback when the zones
 * query fails — better a slightly stale band than a page that renders no
 * service area at all.
 *
 * Keep it matching the active rows in `zones`. It is a safety net, not a
 * second source of truth.
 */
export type ServiceArea = {
  phrase: string;   // for prose: "the south Salt Lake Valley"
  short: string;    // for titles: "South Salt Lake Valley"
  cities: string[];
};

export const SERVICE_AREA_FALLBACK: ServiceArea = {
  phrase: "the south Salt Lake Valley",
  short: "South Salt Lake Valley",
  cities: [
    "Draper", "Bluffdale", "Suncrest",
    "South Jordan", "Riverton", "Daybreak",
    "Herriman", "Rosecrest",
    "Sandy", "Granite", "Cottonwood Heights",
    "West Jordan", "Midvale", "White City", "Copperton",
  ],
};
