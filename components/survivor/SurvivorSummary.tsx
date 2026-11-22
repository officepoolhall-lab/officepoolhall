import { TeamLogo } from "@/components/ui";
import type { SvGame, SvRow, SvTeam, SvWeek } from "@/lib/survivor";

// The Survivor Standings' Pool Summary (the pop-out tab, as on the League Grid): who's left,
// what the pool picked this week and how it's going, and the season so far. Built from the
// picks Standings already shows, so another entry's pick only counts once its game kicks off.

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 1000) / 10}%` : "—");
const name = (t: SvTeam) => t.short_name ?? t.name;
/** "$1,250" (cents only when there are any: "$83.33"). */
const money = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: Number.isInteger(Math.round(v * 100) / 100) ? 0 : 2, maximumFractionDigits: 2 });

export function SurvivorSummary({
  rows,
  weeks,
  lives,
  reuse,
  entryFee,
}: {
  rows: SvRow[];
  weeks: SvWeek[];
  lives: number;
  /** The pool lets a team be picked more than once: "teams left" doesn't apply. */
  reuse: boolean;
  /** The pool's entry fee (pools.entry_fee); 0 hides the pot. */
  entryFee: number;
}) {
  const total = rows.length;
  const alive = rows.filter((r) => r.alive).length;
  // The week to sum up: the latest one with a game under way or over.
  const shown = [...weeks].sort((a, b) => b.week - a.week).find((w) => w.games.some((g) => g.started)) ?? null;
  const games = new Map(weeks.flatMap((w) => w.games).map((g) => [g.id, g]));

  // This week: everyone still in when it started, and the picks that show.
  type TeamRow = { team: SvTeam; game: SvGame | undefined; n: number; state: string };
  const teams = new Map<string, TeamRow>();
  let inThisWeek = 0;
  let noPick = 0;
  if (shown) {
    for (const r of rows) {
      const c = r.cells.find((x) => x.slateId === shown.slateId);
      if (!c || c.state === "out" || c.state === "before") continue;
      inThisWeek++;
      if (c.state === "missed") noPick++;
      if (!c.team) continue;
      const t = teams.get(c.team.id) ?? { team: c.team, game: c.gameId ? games.get(c.gameId) : undefined, n: 0, state: c.state };
      t.n++;
      teams.set(c.team.id, t);
    }
  }
  const picked = [...teams.values()].reduce((s, t) => s + t.n, 0);
  const hidden = Math.max(0, inThisWeek - picked - noPick);
  const list = [...teams.values()].sort((a, b) => b.n - a.n || name(a.team).localeCompare(name(b.team)));
  // Entries whose last life rides on a pick that's lost or still being played.
  const atRisk = (t: TeamRow) =>
    rows.filter((r) => {
      const c = shown ? r.cells.find((x) => x.slateId === shown.slateId) : undefined;
      return c?.team?.id === t.team.id && r.losses + (c.state === "loss" ? 0 : 1) >= lives;
    }).length;

  // The season: how many went out each week, and the most-picked teams.
  const outBy = new Map<number, number>();
  for (const r of rows) if (r.outWeek !== null) outBy.set(r.outWeek, (outBy.get(r.outWeek) ?? 0) + 1);
  const outWeeks = [...outBy.entries()].sort((a, b) => a[0] - b[0]);
  const maxOut = Math.max(1, ...outWeeks.map(([, n]) => n));

  // Teams left for the survivors: for every team, how many entries still alive haven't used it.
  const allTeams = new Map<string, SvTeam>();
  for (const w of weeks) for (const g of w.games) for (const t of [g.home, g.away]) allTeams.set(t.id, t);
  const survivors = rows.filter((r) => r.alive);
  const left = [...allTeams.values()]
    .map((t) => ({ team: t, n: survivors.filter((r) => !r.used.has(t.id)).length }))
    .sort((a, b) => b.n - a.n || (a.team.abbreviation ?? "").localeCompare(b.team.abbreviation ?? ""));

  // The split only moves once a week is final: entries still in coming into the current week
  // (the first week with a game not yet final; after the last week, everyone still alive).
  const current = [...weeks].sort((a, b) => a.week - b.week).find((w) => w.games.some((g) => !g.final && !g.voided)) ?? null;
  const splitWays = current ? rows.filter((r) => r.outWeek === null || r.outWeek >= current.week).length : alive;

  const scoreOf = (t: TeamRow) => {
    const g = t.game;
    if (!g || !g.started || g.homeScore === null || g.awayScore === null) return null;
    const home = g.home.id === t.team.id;
    return `${home ? g.homeScore : g.awayScore}–${home ? g.awayScore : g.homeScore}`;
  };

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Entries remaining</h3>
        <p className="mt-1 tabular-nums">
          <span className="text-3xl font-extrabold text-win">{alive}</span> <span className="text-muted">of {total}</span>
          <span className="ml-2 text-sm font-semibold text-ink">{pct(alive, total)}</span>
        </p>
        <p className="text-sm text-muted tabular-nums">{total - alive} eliminated</p>
        {/* The pot, and what each entry would take splitting it, counting everyone still in coming
            into the current week (it changes once a week is final, not game by game). */}
        {entryFee > 0 && splitWays > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-surface px-2 py-2">
              <div className="text-[11px] font-medium text-muted">Pot</div>
              <div className="text-lg font-bold tabular-nums">{money(entryFee * total)}</div>
              <div className="text-[11px] text-muted tabular-nums">{total} × {money(entryFee)}</div>
            </div>
            <div className="rounded-xl bg-surface px-2 py-2">
              <div className="text-[11px] font-medium text-muted">{current ? `Split into ${current.label}` : "Split"}</div>
              <div className="text-lg font-bold tabular-nums text-win">{money((entryFee * total) / splitWays)}</div>
              <div className="text-[11px] text-muted tabular-nums">each, {splitWays} way{splitWays === 1 ? "" : "s"}</div>
            </div>
          </div>
        )}
      </section>

      {shown && (
        <section>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{shown.label} picks</h3>
            <span className="text-xs text-muted tabular-nums">{inThisWeek} entries in</span>
          </div>
          <ul className="mt-1 divide-y divide-line border-y border-line">
            {list.map((t) => {
              const score = scoreOf(t);
              const live = Boolean(t.game?.started && !t.game.final);
              const risk = t.state === "win" ? 0 : atRisk(t);
              return (
                <li key={t.team.id} className="flex min-h-10 items-center gap-2 py-1.5 text-sm">
                  <TeamLogo src={t.team.logo_url} abbr={t.team.abbreviation} className="size-6 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{name(t.team)}</span>
                    <span
                      className={`block text-[11px] tabular-nums ${t.state === "win" ? "text-win" : t.state === "loss" ? "text-loss" : live ? "text-live" : "text-muted"}`}
                    >
                      {t.state === "win" ? "Won" : t.state === "loss" ? "Lost" : live ? "Live" : "Not started"}
                      {score && ` ${score}`}
                      {t.state !== "win" && t.state !== "loss" && risk > 0 && <span className="text-muted"> · {risk} out if they lose</span>}
                      {t.state === "loss" && <span className="text-muted"> · {t.n} out</span>}
                    </span>
                  </span>
                  <span className="text-right tabular-nums">
                    <span className="block font-bold">{t.n}</span>
                    <span className="block text-[11px] text-muted">{pct(t.n, inThisWeek)}</span>
                  </span>
                </li>
              );
            })}
            {noPick > 0 && (
              <li className="flex min-h-10 items-center justify-between py-1.5 text-sm">
                <span className="text-loss">No pick (a loss)</span>
                <span className="text-right tabular-nums">
                  <span className="block font-bold">{noPick}</span>
                  <span className="block text-[11px] text-muted">{pct(noPick, inThisWeek)}</span>
                </span>
              </li>
            )}
            {hidden > 0 && (
              <li className="flex min-h-10 items-center justify-between py-1.5 text-sm text-muted">
                <span>Not shown until kickoff</span>
                <span className="text-right tabular-nums">
                  <span className="block font-bold">{hidden}</span>
                  <span className="block text-[11px]">{pct(hidden, inThisWeek)}</span>
                </span>
              </li>
            )}
          </ul>
        </section>
      )}

      {outWeeks.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Eliminated each week</h3>
          <ul className="mt-2 space-y-1">
            {outWeeks.map(([w, n]) => (
              <li key={w} className="flex items-center gap-2 text-xs tabular-nums">
                <span className="w-14 shrink-0 text-muted">Week {w}</span>
                <span className="h-3 rounded-sm bg-[var(--loss-fill)] ring-1 ring-loss/40" style={{ width: `${Math.max(4, (n / maxOut) * 100)}%` }} />
                <span className="shrink-0 font-semibold">{n}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!reuse && survivors.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Teams left for the survivors</h3>
          <p className="mt-0.5 text-xs text-muted">How many of the {survivors.length} entries still alive haven&apos;t used each team yet.</p>
          <ul className="mt-2 grid grid-cols-4 gap-1.5">
            {left.map((t) => (
              <li
                key={t.team.id}
                title={`${name(t.team)}: ${t.n} of ${survivors.length} can still pick them`}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-1.5 py-1 text-sm tabular-nums ring-1 ring-line ${t.n === 0 ? "opacity-40" : "bg-surface"}`}
              >
                <TeamLogo src={t.team.logo_url} abbr={t.team.abbreviation} className="size-6 shrink-0" />
                <span className="sr-only">{name(t.team)}:</span>
                <span className="font-bold">{t.n}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

    </div>
  );
}
