import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { AxisLockScroll } from "@/components/AxisLockScroll";
import { GridPanel } from "@/components/GridPanel";
import { GridPanelDrawer } from "@/components/GridPanelDrawer";
import { chipClass, Empty, LiveDot, LockIcon, PageTitle, TeamLogo } from "@/components/ui";
import { formatSpread, points, shortGameTime, signedPoints } from "@/lib/format";
import { hasStarted, isGameLocked } from "@/lib/locks";
import { getPoolContext, getSlateGames, type PoolContext } from "@/lib/pool";
import { possiblePoints, slotValuesFor } from "@/lib/possible";
import { getStandings } from "@/lib/standings";
import { getTournamentPicks, getTournaments, placeLabel, tournamentUpside } from "@/lib/tournaments";
import { TrophyIcon } from "@/components/GolfGrid";

export const metadata: Metadata = { title: "League Grid" };

/** Row order: this week's score (default), season total, or name. */
/**
 * Every pick on the slate. PostgREST returns at most 1000 rows per request, and a pool with
 * about 40 players has 1000 picks in a week, so the grid pages through the rest; otherwise
 * the last players in the list come back with blank rows.
 */
async function slatePicks(ctx: PoolContext, slateId: string) {
  const rows: { user_id: string; game_id: string; picked_side: string; confidence: number | null; result: string | null; points: number | null; bonus: number | null; edited_by: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await ctx.supabase
      .from("picks")
      .select("user_id, game_id, picked_side, confidence, result, points, bonus, edited_by")
      .eq("slate_id", slateId)
      .order("user_id")
      .order("game_id")
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

const SORTS = [
  { id: "week", label: "Week" },
  { id: "season", label: "Season" },
  { id: "name", label: "A–Z" },
] as const;
type Sort = (typeof SORTS)[number]["id"];

export default async function GridPage({ params, searchParams }: PageProps<"/p/[slug]/grid/[week]">) {
  const { slug, week } = await params;
  const { sort: sortParam } = await searchParams;
  const sort: Sort = SORTS.find((s) => s.id === sortParam)?.id ?? "week";
  const sortQuery = sort === "week" ? "" : `?sort=${sort}`;
  const ctx = await getPoolContext(slug);
  const { data: slates } = await ctx.supabase
    .from("slates").select("id, week, label, status").eq("pool_id", ctx.pool.id).neq("status", "draft").order("week");
  const slate = slates?.find((s) => s.week === Number(week));
  if (!slate) return (<><PageTitle>League Grid</PageTitle><Empty>That week isn&apos;t published.</Empty></>);

  const [games, standings, season, picks, { data: submissions }, allTournaments] = await Promise.all([
    getSlateGames(ctx, slate.id),
    getStandings(ctx, slate.id),
    sort === "season" ? getStandings(ctx) : null,
    // RLS only returns other players' picks on games that have kicked off (or a graded week).
    slatePicks(ctx, slate.id),
    // Who has submitted this week (counts only; picks stay hidden until kickoff).
    ctx.supabase.rpc("slate_submissions", { p_slate_id: slate.id }),
    getTournaments(ctx),
  ]);
  // Champion picks for tournaments set in this week: their own columns at the start of the grid.
  const tournaments = allTournaments.filter((t) => t.week === slate.week);
  const tournamentPicks = await getTournamentPicks(ctx, tournaments.map((t) => t.id));
  const champPick = new Map(tournamentPicks.map((p) => [`${p.user_id}:${p.tournament_id}`, p]));
  // Until that database function exists, fall back to "missed" from the week's scores.
  const submitted = submissions ? new Map<string, number>((submissions as { user_id: string; picks: number }[]).map((x) => [x.user_id, x.picks])) : null;
  const noPicks = (r: { userId: string; missed: number }) => (submitted ? (submitted.get(r.userId) ?? 0) === 0 : r.missed > 0);
  const byCell = new Map((picks ?? []).map((p) => [`${p.user_id}:${p.game_id}`, p]));
  // eslint-disable-next-line react-hooks/purity -- render-time snapshot of which columns have locked
  const now = Date.now();
  // Everyone's champion picks (the viewer's own included) show once the tournament locks.
  const tLocked = (t: (typeof tournaments)[number]) => Date.parse(t.lockAt) <= now;
  const teamOf = (t: (typeof tournaments)[number], id: string) => t.teams.find((x) => x.id === id) ?? null;
  // The most-picked team per tournament, for the footer.
  const topPick = (t: (typeof tournaments)[number]) => {
    const n = new Map<string, number>();
    for (const p of tournamentPicks) if (p.tournament_id === t.id) n.set(p.team_id, (n.get(p.team_id) ?? 0) + 1);
    const best = [...n.entries()].sort((a, b) => b[1] - a[1])[0];
    return best ? { team: teamOf(t, best[0]), count: best[1] } : null;
  };

  const ats = ctx.settings.pick_type === "ats";
  // Column times in the viewer's own zone.
  const tz = ctx.displayTz;
  const isLocked = (g: (typeof games)[number]) => slate.status !== "open" || isGameLocked(g, now);
  // A column's picks (the viewer's own included) show once the game kicks off. In college
  // basketball they show from the week's lock instead, so the whole week opens at once. A
  // graded week shows everything, cancelled games included.
  const weekReveal = ctx.pool.sport === "ncaab";
  const isRevealed = (g: (typeof games)[number]) =>
    slate.status === "graded" || hasStarted(g, now) || (weekReveal && (slate.status === "locked" || isGameLocked(g, now)));

  // Week score sorts by this week's standings; the others reorder the same rows.
  const seasonById = new Map((season ?? []).map((r) => [r.userId, r]));
  const rows =
    sort === "season"
      ? [...standings].sort((a, b) => (seasonById.get(a.userId)?.rank ?? Infinity) - (seasonById.get(b.userId)?.rank ?? Infinity) || a.name.localeCompare(b.name))
      : sort === "name"
        ? [...standings].sort((a, b) => a.name.localeCompare(b.name))
        : standings;

  // Possible points: the most each player can still finish this week with (lib/possible.ts).
  const slotValues = slotValuesFor(ctx.settings);
  const openGameIds = games.filter((g) => !g.voided && !isLocked(g)).map((g) => g.id);
  const picksByUser = new Map<string, NonNullable<typeof picks>>();
  for (const p of picks ?? []) picksByUser.set(p.user_id, [...(picksByUser.get(p.user_id) ?? []), p]);
  // In-season tournaments count toward the week: one not yet decided can add up to a
  // champion's points (5). Before it locks everyone can still pick (and others' picks aren't
  // visible yet), so everyone has it; after, only entries with a pick in it.
  const upside = (userId: string) => tournamentUpside(tournaments, tournamentPicks, userId, now);
  const possible = (r: (typeof standings)[number]) =>
    possiblePoints({ points: r.points, picks: picksByUser.get(r.userId) ?? [], openGameIds, slotValues }) + upside(r.userId);

  // Picks per side, for the footer. Only meaningful once a game locks: before that RLS
  // returns just the viewer's own pick.
  const sides = new Map<string, { away: number; home: number }>();
  for (const p of picks ?? []) {
    const c = sides.get(p.game_id) ?? { away: 0, home: 0 };
    c[p.picked_side === "home" ? "home" : "away"]++;
    sides.set(p.game_id, c);
  }

  // Desktop widths, in rem: the player column (narrower on long weeks), then each column's
  // minimum. The grid fills the screen and only scrolls sideways below this.
  const playerRem = games.length > 30 ? 11 : games.length > 16 ? 14 : 18;
  // Desktop: the games share whatever width is left after the player and tournament columns
  // (and the side panel, when it shows), but never below a roomy 3.25rem each, so the logos
  // stay across the top and nothing gets cramped; past that the grid scrolls sideways.
  const GAME_MIN_REM = 3.25;
  const fixedRem = playerRem + tournaments.length * 3 + 2 + 1; // + page padding, scrollbar
  const gridMinRem = playerRem + tournaments.length * 3 + games.length * GAME_MIN_REM;
  // The side panel (18rem, plus its gap) shows only when the screen also has room for the grid
  // at that width, and is tall enough for the panel to fit without scrolling.
  const panelFromPx = Math.ceil((gridMinRem + 18 + 1.25 + 1.5 + 2 + 1) * 16);

  // The side panel's content: beside the Grid on wide screens, in the Pool Summary pop-out otherwise.
  const panelProps = {
    games,
    picks: picks ?? [],
    revealed: (id: string) => {
      const g = games.find((x) => x.id === id);
      return Boolean(g && isRevealed(g));
    },
    me: ctx.isGuest ? null : ctx.entryUserId,
    ats,
    confidence: Boolean(ctx.settings.confidence),
    names: ctx.pool.sport !== "ncaaf",
  };

  return (
    // Fills the viewport under the sticky header (and the phone tab row) so the grid's own
    // scrollbars sit on screen; the layout drops its tracker padding for this page.
    <div
      data-fill-viewport
      className="flex max-h-[max(24rem,calc(100dvh-7.75rem-4px-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] flex-col sm:max-h-[max(24rem,calc(100dvh-8rem-3px-env(safe-area-inset-top)-env(safe-area-inset-bottom)))]"
    >
      <h1 className="sr-only">Selections</h1>
      {/* One row: sort on the left, weeks on the right (they scroll when there are many). */}
      <div className="-mx-4 mb-1 flex shrink-0 items-center gap-2 px-4">
        <div className="flex shrink-0 items-center gap-1 border-r border-line py-1 pr-2">
          <span className="mr-0.5 text-[11px] font-medium text-muted">Sort</span>
          {SORTS.map((s) => (
            <Link
              key={s.id}
              href={`/p/${slug}/grid/${slate.week}${s.id === "week" ? "" : `?sort=${s.id}`}`}
              aria-current={s.id === sort ? "true" : undefined}
              aria-label={s.id === "week" ? "Sort by week score" : s.id === "season" ? "Sort by season score" : "Sort by name"}
              className={chipClass(s.id === sort, "", "xs")}
            >
              {s.label}
            </Link>
          ))}
        </div>
        {/* Where the side panel doesn't fit: a button that opens it from the right (desktop) or
            bottom (phones). Hidden by the media rule below wherever the panel shows. */}
        <GridPanelDrawer>
          <GridPanel {...panelProps} layout="drawer" />
        </GridPanelDrawer>
        <div className="flex min-w-0 flex-1 overflow-x-auto py-1">
          {/* ml-auto pushes the weeks right; it collapses to 0 once they overflow, so all stay reachable. */}
          <div className="ml-auto flex gap-1">
            {slates?.map((s) => (
              <Link
                key={s.id}
                href={`/p/${slug}/grid/${s.week}${sortQuery}`}
                aria-current={s.id === slate.id ? "page" : undefined}
                className={chipClass(s.id === slate.id, "", "xs")}
              >
                {s.label ?? `Week ${s.week}`}
              </Link>
            ))}
          </div>
        </div>
      </div>
      {/* Scrolls both ways: header row pinned top, player column left. Side counts sit after the last row. */}
      {/* On touch screens each swipe scrolls one way only (up/down or left/right). */}
      <div id="grid-wrap" className="flex min-h-0 flex-1 gap-6">
      <AxisLockScroll className="relative -mx-4 min-h-0 min-w-0 flex-1 overflow-auto isolate sm:mx-0">
        {/* Desktop: the grid fills the screen, the games sharing the width evenly (fixed layout),
            but never narrower than a readable column each; past that it scrolls as on phones. */}
        <table
          className="border-separate border-spacing-0 text-sm lg:w-full lg:min-w-[var(--grid-min)] lg:table-fixed"
          style={
            {
              "--grid-min": `${gridMinRem}rem`,
              "--colw": `max(${GAME_MIN_REM}rem, calc((100vw - ${fixedRem}rem - var(--panel, 0rem)) / ${Math.max(games.length, 1)}))`,
              "--cell-font": "clamp(11px, calc(var(--colw) * 0.24), 13px)",
              // Picks are logos only on desktop: 20–24px.
              "--logo": "clamp(20px, calc(var(--colw) - 24px), 24px)",
              // Header logos: always shown, 18–22px.
              "--head-logo": "clamp(18px, calc(var(--colw) * 0.34), 22px)",
            } as CSSProperties
          }
        >
          <thead>
            <tr>
              {/* Player and Pts share one pinned cell so the points never scroll away. */}
              <th className={`sticky left-0 top-0 z-30 border-b border-r border-line bg-bg px-4 py-1.5 text-left align-bottom text-xs font-medium text-muted ${playerRem === 11 ? "lg:w-[11rem]" : playerRem === 14 ? "lg:w-[14rem]" : "lg:w-[18rem]"}`}>
                <div className="flex items-end justify-between gap-3">
                  <span className="min-w-20">Player</span>
                  <span className="min-w-8 shrink-0 text-right whitespace-nowrap">
                    {sort === "season" ? "Season" : <>Pts<span className="text-faint">/Poss</span></>}
                  </span>
                </div>
              </th>
              {tournaments.map((t) => (
                <th
                  key={t.id}
                 
                  title={`${t.name}: champion pick`}
                  className="sticky top-0 z-20 w-12 min-w-12 max-w-12 border-b border-r border-line bg-bg px-1 py-1.5 text-center align-bottom text-[11px] font-medium leading-tight text-muted"
                >
                  {/* The name in full ("Tournament" dropped), a trophy under it. */}
                  {/* Sideways, reading bottom to top, on one line: never cut off or split. Centered in the column. */}
                  <div className="flex justify-center">
                    <span className="whitespace-nowrap font-semibold text-ink [transform:rotate(180deg)] [writing-mode:vertical-rl]">
                      {t.name.replace(/\s*\btournament\b\s*/gi, " ").trim()}
                    </span>
                  </div>
                  <TrophyIcon className="mx-auto mt-0.5 size-3.5 text-[#b8860b] dark:text-[#e0b84c]" />
                </th>
              ))}
              {games.map((g) => {
                const revealed = isRevealed(g);
                // Same live states as the Picks tab's status line.
                const started = hasStarted(g, now);
                const final = g.status === "final" || g.overridden;
                const live = started && !final && g.status !== "postponed" && g.status !== "cancelled";
                const showScore = started && g.homeScore !== null && g.awayScore !== null;
                const winner =
                  final && g.homeScore !== null && g.awayScore !== null
                    ? g.homeScore - g.awayScore + (ats ? (g.spread ?? 0) : 0)
                    : null;
                return (
                  <th
                    key={g.id}
                    className={`sticky top-0 z-20 min-w-12 border-b border-line bg-bg px-1 py-1.5 text-center align-bottom text-[11px] font-medium leading-tight text-muted lg:min-w-0 lg:overflow-hidden lg:px-0.5 lg:text-[length:var(--cell-font)] ${g.voided ? "line-through opacity-50" : ""}`}
                  >
                    <div className="mb-0.5 whitespace-nowrap text-[10px] font-normal tabular-nums">
                      {g.voided ? (
                        <span className="font-semibold text-loss">Void</span>
                      ) : final ? (
                        <span className="font-semibold">Final</span>
                      ) : live ? (
                        <LiveDot>Live</LiveDot>
                      ) : g.status === "postponed" || g.status === "cancelled" ? (
                        <span className="font-semibold">{g.status === "postponed" ? "Postponed" : "Cancelled"}</span>
                      ) : (
                        shortGameTime(g.startAt, tz, g.timeTbd)
                      )}
                      {/* Where to watch stays visible through the whole game, as on Picks. */}
                      {g.tv && <div className="mx-auto max-w-14 truncate">{g.tv}</div>}
                    </div>
                    <TeamLogo src={g.away.logo_url} abbr={g.away.abbreviation} className="mx-auto mb-px size-4 lg:size-[var(--head-logo)]" />
                    {/* Desktop stacks the score under the team so narrow columns keep both. */}
                    <div className={`whitespace-nowrap lg:flex lg:flex-col lg:items-center ${winner !== null && winner < 0 ? "font-semibold text-ink" : ""}`}>
                      {g.away.abbreviation}
                      {showScore && <span className="ml-1 font-semibold tabular-nums text-ink lg:ml-0">{g.awayScore}</span>}
                    </div>
                    <div className="text-[10px] leading-none text-faint">{g.neutral ? "vs" : "@"}</div>
                    <div className={`whitespace-nowrap lg:flex lg:flex-col-reverse lg:items-center ${winner !== null && winner > 0 ? "font-semibold text-ink" : ""}`}>
                      {g.home.abbreviation}
                      {showScore && <span className="ml-1 font-semibold tabular-nums text-ink lg:ml-0">{g.homeScore}</span>}
                    </div>
                    <TeamLogo src={g.home.logo_url} abbr={g.home.abbreviation} className="mx-auto mt-px size-4 lg:size-[var(--head-logo)]" />
                    {ats && <div className="mt-px tabular-nums">{formatSpread(g.spread)}</div>}
                    {/* Picks in this column are still hidden (until kickoff). */}
                    {!revealed && <LockIcon className="mx-auto mt-0.5 size-2.5 text-muted" />}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const mine = r.userId === ctx.entryUserId;
              return (
                <tr key={r.userId} className="[&:last-child>*]:border-b-0">
                  {/* "You" is the accent name plus a 2px edge, not a row fill. */}
                  <th
                    className={`sticky left-0 z-10 border-b border-r border-line bg-bg px-4 py-0.5 text-left text-[13px] font-medium lg:text-sm ${mine ? "shadow-[inset_2px_0_0_var(--accent)]" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className={`min-w-20 max-w-28 sm:max-w-36 lg:min-w-0 lg:max-w-none lg:flex-1 ${mine ? "text-accent" : ""}`}>
                        <span className="block truncate">{r.name}</span>
                        {/* Nothing in for this week yet (a missed week is scored per settings.missed_week). */}
                        {noPicks(r) && <span className="block truncate text-[10px] font-normal leading-tight text-muted">No picks submitted</span>}
                      </span>
                      <span className="min-w-8 shrink-0 whitespace-nowrap text-right font-semibold tabular-nums text-ink">
                        {sort === "season" ? (
                          <>
                            {points(seasonById.get(r.userId)?.points ?? 0)}
                            <span className="sr-only"> season points</span>
                          </>
                        ) : (
                          <>
                            {points(r.points)}
                            <span className="font-normal text-muted">/{points(possible(r))}</span>
                            <span className="sr-only"> points this week, {points(possible(r))} possible</span>
                          </>
                        )}
                      </span>
                    </div>
                  </th>
                  {tournaments.map((t) => {
                    const p = tLocked(t) ? champPick.get(`${r.userId}:${t.id}`) : undefined;
                    const team = p ? teamOf(t, p.team_id) : null;
                    const scored = p?.points != null;
                    const tone = scored ? (p!.points! > 0 ? "text-win" : "text-loss") : "text-ink";
                    const place = team ? placeLabel(t.scoring, team.placement) : null;
                    return (
                      <td
                        key={t.id}
                        title={team ? `${team.name}${place ? ` · ${place}` : ""}` : undefined}
                        className={`h-9 w-12 min-w-12 max-w-12 border-b border-r border-line px-1 text-center ${tone} ${
                          // A green fill once it scored, red once it didn't, as on the game picks.
                          scored ? (p!.points! > 0 ? "bg-[var(--win-fill)]" : "bg-[var(--loss-fill)]") : ""
                        }`}
                      >
                        {team && (
                          <div className="leading-tight">
                            {/* The champion pick's logo alone, like the game picks. */}
                            <TeamLogo src={team.logo_url} abbr={team.abbreviation} className="mx-auto size-6" />
                            <div className={`text-[11px] font-medium ${scored && p!.points === 0 ? "line-through" : ""}`}>
                              <span className="sr-only">{team.abbreviation ?? team.short_name ?? team.name}</span>
                            </div>
                            {scored && <div className="text-[13px] font-semibold tabular-nums">{points(p!.points!)}</div>}
                            {place && <span className="sr-only">, {place}</span>}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  {games.map((g) => {
                    // Nothing shows before kickoff, the viewer's own pick included.
                    const p = isRevealed(g) ? byCell.get(`${r.userId}:${g.id}`) : undefined;
                    const team = p ? (p.picked_side === "home" ? g.home : g.away) : null;
                    const tone = p?.result === "win" ? "text-win" : p?.result === "loss" ? "text-loss" : "text-ink";
                    // A light win/loss fill: with logos only, it's what shows the result.
                    const fill =
                      p?.result === "win"
                        ? "bg-[var(--win-fill)]"
                        : p?.result === "loss"
                          ? "bg-[var(--loss-fill)]"
                          : "";
                    const bonus = Number(p?.bonus ?? 0);
                    // Graded cells show what the pick scored before the bonus: a minus-points
                    // loss reads "−5"; a zero-points loss keeps its value, struck through.
                    const base = p?.result != null && p.points != null ? Number(p.points) - bonus : null;
                    return (
                      <td key={g.id} className={`h-9 min-w-12 border-b border-line px-1 text-center lg:h-11 lg:min-w-0 lg:overflow-hidden lg:px-0.5 ${tone} ${fill}`}>
                        {team && (
                          <div className="leading-tight">
                            {/* The team's logo alone; the cell's green or red fill gives the result. */}
                            <TeamLogo src={team.logo_url} abbr={team.abbreviation} className="mx-auto size-6 lg:size-[var(--logo)]" />
                            <div className="text-[11px] font-medium leading-none">
                              {/* The abbreviation stays for screen readers. */}
                              <span className="sr-only">{team.abbreviation}</span>
                              {/* Color isn't the only signal for the result. */}
                              {p?.result === "win" && <span className="sr-only">, won</span>}
                              {p?.result === "loss" && <span className="sr-only">, lost</span>}
                              {p?.edited_by && (
                                <span title="Changed by the commissioner" className="ml-0.5 inline-block size-1.5 rounded-full bg-muted align-super">
                                  <span className="sr-only">, changed by the commissioner</span>
                                </span>
                              )}
                            </div>
                            {p?.confidence != null && (
                              <div className="text-[13px] font-semibold tabular-nums">
                                {base !== null && base < 0 ? (
                                  signedPoints(base)
                                ) : (
                                  <span className={p.result === "loss" ? "line-through" : ""}>{p.confidence}</span>
                                )}
                                {bonus > 0 && <sup className="ml-px text-[10px] font-semibold text-accent">+{points(bonus)}</sup>}
                              </div>
                            )}
                            {/* Flat pools have no value line, so the bonus sits on its own. */}
                            {p?.confidence == null && bonus > 0 && (
                              <div className="text-[10px] font-semibold tabular-nums text-accent">+{points(bonus)}</div>
                            )}
                            {bonus > 0 && <span className="sr-only">, upset bonus {points(bonus)}</span>}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th className="sticky left-0 z-10 border-r border-t border-line bg-bg px-4 py-1.5 text-left text-xs font-medium text-muted">
                {standings.length} {standings.length === 1 ? "player" : "players"}
              </th>
              {tournaments.map((t) => {
                const top = tLocked(t) ? topPick(t) : null;
                return (
                  <td key={t.id} className="border-r border-t border-line bg-bg px-1 py-1.5 text-center text-xs leading-tight">
                    {!tLocked(t) ? (
                      <LockIcon className="mx-auto size-3 text-muted" />
                    ) : top?.team ? (
                      <div className="whitespace-nowrap" title="Most-picked champion">
                        <span className="text-muted">{top.team.abbreviation ?? top.team.short_name}</span> <span className="font-semibold tabular-nums">{top.count}</span>
                      </div>
                    ) : null}
                  </td>
                );
              })}
              {games.map((g) => {
                const c = sides.get(g.id) ?? { away: 0, home: 0 };
                return (
                  <td
                    key={g.id}
                   
                    className={`border-t border-line bg-bg px-1 py-1.5 text-center text-xs leading-tight lg:overflow-hidden lg:px-0.5 lg:text-[length:var(--cell-font)] ${g.voided ? "opacity-50" : ""}`}
                  >
                    {/* Counted from kickoff, when every player's pick is visible. */}
                    {isRevealed(g) ? (
                      <>
                        {/* Narrow desktop columns drop the team names (same order as the header). */}
                        <div className="whitespace-nowrap"><span className="text-muted lg:text-[length:clamp(0px,calc((var(--colw)_-_44px)_*_100),var(--cell-font))]">{g.away.abbreviation} </span><span className="font-semibold tabular-nums">{c.away}</span></div>
                        <div className="whitespace-nowrap"><span className="text-muted lg:text-[length:clamp(0px,calc((var(--colw)_-_44px)_*_100),var(--cell-font))]">{g.home.abbreviation} </span><span className="font-semibold tabular-nums">{c.home}</span></div>
                      </>
                    ) : (
                      <LockIcon className="mx-auto size-3 text-muted" />
                    )}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </AxisLockScroll>
      {/* The panel takes 18rem plus its gap and border from the grid's width (--panel). */}
      <style>{`@media (min-width: ${panelFromPx}px) and (min-height: 720px) { #grid-panel { display: flex; } #grid-panel-button { display: none; } #grid-wrap { --panel: 20.75rem; } }`}</style>
      <GridPanel {...panelProps} />
      </div>
    </div>
  );
}
