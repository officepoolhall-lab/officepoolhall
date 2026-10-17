// Loading placeholders for route transitions (loading.tsx). Shaped like the real pages so
// switching tabs shows the next page's outline immediately while its data streams in.

export function Bar({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded-md bg-surface ${className}`} aria-hidden />;
}

export function TitleSkeleton() {
  return (
    <div className="mb-5 space-y-2" aria-hidden>
      <Bar className="h-7 w-40" />
      <Bar className="h-4 w-56" />
    </div>
  );
}

/** Hairline rows like the standings / roster / pools lists. */
export function RowsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-line" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex h-12 items-center gap-3">
          <Bar className="h-4 w-5" />
          <Bar className="h-4 flex-1" />
          <Bar className="h-4 w-12" />
        </li>
      ))}
    </ul>
  );
}

/** Game blocks like the pick board: status line, two team rows with cells. */
export function GamesSkeleton({ games = 4 }: { games?: number }) {
  return (
    <div className="divide-y divide-line" aria-hidden>
      {Array.from({ length: games }, (_, i) => (
        <div key={i} className="space-y-2 py-3">
          <Bar className="h-3 w-28" />
          {[0, 1].map((r) => (
            <div key={r} className="flex items-center gap-3">
              <Bar className="size-8 rounded-full" />
              <Bar className="h-4 flex-1" />
              <Bar className="h-14 w-[4.5rem] rounded-[10px]" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({ children }: { children?: React.ReactNode }) {
  return (
    <div role="status" aria-label="Loading">
      <TitleSkeleton />
      {children ?? <RowsSkeleton />}
    </div>
  );
}
