import { FitText } from "@/components/FitText";
import { TeamLogo } from "@/components/ui";
import { ROUNDS, lineupSlots, type Position } from "@/lib/playoffFantasy";
import type { PfPlayer, PfPoints, PfTeam, PfWeeklyRow } from "@/lib/playoffFantasyData";
import { PfPlayerButton, type PfRosterRow } from "./PfRoster";

// Weekly style: an entry's lineup round by round, each player with his
// multiplier and points (already multiplied), the round's total in its heading. Rounds side by
// side on wide screens, one under another on phones.

const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export function PfWeeklyRounds({
  row,
  players,
  teams,
  pts,
  rounds,
  hidden = false,
  compact = false,
  roster,
  flex = 0,
  logs,
}: {
  row: PfWeeklyRow;
  players: PfPlayer[];
  teams: PfTeam[];
  pts: PfPoints;
  /** Which rounds to show (0 = Wild Card). */
  rounds: number[];
  /** Others' lineups: players show only as each locks; say so under a round with spots still hidden. */
  hidden?: boolean;
  compact?: boolean;
  /** The pool's lineup spots, to label the flex spots FLEX. */
  roster: Record<Position, number>;
  flex?: number;
  /** Each player's playoff games (with his multipliers in this lineup): tap a name to open them. */
  logs?: Map<string, PfRosterRow>;
}) {
  const playerOf = new Map(players.map((p) => [p.id, p]));
  const teamOf = new Map(teams.map((t) => [t.id, t]));
  return (
    <div className={`grid gap-x-5 gap-y-4 ${compact ? "sm:grid-cols-2" : "md:grid-cols-2"}`}>
      {rounds.map((r) => {
        // Spot by spot (a flex player labelled FLEX), the best scorer first within a spot.
        const slots = lineupSlots((row.lineups[r] ?? []).filter((id) => playerOf.has(id)).map((id) => playerOf.get(id)!), roster, flex);
        const ids = slots.map((x) => x.p.id);
        const slotOf = new Map(slots.map((x) => [x.p.id, x.slot]));
        const rank = (s: string) => slots.findIndex((x) => x.slot === s);
        ids.sort((a, b) => rank(slotOf.get(a)!) - rank(slotOf.get(b)!) || (row.pts[r].get(b) ?? 0) - (row.pts[r].get(a) ?? 0));
        return (
          <section key={r} className="min-w-0">
            <div className="flex items-baseline justify-between gap-2 border-b border-line pb-0.5">
              <span className="text-xs font-bold tracking-wide text-muted uppercase">{ROUNDS[r].name}</span>
              <span className="text-sm font-extrabold tabular-nums">{fmt(row.rounds[r] ?? 0)}</span>
            </div>
            {ids.length === 0 ? (
              <p className="py-1.5 text-xs text-muted">{hidden ? "Shows as players lock." : "No lineup."}</p>
            ) : (
              <ul className="divide-y divide-line">
                {ids.map((id) => {
                  const p = playerOf.get(id)!;
                  const t = teamOf.get(p.teamId);
                  const m = row.mult[r].get(id) ?? 1;
                  const raw = pts.byPlayer.get(id)?.rounds[r] ?? 0;
                  const out = pts.out.has(t?.espnId ?? "") && !pts.games.get(t?.espnId ?? "")?.[r];
                  return (
                    <li key={id} className={`flex h-8 items-center gap-1.5 text-[13px] ${out ? "text-muted" : ""}`}>
                      <span className="w-8 shrink-0 text-[10px] font-bold text-muted">{slotOf.get(id)}</span>
                      {logs?.get(id) ? (
                        <PfPlayerButton row={logs.get(id)!} started={pts.roundsStarted} className="-my-0.5 flex min-w-0 flex-1 items-center gap-1.5 self-stretch rounded-md px-1">
                          <TeamLogo src={t?.logo_url} abbr={t?.abbreviation} className="size-4 shrink-0" />
                          <FitText min={8} className="min-w-0 flex-1 font-medium">{p.name}</FitText>
                        </PfPlayerButton>
                      ) : (
                        <>
                          <TeamLogo src={t?.logo_url} abbr={t?.abbreviation} className="size-4 shrink-0" />
                          <FitText min={8} className="min-w-0 flex-1 font-medium">{p.name}</FitText>
                        </>
                      )}
                      {m > 1 && (
                        <span title={`${fmt(raw)} × ${m}`} className="shrink-0 rounded bg-[var(--win-fill)] px-1 text-[10px] font-extrabold leading-4 tabular-nums text-win">
                          {m}x
                        </span>
                      )}
                      <span className="w-12 shrink-0 text-right font-semibold tabular-nums">{fmt(row.pts[r].get(id) ?? 0)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
