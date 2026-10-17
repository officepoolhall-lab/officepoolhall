import { points } from "@/lib/format";
import type { StandingRow } from "@/lib/standings";

export function StandingsTable({ rows, me, limit }: { rows: StandingRow[]; me: string; limit?: number }) {
  const shown = limit ? rows.slice(0, limit) : rows;
  const mine = rows.find((r) => r.userId === me);
  const pinned = limit && mine && !shown.includes(mine) ? mine : null;

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {shown.map((r) => <Row key={r.userId} r={r} me={me} />)}
      {pinned && (
        <>
          <li className="h-2 bg-raised" aria-hidden />
          <Row r={pinned} me={me} />
        </>
      )}
    </ul>
  );
}

function Row({ r, me }: { r: StandingRow; me: string }) {
  return (
    <li className={`flex min-h-11 items-center gap-3 px-3 ${r.userId === me ? "bg-brass/15 font-semibold" : ""}`}>
      <span className="w-6 text-right font-display text-lg font-bold tabular-nums text-muted">{r.rank}</span>
      <span className="flex-1 truncate">
        {r.name}
        {r.userId === me && <span className="ml-1 text-xs font-normal text-muted">you</span>}
      </span>
      <span className="text-xs tabular-nums text-muted">
        {r.wins}–{r.losses}
        {r.pushes ? `–${r.pushes}` : ""}
      </span>
      <span className="w-12 text-right font-display text-xl font-bold tabular-nums">{points(r.points)}</span>
    </li>
  );
}
