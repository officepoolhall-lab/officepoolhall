import { points } from "@/lib/format";
import type { StandingRow } from "@/lib/standings";

export function StandingsTable({ rows, me, limit }: { rows: StandingRow[]; me: string; limit?: number }) {
  const shown = limit ? rows.slice(0, limit) : rows;
  const mine = rows.find((r) => r.userId === me);
  const pinned = limit && mine && !shown.includes(mine) ? mine : null;

  return (
    <ul className="divide-y divide-line border-b border-line">
      {shown.map((r) => <Row key={r.userId} r={r} me={me} />)}
      {pinned && (
        <>
          <li className="py-1 text-center text-xs leading-none text-faint" aria-hidden>···</li>
          <Row r={pinned} me={me} />
        </>
      )}
    </ul>
  );
}

function Row({ r, me }: { r: StandingRow; me: string }) {
  const mine = r.userId === me;
  return (
    <li className="flex min-h-12 items-center gap-3 py-3">
      <span className="w-6 text-right text-sm tabular-nums text-muted">{r.rank}</span>
      <span className="min-w-0 flex-1 truncate font-medium">
        <span className={mine ? "text-accent" : ""}>{r.name}</span>
        {mine && <span className="ml-1.5 text-xs font-normal text-muted">You</span>}
      </span>
      <span className="text-xs tabular-nums text-muted">
        {r.wins}–{r.losses}
        {r.pushes ? `–${r.pushes}` : ""}
      </span>
      <span className="w-12 text-right text-[17px] font-semibold tabular-nums">{points(r.points)}</span>
    </li>
  );
}
