"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Stop = {
  id: string;
  kind: "service" | "quote";
  date: string;
  status: string;
  name: string;
  address: string;
  city: string | null;
  lat: number;
  lng: number;
  ring: number[][] | null;
  radius_m: number | null;
};

type Filter = "all" | "service" | "quote";
type Range = "day" | "week" | "month";

declare global { interface Window { mapkit: any } }

/**
 * The schedule, on a map.
 *
 * Service properties are drawn as their real surveyed lot, not a circle around
 * a pin — a circle overshoots these parcels by 117% to 525%, so it tells a crew
 * member the wrong thing about where a property ends. Quote visits are leads
 * with no surveyed parcel, so they get a pin and nothing more, because drawing
 * a boundary nobody has measured would be a lie.
 */
export function ScheduleMap({ token }: { token: string | null }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const drawn = useRef<any[]>([]);

  const [range, setRange] = useState<Range>("day");
  const [filter, setFilter] = useState<Filter>("all");
  const [day, setDay] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const window_ = useCallback(() => {
    const d = new Date(day + "T12:00:00");
    if (range === "day") return { from: day, to: day };
    if (range === "week") {
      const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { from: mon.toLocaleDateString("en-CA"), to: sun.toLocaleDateString("en-CA") };
    }
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { from: first.toLocaleDateString("en-CA"), to: last.toLocaleDateString("en-CA") };
  }, [day, range]);

  // ---- load MapKit once ----
  useEffect(() => {
    if (!token || map.current) return;
    let cancelled = false;

    function init() {
      if (cancelled || !el.current || map.current) return;
      window.mapkit.init({ authorizationCallback: (done: any) => done(token) });
      map.current = new window.mapkit.Map(el.current, {
        showsCompass: window.mapkit.FeatureVisibility.Hidden,
        showsScale: window.mapkit.FeatureVisibility.Adaptive,
        colorScheme: window.mapkit.Map.ColorSchemes.Dark,
      });
    }

    if (window.mapkit) { init(); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js";
    s.crossOrigin = "anonymous";
    s.onload = init;
    s.onerror = () => setErr("Couldn't load the map.");
    document.head.appendChild(s);
    return () => { cancelled = true; };
  }, [token]);

  // ---- fetch the window ----
  useEffect(() => {
    const { from, to } = window_();
    setLoading(true); setErr("");
    fetch(`/api/crm/map?from=${from}&to=${to}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d) => setStops(d.stops ?? []))
      .catch(() => setErr("Couldn't load the schedule."))
      .finally(() => setLoading(false));
  }, [window_]);

  // ---- draw ----
  useEffect(() => {
    if (!map.current || !window.mapkit) return;
    const mk = window.mapkit;

    map.current.removeItems(drawn.current.filter((x) => x.coordinate));
    map.current.removeOverlays(drawn.current.filter((x) => !x.coordinate));
    drawn.current = [];

    const shown = stops.filter((s) => filter === "all" || s.kind === filter);
    if (!shown.length) return;

    const teal = "#7FB8BE", gold = "#D9A441";
    const items: any[] = [], overlays: any[] = [];

    for (const s of shown) {
      const colour = s.kind === "service" ? teal : gold;
      const coord = new mk.Coordinate(s.lat, s.lng);

      if (s.ring?.length) {
        // The real lot.
        overlays.push(new mk.PolygonOverlay(
          [s.ring.map(([lng, lat]) => new mk.Coordinate(lat, lng))],
          { style: new mk.Style({ fillColor: colour, fillOpacity: 0.18,
                                  strokeColor: colour, lineWidth: 1.5 }) }
        ));
      } else if (s.radius_m) {
        overlays.push(new mk.CircleOverlay(coord, s.radius_m, {
          style: new mk.Style({ fillColor: colour, fillOpacity: 0.14,
                                strokeColor: colour, lineWidth: 1.5 }),
        }));
      }

      items.push(new mk.MarkerAnnotation(coord, {
        color: colour,
        glyphText: s.kind === "service" ? "✓" : "$",
        title: s.name,
        subtitle: [s.address, s.city].filter(Boolean).join(", "),
      }));
    }

    map.current.addOverlays(overlays);
    map.current.addAnnotations(items);
    drawn.current = [...overlays, ...items];
    map.current.showItems(items, { animate: true, padding: new mk.Padding(56, 56, 56, 56) });
  }, [stops, filter]);

  if (!token) {
    return (
      <div className="mo-card p-5 text-sm text-[color:var(--body)]">
        The map needs its Apple Maps token before it can draw.
      </div>
    );
  }

  const counts = {
    service: stops.filter((s) => s.kind === "service").length,
    quote: stops.filter((s) => s.kind === "quote").length,
  };
  const chip = (on: boolean) =>
    `min-h-[44px] rounded-xl px-4 text-sm transition ${
      on ? "border border-teal/40 bg-teal/15 font-semibold text-teal"
         : "border border-transparent text-[color:var(--body)] hover:border-[color:var(--border)] hover:text-[color:var(--ink)]"
    }`;

  return (
    <section className="mb-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {(["day", "week", "month"] as Range[]).map((r) => (
            <button key={r} onClick={() => setRange(r)} className={chip(range === r)}>
              {r[0].toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1.5">
          <button onClick={() => setFilter("all")} className={chip(filter === "all")}>
            All <span className="opacity-70">{counts.service + counts.quote}</span>
          </button>
          <button onClick={() => setFilter("service")} className={chip(filter === "service")}>
            Service <span className="opacity-70">{counts.service}</span>
          </button>
          <button onClick={() => setFilter("quote")} className={chip(filter === "quote")}>
            Quotes <span className="opacity-70">{counts.quote}</span>
          </button>
        </div>
      </div>

      <input type="date" value={day} onChange={(e) => setDay(e.target.value)}
        className="mb-3 min-h-[44px] rounded-xl border border-[color:var(--border)] bg-[color:var(--bg)] px-3 text-sm" />

      <div className="relative overflow-hidden rounded-2xl border border-[color:var(--border)]">
        <div ref={el} className="h-[420px] w-full sm:h-[520px]" />
        {loading && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/25 text-sm text-white">
            Loading…
          </div>
        )}
        {err && (
          <div className="absolute inset-x-0 bottom-0 bg-black/70 px-4 py-2 text-sm text-white">{err}</div>
        )}
        {!loading && !err && !stops.length && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-[color:var(--body)]">
            Nothing scheduled in this window.
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-[color:var(--body)]">
        Teal is service, gold is a quote visit. Service properties show their real lot boundary
        where we have one.
      </p>
    </section>
  );
}
