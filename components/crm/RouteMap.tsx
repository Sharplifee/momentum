"use client";

import { useEffect, useRef, useState } from "react";

export type RouteStop = {
  id: string; n: number; name: string; address: string; city: string | null;
  lat: number | null; lng: number | null; done: boolean; active: boolean; weather_flag: boolean;
  window_start: string | null;
};

declare global { interface Window { mapkit: any } }
const SERVICE_AREA = { lat: 40.5622, lng: -111.9297, span: 0.34 };

/**
 * Today's route on a map: numbered stops in order, the line between them,
 * finished stops in sage, the next one in bone. No drive-time or mileage is
 * shown because nothing here computes them — Apple Maps does that on tap.
 */
export function RouteMap({ token, stops }: { token: string | null; stops: RouteStop[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!token || map.current) return;
    let cancelled = false;
    function init() {
      if (cancelled || !el.current || map.current) return;
      const mk = window.mapkit;
      mk.init({ authorizationCallback: (done: any) => done(token) });
      map.current = new mk.Map(el.current, {
        showsCompass: mk.FeatureVisibility.Hidden, showsScale: mk.FeatureVisibility.Hidden,
        showsMapTypeControl: false, showsZoomControl: false,
        colorScheme: mk.Map.ColorSchemes.Dark,
      });
      const placed = stops.filter((s) => s.lat && s.lng);
      if (!placed.length) {
        map.current.region = new mk.CoordinateRegion(new mk.Coordinate(SERVICE_AREA.lat, SERVICE_AREA.lng), new mk.CoordinateSpan(SERVICE_AREA.span, SERVICE_AREA.span));
        return;
      }
      const coords = placed.map((s) => new mk.Coordinate(s.lat!, s.lng!));
      const line = new mk.PolylineOverlay(coords, { style: new mk.Style({ strokeColor: "#7ac1c9", lineWidth: 3, lineJoin: "round" }) });
      map.current.addOverlay(line);
      const items = placed.map((s) => new mk.MarkerAnnotation(new mk.Coordinate(s.lat!, s.lng!), {
        color: s.done ? "#86b67a" : s.active ? "#f2efe8" : "#7ac1c9",
        glyphText: String(s.n), title: s.name, subtitle: [s.address, s.city].filter(Boolean).join(", "),
      }));
      map.current.addAnnotations(items);
      map.current.showItems(items, { animate: false, padding: new mk.Padding(48, 32, 48, 32) });
    }
    if (window.mapkit) { init(); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js"; s.crossOrigin = "anonymous";
    s.onload = init; s.onerror = () => setErr("Couldn't load the map.");
    document.head.appendChild(s);
    return () => { cancelled = true; };
  }, [token, stops]);

  const placed = stops.filter((s) => s.lat && s.lng).length;
  const next = stops.find((s) => s.active);
  const allHref = next ? `https://maps.apple.com/?daddr=${next.lat && next.lng ? `${next.lat},${next.lng}` : encodeURIComponent(`${next.address} ${next.city ?? ""}`)}` : null;

  return (
    <div className="relative -mx-4 h-[48dvh] min-h-[300px] overflow-hidden border-y border-[color:var(--border)] md:mx-0 md:h-[460px] md:rounded-2xl md:border">
      {token ? <div ref={el} className="h-full w-full" /> : (
        <div className="grid h-full place-items-center text-sm text-[color:var(--body)]">The map needs its Apple Maps token before it can draw.</div>
      )}
      {err && <div className="absolute inset-x-0 bottom-0 bg-black/70 px-4 py-2 text-sm text-white">{err}</div>}
      <div className="pointer-events-none absolute inset-x-4 top-3 flex items-center justify-between gap-2">
        <span className="mo-eyebrow rounded-full border border-[color:var(--border)] bg-[#0a0a0a]/90 px-3 py-1.5 text-[color:var(--ink)]">
          {stops.length} stop{stops.length === 1 ? "" : "s"}{placed < stops.length ? ` · ${stops.length - placed} unmapped` : ""}{allHref ? " · Apple Maps" : ""}
        </span>
        {next && (
          <span className="mo-eyebrow rounded-full border border-teal/40 bg-[#0a0a0a]/90 px-3 py-1.5 text-teal">
            Next · {next.name.split(" ").slice(-1)[0]}
          </span>
        )}
      </div>
    </div>
  );
}
