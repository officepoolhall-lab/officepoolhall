import Link from "next/link";
import { points } from "@/lib/format";
import { winPct } from "@/lib/record";
import type { StandingRow } from "@/lib/standings";

/**
 * `weekly` marks a one-week table, where a player with no picks gets a "No picks" note; a
 * season table counts the weeks they missed instead, since those totals are filled in.
 * `flat` (no confidence points) leads with the W–L record and win %; points stay secondary.
 */
/** An extra record column: each player's W–L(–P) over another span (this week, a bonus segment). */
export type Extra = { label: string; values: Map<string, Pick<StandingRow, "wins" | "losses" | "pushes">> };

const recordText = (r: Pick<StandingRow, "wins" | "losses" | "pushes">) => `${r.wins}–${r.losses}${r.pushes ? `–${r.pushes}` : ""}`;

export function StandingsTable({
  rows,
  me,
  limit,
  weekly = false,
  flat = false,
  total = false,
  compact = false,
  extras,
  playerHref,
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
  /**
   * Extra record columns before the overall numbers, e.g. this week's and this bonus segment's
   * records on the season table. Adds a header row so the columns read clearly.
   */
  extras?: Extra[];
  /** Where a player's name links (their week-by-week history). */
  playerHref?: (userId: string) => string;
}) {
  const shown = limit ? rows.slice(0, limit) : rows;
  const mine = rows.find((r) => r.userId === me);
  const pinned = limit && mine && !shown.includes(mine) ? mine : null;

  return (
    <ul className="divide-y divide-line border-b border-line">
      {extras?.length ? <HeaderRow extras={extras} flat={flat} /> : null}
      {shown.map((r) => <Row key={r.userId} r={r} me={me} weekly={weekly} flat={flat} compact={compact} extras={extras} playerHref={playerHref} />)}
      {pinned && (
        <>
          <li className="py-1 text-center text-xs leading-none text-faint" aria-hidden>···</li>
          <Row r={pinned} me={me} weekly={weekly} flat={flat} compact={compact} extras={extras} playerHref={playerHref} />
        </>
      )}
      {total && rows.length > 0 && <TotalRow rows={rows} extras={extras} flat={flat} />}
    </ul>
  );
}

/** Column labels, shown only when extra columns are on (widths match Row's). */
function HeaderRow({ extras, flat }: { extras: Extra[]; flat: boolean }) {
  return (
    <li className="flex items-end gap-3 pb-1.5 pt-2 text-[11px] font-medium text-muted" aria-hidden>
      <span className="w-6" />
      <span className="min-w-0 flex-1">Player</span>
      {extras.map((e) => (
        <span key={e.label} className="w-16 text-right">{e.label}</span>
      ))}
      {flat ? (
        <>
          <span className="w-14" />
          <span className="w-10 text-right">Win %</span>
          <span className="min-w-14 text-right">Record</span>
        </>
      ) : (
        <>
          <span className="w-16 text-right">Record</span>
          <span className="w-12 text-right">Pts</span>
        </>
      )}
    </li>
  );
}

function TotalRow({ rows, extras, flat }: { rows: StandingRow[]; extras?: Extra[]; flat: boolean }) {
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
      {/* Keep the record under the record column when extra columns are on. */}
      {extras?.map((e) => <span key={e.label} className="w-16" aria-hidden />)}
      {extras?.length && flat ? <span className="w-14" aria-hidden /> : null}
      <span className="w-10 text-right text-xs tabular-nums" aria-label="Win percentage">{winPct(t.wins, t.losses)}</span>
      <span className="min-w-14 text-right text-[17px] font-semibold tabular-nums text-ink" aria-label="Record">{record}</span>
    </li>
  );
}

function Row({
  r,
  me,
  weekly,
  flat,
  compact,
  extras,
  playerHref,
}: {
  r: StandingRow;
  me: string;
  weekly: boolean;
  flat: boolean;
  compact: boolean;
  extras?: Extra[];
  playerHref?: (userId: string) => string;
}) {
  const columns = Boolean(extras?.length);
  const mine = r.userId === me;
  const record = `${r.wins}–${r.losses}${r.pushes ? `–${r.pushes}` : ""}`;
  return (
    <li className={`flex items-center gap-3 ${compact ? "min-h-9 py-1.5 text-sm" : "min-h-12 py-3"}`}>
      <span className="w-6 text-right text-sm tabular-nums text-muted">{r.rank}</span>
      <span className="min-w-0 flex-1 truncate font-medium">
        {playerHref ? (
          <Link href={playerHref(r.userId)} className={`hover:underline ${mine ? "text-accent" : ""}`}>{r.name}</Link>
        ) : (
          <span className={mine ? "text-accent" : ""}>{r.name}</span>
        )}
        {mine && <span className="ml-1.5 text-xs font-normal text-muted">You</span>}
        {/* Their score comes from settings.missed_week (0 or the week's last place). */}
        {r.missed > 0 && (
          <span className="ml-1.5 text-xs font-normal text-muted">{weekly ? "No picks" : `${r.missed} missed`}</span>
        )}
      </span>
      {extras?.map((e) => {
        const v = e.values.get(r.userId);
        return (
          <span key={e.label} className="w-16 text-right text-sm tabular-nums text-muted">
            {v === undefined ? "—" : recordText(v)}
            <span className="sr-only"> {e.label} record</span>
          </span>
        );
      })}
      {flat ? (
        <>
          {/* Points only differ from wins when pushes or custom scoring count. With columns
              on they sit in a fixed-width column so the records line up. */}
          {columns ? (
            <span className="w-14 text-right text-xs tabular-nums text-muted">
              {r.points !== r.wins && <>{points(r.points)} pts</>}
            </span>
          ) : (
            r.points !== r.wins && <span className="text-xs tabular-nums text-muted">{points(r.points)} pts</span>
          )}
          <span className="w-10 text-right text-xs tabular-nums text-muted" aria-label="Win percentage">{winPct(r.wins, r.losses)}</span>
          <span className={`min-w-14 text-right ${compact ? "text-[15px]" : "text-[17px]"} font-semibold tabular-nums`} aria-label="Record">{record}</span>
        </>
      ) : (
        <>
          <span className={`text-xs tabular-nums text-muted ${columns ? "w-16 text-right" : ""}`}>{record}</span>
          <span className={`w-12 text-right ${compact ? "text-[15px]" : "text-[17px]"} font-semibold tabular-nums`}>{points(r.points)}</span>
        </>
      )}
    </li>
  );
}
