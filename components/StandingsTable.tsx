import { points } from "@/lib/format";
import { winPct } from "@/lib/record";
import type { StandingRow } from "@/lib/standings";

/**
 * `weekly` marks a one-week table, where a player with no picks gets a "No picks" note; a
 * season table counts the weeks they missed instead, since those totals are filled in.
 * `flat` (no confidence points) leads with the W–L record and win %; points stay secondary.
 */
export function StandingsTable({
  rows,
  me,
  limit,
  weekly = false,
  flat = false,
  total = false,
  compact = false,
}: {
  rows: StandingRow[];
  me: string;
  limit?: number;
  weekly?: boolean;
  flat?: boolean;
  /** Add a "Pool total" row under the last player: everyone's combined record and win %. */
  total?: boolean;
  /** Tighter rows (36px) for side panels like Home. */
  compact?: boolean;
}) {
  const shown = limit ? rows.slice(0, limit) : rows;
  const mine = rows.find((r) => r.userId === me);
  const pinned = limit && mine && !shown.includes(mine) ? mine : null;

  return (
    <ul className="divide-y divide-line border-b border-line">
      {shown.map((r) => <Row key={r.userId} r={r} me={me} weekly={weekly} flat={flat} compact={compact} />)}
      {pinned && (
        <>
          <li className="py-1 text-center text-xs leading-none text-faint" aria-hidden>···</li>
          <Row r={pinned} me={me} weekly={weekly} flat={flat} compact={compact} />
        </>
      )}
      {total && rows.length > 0 && <TotalRow rows={rows} />}
    </ul>
  );
}

function TotalRow({ rows }: { rows: StandingRow[] }) {
  const t = rows.reduce(
    (sum, r) => ({ wins: sum.wins + r.wins, losses: sum.losses + r.losses, pushes: sum.pushes + r.pushes }),
    { wins: 0, losses: 0, pushes: 0 },
  );
  const record = `${t.wins}–${t.losses}${t.pushes ? `–${t.pushes}` : ""}`;
  // Record and win % only: a combined points total doesn't mean much.
  return (
    <li className="flex min-h-12 items-center gap-3 py-3 text-muted">
      <span className="w-6" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">Pool total</span>
      <span className="w-10 text-right text-xs tabular-nums" aria-label="Win percentage">{winPct(t.wins, t.losses)}</span>
      <span className="min-w-14 text-right text-[17px] font-semibold tabular-nums text-ink" aria-label="Record">{record}</span>
    </li>
  );
}

function Row({ r, me, weekly, flat, compact }: { r: StandingRow; me: string; weekly: boolean; flat: boolean; compact: boolean }) {
  const mine = r.userId === me;
  const record = `${r.wins}–${r.losses}${r.pushes ? `–${r.pushes}` : ""}`;
  return (
    <li className={`flex items-center gap-3 ${compact ? "min-h-9 py-1.5 text-sm" : "min-h-12 py-3"}`}>
      <span className="w-6 text-right text-sm tabular-nums text-muted">{r.rank}</span>
      <span className="min-w-0 flex-1 truncate font-medium">
        <span className={mine ? "text-accent" : ""}>{r.name}</span>
        {mine && <span className="ml-1.5 text-xs font-normal text-muted">You</span>}
        {/* Their score comes from settings.missed_week (0 or the week's last place). */}
        {r.missed > 0 && (
          <span className="ml-1.5 text-xs font-normal text-muted">{weekly ? "No picks" : `${r.missed} missed`}</span>
        )}
      </span>
      {flat ? (
        <>
          {/* Points only differ from wins when pushes or custom scoring count. */}
          {r.points !== r.wins && <span className="text-xs tabular-nums text-muted">{points(r.points)} pts</span>}
          <span className="w-10 text-right text-xs tabular-nums text-muted" aria-label="Win percentage">{winPct(r.wins, r.losses)}</span>
          <span className={`min-w-14 text-right ${compact ? "text-[15px]" : "text-[17px]"} font-semibold tabular-nums`} aria-label="Record">{record}</span>
        </>
      ) : (
        <>
          <span className="text-xs tabular-nums text-muted">{record}</span>
          <span className={`w-12 text-right ${compact ? "text-[15px]" : "text-[17px]"} font-semibold tabular-nums`}>{points(r.points)}</span>
        </>
      )}
    </li>
  );
}
