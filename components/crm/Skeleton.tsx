/**
 * Route-level loading skeleton.
 *
 * Every CRM page is force-dynamic, so a tap previously blocked on auth + query
 * + render with the old screen frozen in place — that was the half-second lag.
 * A loading.tsx lets Next stream the shell immediately and swap in real content
 * when it arrives, so navigation feels instant.
 */
export function Skeleton({ cards = 4, rows = 6 }: { cards?: number; rows?: number }) {
  return (
    <div className="animate-pulse">
      <div className="mb-2 h-3 w-24 rounded bg-white/[0.06]" />
      <div className="mb-6 h-8 w-48 rounded-lg bg-white/[0.08]" />

      {cards > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} className="mo-card h-[104px] p-4">
              <div className="mb-3 h-9 w-9 rounded-xl bg-white/[0.06]" />
              <div className="h-7 w-16 rounded bg-white/[0.08]" />
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="mo-card flex items-center gap-3 p-4" style={{ opacity: 1 - i * 0.12 }}>
            <div className="h-9 w-9 shrink-0 rounded-full bg-white/[0.06]" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-1/3 rounded bg-white/[0.08]" />
              <div className="h-3 w-1/2 rounded bg-white/[0.05]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
