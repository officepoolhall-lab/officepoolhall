import { FitText } from "@/components/FitText";
import { TeamLogo } from "@/components/ui";
import { ROUNDS } from "@/lib/bracket";

// One entry's Pick X teams as a table, like Playoff Fantasy's lineup: seed, team, how much of the
// pool has it, the points from each round's win (a red L in the round it lost), and in all.
// Phones: the round columns don't fit, so the rounds go on a line under the team.

export type PickXTeamRow = {
  teamId: string;
  seed: number;
  name: string;
  abbr: string | null;
  logo: string | null;
  region: string;
  /** Share of the pool's entries with this team, 0-100; null before the lock. */
  own: number | null;
  /** Points from each round's win (null: no win that round). */
  points: (number | null)[];
  /** The round it lost in (1-6), or 0 while it's alive. */
  lostIn: number;
  total: number;
};

const FULL = "grid grid-cols-[2rem_minmax(0,1fr)_3rem_3.25rem] sm:grid-cols-[2.25rem_minmax(0,1fr)_3.25rem_repeat(6,3rem)_3.75rem] items-center gap-x-2";
const COMPACT = "grid grid-cols-[2rem_minmax(0,1fr)_3rem_3.25rem] sm:grid-cols-[1.75rem_minmax(0,1fr)_2.75rem_repeat(6,2.5rem)_3.25rem] items-center gap-x-1.5";

export function PickXTeamsTable({ rows, started, compact = false, totalRow = true }: { rows: PickXTeamRow[]; /** Rounds with results in (0-6). */ started: number; compact?: boolean; totalRow?: boolean }) {
  const grid = compact ? COMPACT : FULL;
  const cell = (t: PickXTeamRow, i: number) =>
    t.points[i] !== null ? { text: String(t.points[i]), cls: "" } : t.lostIn === i + 1 ? { text: "L", cls: "font-bold text-loss" } : { text: "–", cls: "text-muted" };
  const sums = ROUNDS.map((_, i) => rows.reduce((s, t) => s + (t.points[i] ?? 0), 0));
  return (
    <div className={compact ? "text-sm sm:text-[13px]" : "text-sm"}>
      <div className={`${grid} border-b border-line py-1.5 ${compact ? "text-[10px]" : "text-[11px]"} font-bold tracking-wide text-muted uppercase`}>
        <span className="text-center">Seed</span>
        <span>Team</span>
        <span className="text-right">Own</span>
        {ROUNDS.map((r) => (
          <span key={r.round} className="hidden text-right sm:block">{r.short}</span>
        ))}
        <span className="text-right">Total</span>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((t) => (
          <li key={t.teamId} className={`${grid} ${compact ? "py-1.5" : "py-2"} ${t.lostIn ? "text-muted" : ""}`}>
            <span className="text-center text-xs font-bold tabular-nums text-muted">{t.seed}</span>
            <span className="flex min-w-0 flex-col">
              <span className="flex min-w-0 items-center gap-2">
                <TeamLogo src={t.logo} abbr={t.abbr} className={`${compact ? "size-4" : "size-5"} shrink-0`} />
                <FitText min={10} className={`min-w-0 flex-1 font-semibold ${t.lostIn ? "line-through decoration-1" : "text-ink"}`}>{t.name}</FitText>
              </span>
              {started > 0 && (
                <FitText min={8} className={`${compact ? "pl-6" : "pl-7"} text-[11px] tabular-nums text-muted sm:hidden`}>
                  {ROUNDS.slice(0, t.lostIn ? Math.min(t.lostIn, started) : started).map((r, i) => `${r.short} ${cell(t, i).text}`).join(" · ")}
                </FitText>
              )}
            </span>
            <span className="text-right text-xs tabular-nums text-muted">{t.own === null ? "–" : `${t.own}%`}</span>
            {ROUNDS.map((_, i) => {
              const c = i < started ? cell(t, i) : { text: "–", cls: "text-muted" };
              return (
                <span key={i} className={`hidden text-right tabular-nums sm:block ${c.cls}`}>{c.text}</span>
              );
            })}
            <span className={`text-right font-bold tabular-nums ${t.lostIn ? "" : "text-ink"}`}>{t.total}</span>
          </li>
        ))}
      </ul>
      {totalRow && started > 0 && (
        <div className={`${grid} hidden border-t-2 border-line py-2 font-bold sm:grid`}>
          <span />
          <span>Total</span>
          <span />
          {sums.map((v, i) => (
            <span key={i} className={`text-right tabular-nums ${i >= started ? "text-muted" : ""}`}>{i >= started ? "–" : v}</span>
          ))}
          <span className="text-right tabular-nums">{sums.reduce((a, b) => a + b, 0)}</span>
        </div>
      )}
    </div>
  );
}
