import { Fragment, type CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ChevronIcon, Empty, LiveDot, TeamLogo } from "@/components/ui";
import { SubTabs } from "@/components/SubTabs";
import { ViewTabs } from "@/components/ViewTabs";
import { getGameSummary, type GameSummary, type Play } from "@/lib/gameSummary";
import { getPoolContext } from "@/lib/pool";
import { teamSport } from "@/lib/sports";
import { PlayerName } from "@/components/ProfileDialogs";
import { BoxStatsToggle } from "@/components/BoxStatsToggle";


/**
 * Where a game was opened from (My Picks or the Scoreboard, on the same week): the Scoreboard
 * sends its exact address (week, day and filter) as ?back=, followed only inside this pool.
 */
export function gameBackHref(slug: string, q: Record<string, string | string[] | undefined>): string {
  const { week, from, back } = q;
  const safeBack = typeof back === "string" && back.startsWith(`/p/${slug}/`) && !back.includes("//") ? back : null;
  return (
    safeBack ??
    `/p/${slug}/${from === "scoreboard" ? "scoreboard" : "picks"}${typeof week === "string" && /^\d+$/.test(week) ? `?week=${week}` : ""}`
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One live or final game: the score by period, play-by-play (football by drive) and the box
 * score, from ESPN. Opened from My Picks; "My Picks" at the top goes back (to the same week).
 * While the game is on, it refreshes every 15 seconds.
 */
export async function GameView({
  slug,
  gameId,
  searchParams,
  modal = false,
}: {
  slug: string;
  gameId: string;
  searchParams: Record<string, string | string[] | undefined>;
  /** In the pop-up over My Picks or the Scoreboard: no back link (closing goes back). */
  modal?: boolean;
}) {
  const { week, from, back: backParam } = searchParams;
  // A pool game (its id here) or, from the Scoreboard, any ESPN game (ESPN's numeric id).
  if (!UUID.test(gameId) && !/^\d{5,12}$/.test(gameId)) notFound();
  const ctx = await getPoolContext(slug);
  const game = UUID.test(gameId)
    ? (await ctx.supabase.from("games").select("id, espn_id, sport, status").eq("id", gameId).maybeSingle()).data
    : { id: gameId, espn_id: gameId, sport: ctx.pool.sport, status: "in_progress" };
  if (!game) notFound();

  const fromScoreboard = from === "scoreboard";
  const backHref = gameBackHref(slug, { week, from, back: backParam });
  const back = modal ? null : (
    <Link href={backHref} className="-ml-1 mb-3 inline-flex h-9 items-center gap-0.5 px-1 text-sm font-medium text-accent">
      <ChevronIcon className="size-4 rotate-180" /> {fromScoreboard ? "Scoreboard" : "My Picks"}
    </Link>
  );

  const sport = teamSport(game.sport);
  const summary = game.espn_id && !game.espn_id.startsWith("demo-") ? await getGameSummary(sport, game.espn_id, game.status !== "final") : null;
  if (!summary || !summary.away || !summary.home) {
    return (
      <>
        {back}
        <Empty>ESPN doesn&apos;t have play-by-play or a box score for this game yet.</Empty>
      </>
    );
  }
  const live = summary.status.state === "in";
  const { away, home } = summary;
  const periods = Math.max(away.linescores.length, home.linescores.length);

  return (
    <div data-wide className="lg:max-w-6xl">
      {back}
      <AutoRefresh active={live} seconds={15} />

      {/* Score: teams, total, then the line score by period. */}
      <section className="mb-5 rounded-xl border border-line bg-surface/50 p-4">
        <div className="mb-2 text-xs font-semibold text-muted">
          {live ? <LiveDot>{summary.status.detail ?? "Live"}</LiveDot> : <span>{summary.status.detail ?? ""}</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-xs text-muted">
                <th className="py-1 text-left font-medium" />
                {Array.from({ length: periods }, (_, i) => (
                  <th key={i} className="w-10 py-1 text-center font-medium">{summary.periodLabel(i + 1).replace(" Half", "")}</th>
                ))}
                <th className="w-12 py-1 text-right font-medium">T</th>
              </tr>
            </thead>
            <tbody>
              {[away, home].map((t) => (
                <tr key={t.homeAway}>
                  <td className="py-1.5">
                    <span className="flex items-center gap-2">
                      <TeamLogo src={t.logo} abbr={t.abbreviation} className="size-6" />
                      <span className="font-semibold">{t.name}</span>
                    </span>
                  </td>
                  {Array.from({ length: periods }, (_, i) => (
                    <td key={i} className="text-center text-muted">{t.linescores[i] ?? ""}</td>
                  ))}
                  <td className="text-right text-lg font-bold">{t.score ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ViewTabs
        param="view"
        ariaLabel="Show"
        views={[
          // Desktop: the play-by-play ends where the box score beside it ends and scrolls inside.
          { id: "plays", label: "Play-by-Play", content: <PlayByPlay summary={summary} />, scroll: true },
          { id: "box", label: "Box Score", content: <BoxScore summary={summary} sport={sport} /> },
        ]}
      />
    </div>
  );
}

function PlayRow({ p, summary, showTeam = false }: { p: Play; summary: GameSummary; showTeam?: boolean }) {
  // Basketball: the team's logo before each play (a blank slot for plays with no team, such as
  // the end of a half, so the descriptions stay lined up). Football shows it on the drive instead.
  const team = p.teamId === summary.away?.id ? summary.away : p.teamId === summary.home?.id ? summary.home : null;
  return (
    <li className={`flex gap-3 py-1.5 text-sm ${p.scoring ? "font-semibold" : ""}`}>
      <span className="w-14 shrink-0 text-xs tabular-nums text-muted">
        {p.period ? summary.periodLabel(p.period).replace(" Half", "") : ""} {p.clock ?? ""}
      </span>
      {showTeam && (
        <span className="-mx-1 flex size-5 shrink-0 items-center justify-center" aria-label={team?.name ?? undefined}>
          {team && <TeamLogo src={team.logo} abbr={team.abbreviation} className="size-5" />}
        </span>
      )}
      <span className="min-w-0 flex-1">
        {p.down && <span className="mr-1.5 text-xs font-semibold text-muted">{p.down}</span>}
        {p.text}
      </span>
      {p.scoring && p.awayScore !== null && p.homeScore !== null && (
        <span className="shrink-0 text-xs tabular-nums text-ink">
          {p.awayScore}–{p.homeScore}
        </span>
      )}
    </li>
  );
}

/** Football: drives, the one under way open; basketball: every play, newest first. */
function PlayByPlay({ summary }: { summary: GameSummary }) {
  const abbr = (id: string | null) => (id === summary.away?.id ? summary.away?.abbreviation : id === summary.home?.id ? summary.home?.abbreviation : "");
  const logo = (id: string | null) => (id === summary.away?.id ? summary.away : id === summary.home?.id ? summary.home : null);
  if (summary.drives.length) {
    return (
      <div className="divide-y divide-line border-y border-line">
        {summary.drives.map((d, i) => {
          const team = logo(d.teamId);
          return (
            <details key={d.id} open={i === 0} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 py-2 [&::-webkit-details-marker]:hidden">
                <ChevronIcon className="size-4 shrink-0 text-muted transition group-open:rotate-90" />
                {team && <TeamLogo src={team.logo} abbr={team.abbreviation} className="size-5" />}
                <span className="font-semibold">{d.result ?? abbr(d.teamId)}</span>
                {/* Plays, yards and time: in the row on wider screens; on phones only once the drive is opened. */}
                {d.description && <span className="hidden min-w-0 truncate text-xs text-muted sm:inline">{d.description}</span>}
                {/* The score after this drive. */}
                {d.awayScore !== null && d.homeScore !== null && (
                  <span className="ml-auto shrink-0 pl-2 text-xs tabular-nums text-muted">
                    {summary.away?.abbreviation} <span className="font-semibold text-ink">{d.awayScore}</span>
                    {" · "}
                    {summary.home?.abbreviation} <span className="font-semibold text-ink">{d.homeScore}</span>
                  </span>
                )}
              </summary>
              {d.description && <p className="pb-1 pl-6 text-xs text-muted sm:hidden">{d.description}</p>}
              <ul className="divide-y divide-line pb-2 pl-6">
                {d.plays.map((p) => (
                  <PlayRow key={p.id} p={p} summary={summary} />
                ))}
              </ul>
            </details>
          );
        })}
      </div>
    );
  }
  if (summary.plays.length) {
    return (
      <ul className="divide-y divide-line border-y border-line">
        {summary.plays.map((p) => (
          <PlayRow key={p.id} p={p} summary={summary} showTeam />
        ))}
      </ul>
    );
  }
  return <p className="border-y border-line py-3 text-sm text-muted">No plays yet.</p>;
}

/** A team's tab label on phones: its name if it fits a third of the row, else its abbreviation. */
function phoneName(team: GameSummary["home"]) {
  if (!team) return undefined;
  return team.name.length > 14 && team.abbreviation ? team.abbreviation : team.name;
}

/** Basketball's basic counting stats: the columns a box score shows until Full stats is on. */
const BASIC = new Set(["MIN", "PTS", "REB", "AST", "STL", "BLK", "TO"]);
/** The other basketball columns: hidden until Expand is tapped (BoxStatsToggle). */
const extra = (sport: string, label: string | undefined) =>
  sport === "ncaab" && label && !BASIC.has(label) ? "hidden group-data-[full=true]/box:table-cell" : "";

/** Box score, one part at a time: Team Stats, then each team's player stats (home, away). */
function BoxScore({ summary, sport }: { summary: GameSummary; sport: "ncaaf" | "ncaab" | "nfl" }) {
  const { away, home } = summary;
  if (!summary.teamStats.length && !summary.players.length) {
    return <p className="border-y border-line py-3 text-sm text-muted">No box score yet.</p>;
  }
  const teamStats = summary.teamStats.length > 0 && (
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="py-1.5 text-left font-medium">Team stats</th>
              <th className="w-20 py-1.5 text-right font-medium">{away?.abbreviation}</th>
              <th className="w-20 py-1.5 text-right font-medium">{home?.abbreviation}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {summary.teamStats.map((s) => (
              <tr key={s.label}>
                <td className="py-1.5 text-muted">{s.label}</td>
                <td className="py-1.5 text-right font-semibold">{s.away}</td>
                <td className="py-1.5 text-right font-semibold">{s.home}</td>
              </tr>
            ))}
          </tbody>
        </table>
  );
  const playersFor = (team: typeof home) => {
    const t = summary.players.find((p) => p.teamId === team?.id) ?? summary.players.find((p) => p.abbreviation === team?.abbreviation);
    if (!t) return <p className="border-y border-line py-3 text-sm text-muted">No player stats yet.</p>;
    return (
        // Basketball: the basic counting stats until "Full stats" is on (wide screens show all).
        <BoxStatsToggle enabled={sport === "ncaab"}>
        <div className="space-y-4">
          {t.groups.map((g) => (
            // Full names and stat titles, never cut off. Basketball shows the basic stats until
            // Expand; if a table is ever wider than its space it scrolls sideways, with the name
            // column pinned at the left edge (nothing shows to the left of or behind it).
            <div key={g.name} className="-mx-4 overflow-x-auto">
              <table className="w-full min-w-max text-xs tabular-nums sm:text-[13px] [&_tr>*:last-child]:pr-4">
                <thead>
                  <tr className="border-b border-line text-muted">
                    <th className="sticky left-0 z-10 whitespace-nowrap bg-bg py-1.5 pl-4 pr-3 text-left font-semibold capitalize text-ink">{g.name}</th>
                    {g.labels.map((l) => (
                      <th
                        key={l}
                        className={`whitespace-nowrap px-1.5 py-1.5 text-right text-[11px] font-medium ${extra(sport, l)}`}
                      >
                        {l}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {/* Basketball: the starting five first, then the bench, each under a label. */}
                  {(sport === "ncaab" && g.rows.some((r) => r.starter)
                    ? [...g.rows.filter((r) => r.starter), ...g.rows.filter((r) => !r.starter)]
                    : g.rows
                  ).map((r, i, rows) => (
                    <Fragment key={r.id ?? r.name}>
                    {sport === "ncaab" && rows.some((x) => x.starter) && (i === 0 || (!r.starter && rows[i - 1].starter)) && (
                      <tr>
                        <td colSpan={g.labels.length + 1} className="bg-surface py-1 pl-4 text-[11px] font-semibold uppercase tracking-wide text-muted">
                          {/* Stays in view while the row scrolls sideways on phones. */}
                          <span className="sticky left-4">{r.starter ? "Starters" : "Bench"}</span>
                        </td>
                      </tr>
                    )}
                    <tr>
                      {/* Tap a name for the player's game log and season totals. */}
                      <td className="sticky left-0 z-10 bg-bg py-1 pl-4 pr-3 text-sm">
                        <PlayerName sport={sport} id={r.id} name={r.name} className="block whitespace-nowrap" />
                      </td>
                      {r.stats.map((v, i) => (
                        <td key={i} className={`whitespace-nowrap px-1.5 py-1 text-right ${extra(sport, g.labels[i])}`}>{v}</td>
                      ))}
                    </tr>
                    </Fragment>
                  ))}
                  {g.totals && (
                    <tr className="font-semibold">
                      <td className="sticky left-0 z-10 bg-bg py-1 pl-4 pr-3">Team</td>
                      {g.totals.map((v, i) => (
                        <td key={i} className={`whitespace-nowrap px-1.5 py-1 text-right ${extra(sport, g.labels[i])}`}>{v}</td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        </BoxStatsToggle>
    );
  };
  return (
    <SubTabs
      ariaLabel="Box score"
      tabs={[
        ...(teamStats ? [{ id: "team", label: "Team Stats", content: teamStats }] : []),
        { id: "home", label: home?.name ?? "Home", short: phoneName(home), content: playersFor(home) },
        { id: "away", label: away?.name ?? "Away", short: phoneName(away), content: playersFor(away) },
      ]}
    />
  );
}
