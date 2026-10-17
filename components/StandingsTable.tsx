import { points } from "@/lib/format";
import type { StandingRow } from "@/lib/standings";

/**
 * `weekly` marks a one-week table, where a player with no picks gets a "No picks" note; a
 * season table counts the weeks they missed instead, since those totals are filled in.
 */
export function StandingsTable({ rows, me, limit, weekly = false }: { rows: StandingRow[]; me: string; limit?: number; weekly?: boolean }) {
  const shown = limit ? rows.slice(0, limit) : rows;
  const mine = rows.find((r) => r.userId === me);
  const pinned = limit && mine && !shown.includes(mine) ? mine : null;

  return (
    <ul className="divide-y divide-line border-b border-line">
      {shown.map((r) => <Row key={r.userId} r={r} me={me} weekly={weekly} />)}
      {pinned && (
        <>
          <li className="py-1 text-center text-xs leading-none text-faint" aria-hidden>···</li>
          <Row r={pinned} me={me} weekly={weekly} />
        </>
      )}
    </ul>
  );
}

function Row({ r, me, weekly }: { r: StandingRow; me: string; weekly: boolean }) {
  const mine = r.userId === me;
  return (
    <li className="flex min-h-12 items-center gap-3 py-3">
      <span className="w-6 text-right text-sm tabular-nums text-muted">{r.rank}</span>
      <span className="min-w-0 flex-1 truncate font-medium">
        <span className={mine ? "text-accent" : ""}>{r.name}</span>
        {mine && <span className="ml-1.5 text-xs font-normal text-muted">You</span>}
        {/* Their score comes from settings.missed_week (0 or the week's last place). */}
        {r.missed > 0 && (
          <span className="ml-1.5 text-xs font-normal text-muted">{weekly ? "No picks" : `${r.missed} missed`}</span>
        )}
      </span>
      <span className="text-xs tabular-nums text-muted">
        {r.wins}–{r.losses}
        {r.pushes ? `–${r.pushes}` : ""}
      </span>
      <span className="w-12 text-right text-[17px] font-semibold tabular-nums">{points(r.points)}</span>
    </li>
  );
}
