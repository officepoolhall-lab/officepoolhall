import type { CSSProperties } from "react";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { AutoRefresh } from "@/components/AutoRefresh";
import { AxisLockScroll } from "@/components/AxisLockScroll";
import { FitText } from "@/components/FitText";
import { LinkSelect } from "@/components/LinkSelect";
import { Empty, LinkButton, LiveDot, PageTitle, TeamLogo, chipClass } from "@/components/ui";
import { saveSurvivorPick } from "@/app/p/[slug]/formats/actions";
import type { PoolBase } from "@/lib/pool";
import { survivorRules, survivorStandings, weekClosed, type SvCell, type SvGame, type SvRow, type SvTeam, type SvWeek } from "@/lib/survivor";
import { anyLive, getSurvivor, getWeekExtras, withLiveScores } from "@/lib/survivorData";
import { SurvivorBoard, type SvPrior } from "./SurvivorBoard";
import { LiveTicker } from "@/components/LiveTicker";
import { getSlateGames, type PoolContext, type SlateGame } from "@/lib/pool";
import { withLiveClocks } from "@/lib/liveClock";

// The pages of an NFL Survivor pool: Home, My Pick and Standings. The pool routes reach these
// when settings.format is "survivor".

const card = "rounded-2xl bg-surface p-4 sm:p-5";
const tzOf = (ctx: PoolBase) => ((ctx.pool.settings as { timezone?: string } | null)?.timezone ?? "America/Chicago");
const teamName = (t: SvTeam) => t.short_name ?? t.name;

/** The week players should be looking at: the first one that's still open, else the latest. */
const currentWeek = (weeks: SvWeek[], startWeek: number) => {
  const counted = weeks.filter((w) => w.week >= startWeek);
  return counted.find((w) => !weekClosed(w)) ?? counted[counted.length - 1] ?? null;
};

const lives = (r: SvRow, total: number) =>
  r.alive ? (total > 1 ? `${r.livesLeft} of ${total} lives left` : "Alive") : `Out · Week ${r.outWeek}`;

/** One week's pick as a small tile: the team, colored by how it went. */
function Cell({ c }: { c: SvCell }) {
  const tone =
    c.state === "win" ? "bg-[var(--win-fill)] text-win" : c.state === "loss" || c.state === "missed" ? "bg-[var(--loss-fill)] text-loss" : "bg-bg text-ink";
  if (c.state === "out" || c.state === "before") return <span className="block h-9" />;
  if (c.state === "open") return <span className="flex h-9 items-center justify-center rounded-lg bg-bg text-faint" title="No pick showing yet">·</span>;
  if (c.state === "missed") return <span className={`flex h-9 items-center justify-center rounded-lg text-[11px] font-semibold ${tone}`} title="No pick: a loss">None</span>;
  return (
    <span
      className={`flex h-9 items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-bold ${tone} ${c.state === "void" ? "opacity-50" : ""}`}
      title={`${c.team ? teamName(c.team) : ""}${c.state === "win" ? " won" : c.state === "loss" ? " lost" : c.state === "void" ? " (game didn't count)" : ""}`}
    >
      <TeamLogo src={c.team?.logo_url} abbr={c.team?.abbreviation} className="size-4" />
      <span className="hidden sm:inline">{c.team?.abbreviation}</span>
    </span>
  );
}

export async function SurvivorHome({ ctx, slug }: { ctx: PoolBase; slug: string }) {
  const { settings, weeks, picks, members } = await getSurvivor(ctx);
  const rows = survivorStandings(weeks, picks, members, settings);
  const mine = rows.find((r) => r.userId === ctx.entryUserId);
  const week = currentWeek(weeks, settings.start_week);
  const myCell = week && mine ? mine.cells.find((c) => c.slateId === week.slateId) : undefined;
  // This week's pick can't move once its game has kicked off.
  const myPick = week ? picks.find((p) => p.slateId === week.slateId && p.userId === ctx.entryUserId) : undefined;
  const pickLocked = Boolean(myPick && week?.games.find((g) => g.id === myPick.gameId)?.started);
  const alive = rows.filter((r) => r.alive);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="space-y-4">
        <section className={card}>
          <div className="text-xs font-semibold uppercase tracking-wide text-accent">{week ? week.label : "Survivor"}</div>
          {!week ? (
            <p className="mt-1 text-sm text-muted">No week is open yet. The commissioner publishes each week&apos;s games before the first kickoff.</p>
          ) : !mine ? (
            <p className="mt-1 text-sm text-muted">You&apos;re following this pool without an entry.</p>
          ) : !mine.alive ? (
            <>
              <div className="mt-1 text-lg font-bold">Eliminated in Week {mine.outWeek}</div>
              <p className="text-sm text-muted">You can still follow who&apos;s left on Standings.</p>
            </>
          ) : (
            <>
              <div className="mt-1 text-lg font-bold">{settings.lives > 1 ? `You're alive: ${mine.livesLeft} of ${settings.lives} lives left` : "You're still alive"}</div>
              {myCell?.team ? (
                <p className="mt-1 flex items-center gap-2 text-sm">
                  <TeamLogo src={myCell.team.logo_url} abbr={myCell.team.abbreviation} className="size-6" />
                  <span>
                    This week: <span className="font-semibold">{teamName(myCell.team)}</span>
                    {myCell.state === "win" ? " · won" : myCell.state === "loss" ? " · lost" : ""}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-muted">{weekClosed(week) ? "This week's games are under way." : "No pick yet this week. A week without a pick counts as a loss."}</p>
              )}
              {!ctx.isGuest && !weekClosed(week) && !pickLocked && (
                <LinkButton href={`/p/${slug}/picks`} kind="accent" className="mt-3 w-full">
                  {myCell?.team ? "Change my pick" : "Make my pick"}
                </LinkButton>
              )}
            </>
          )}
        </section>
        <section className={card}>
          <h2 className="text-base font-bold">How it works</h2>
          <ul className="mt-1 space-y-1 text-sm text-ink">
            {survivorRules(settings).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      </div>
      <section className={card}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold">
            Still alive <span className="text-sm font-normal text-muted tabular-nums">· {alive.length} of {rows.length}</span>
          </h2>
          <Link href={`/p/${slug}/standings`} className="rounded-full px-2 py-1 text-sm font-semibold text-accent hover:bg-hover">Standings</Link>
        </div>
        {rows.length === 0 ? (
          <Empty>No entries yet.</Empty>
        ) : (
          <ul className="mt-1 divide-y divide-line">
            {(alive.length ? alive : rows).slice(0, 12).map((r) => {
              const c = week ? r.cells.find((x) => x.slateId === week.slateId) : undefined;
              return (
                <li key={r.userId} className={`flex items-center gap-3 py-2.5 ${r.userId === ctx.entryUserId ? "-mx-2 rounded-xl bg-accent/10 px-2" : ""}`}>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{r.name}</span>
                  <span className="text-xs text-muted tabular-nums">{lives(r, settings.lives)}</span>
                  <span className="w-14">{c && <Cell c={c} />}</span>
                </li>
              );
            })}
          </ul>
        )}
        {alive.length > 12 && <p className="pt-2 text-sm text-muted">+ {alive.length - 12} more on Standings</p>}
      </section>
    </div>
  );
}

/** A Survivor game in the shape the shared pick rows use (for the weeks before this one). */
function asSlateGame(g: SvGame): SlateGame {
  const team = (t: SvTeam) => ({ id: t.id, espn_id: t.espn_id ?? null, name: t.name, short_name: t.short_name, abbreviation: t.abbreviation, logo_url: t.logo_url, conference: null });
  return {
    id: g.id, startAt: g.startAt, timeTbd: Boolean(g.timeTbd), manualTime: false, lockAt: null, effectiveLockAt: g.startAt,
    status: g.final ? "final" : g.started ? "in_progress" : "scheduled",
    homeScore: g.homeScore, awayScore: g.awayScore, overridden: false, neutral: false, venue: null, tv: g.tv ?? null,
    homeRank: null, awayRank: null, spread: null, voided: g.voided, espnId: g.espnId ?? null,
    clock: g.clock ?? null, lastPlay: null, situation: null, possession: null, home: team(g.home), away: team(g.away),
  } as unknown as SlateGame;
}

/**
 * My Pick, laid out like every other pool's My Picks: the season's picks on the left, this
 * week's pick across the top, the week's games on the right (SurvivorBoard).
 */
export async function SurvivorPicksPage({ ctx, slug, forUserId, weekParam }: { ctx: PoolBase; slug: string; forUserId?: string; weekParam?: string }) {
  const behalf = Boolean(forUserId && ctx.isCommissioner && forUserId !== ctx.user.id);
  const { settings, picks, members, weeks } = await getSurvivor(ctx, behalf ? forUserId : undefined);
  const tz = (ctx as { displayTz?: string }).displayTz ?? tzOf(ctx);
  const target = behalf ? forUserId! : ctx.entryUserId;
  const rows = survivorStandings(weeks, picks, members, settings);
  const row = rows.find((r) => r.userId === target);
  const counted = weeks.filter((w) => w.week >= settings.start_week);
  const week = (weekParam ? counted.find((w) => w.week === Number(weekParam)) : null) ?? currentWeek(weeks, settings.start_week);
  const title = behalf && row ? <>Pick <span className="text-accent">for {row.name}</span></> : "My Pick";

  if (!week) return (<><PageTitle>{title}</PageTitle><Empty>No week is open yet. The commissioner publishes each week&apos;s games before the first kickoff.</Empty></>);
  if (!row) return (<><PageTitle>{title}</PageTitle><Empty>{ctx.isGuest ? "Guests can't make picks." : "This entry isn't playing."}</Empty></>);

  // eslint-disable-next-line react-hooks/purity -- render-time snapshot of which games are live
  const now = Date.now();
  // This week's games with everything the other pools' cards show (TV, live clock and last
  // play). A demo pool's made-up live scores (settings.demo_live_week) are laid over them.
  const sv = new Map(week.games.map((g) => [g.id, g]));
  const stored = (await getSlateGames(ctx as unknown as PoolContext, week.slateId)).map((g) => {
    const d = sv.get(g.id);
    if (!d || !d.clock || d.final) return g;
    return { ...g, status: "in_progress", homeScore: d.homeScore, awayScore: d.awayScore, clock: d.clock };
  });
  const [games, { spreads, records }] = await Promise.all([withLiveClocks("nfl", stored, now), getWeekExtras(ctx, week)]);

  const pick = picks.find((p) => p.slateId === week.slateId && p.userId === target) ?? null;
  const cell = row.cells.find((c) => c.slateId === week.slateId);
  const outAlready = cell?.state === "out";
  const canPick = !ctx.isGuest && (behalf || (!outAlready && !weekClosed(week)));
  const qs = (w: number) => `/p/${slug}/picks?week=${w}${behalf ? `&for=${target}` : ""}`;

  // Teams already used in other weeks (each team once, unless the pool allows repeats).
  const used: Record<string, string> = {};
  if (!settings.reuse) for (const [teamId, w] of row.used) if (w !== week.week) used[teamId] = `Wk ${w}`;

  // The season so far: every counted week before the one on screen, Week 1 first.
  const prior: SvPrior[] = row.cells
    .filter((c) => c.week < week.week && c.state !== "out" && c.state !== "before" && c.state !== "open")
    .map((c) => {
      const w = weeks.find((x) => x.slateId === c.slateId);
      const g = c.gameId ? w?.games.find((x) => x.id === c.gameId) : undefined;
      const side = g && c.team ? (c.team.id === g.home.id ? "home" : "away") : null;
      return {
        week: c.week,
        label: w?.label ?? `Week ${c.week}`,
        href: qs(c.week),
        game: g ? asSlateGame(g) : null,
        side,
        result: c.state === "win" || c.state === "loss" || c.state === "void" || c.state === "missed" ? c.state : "pending",
      } as SvPrior;
    });

  const statusText = outAlready || !row.alive ? `Out · Week ${row.outWeek}` : settings.lives > 1 ? `${row.livesLeft} of ${settings.lives} lives left` : "Alive";

  return (
    <div>
      {/* The week (with the week dropdown) on the left; live scores fill the space to their right. */}
      <div className="sm:flex sm:items-start sm:gap-6">
        <div className="flex shrink-0 items-start gap-3">
          <PageTitle>
            {week.label}
            {behalf ? <span className="text-accent"> for {row.name}</span> : null}
          </PageTitle>
          {counted.length > 1 && (
            <div className="pt-1">
              <LinkSelect size="md" ariaLabel="Choose a week" value={qs(week.week)} options={[...counted].reverse().map((w) => ({ href: qs(w.week), label: w.label }))} />
            </div>
          )}
        </div>
        <LiveTicker games={games} now={now} timezone={tz} className="-mt-2 mb-4 sm:mt-1.5 sm:mb-0 sm:flex-1" />
      </div>
      <AutoRefresh active={anyLive([week])} />
      <SurvivorBoard
        key={`${week.slateId}:${target}`}
        slug={slug}
        weekLabel={week.label}
        games={games}
        initialPick={pick ? { gameId: pick.gameId, teamId: pick.teamId } : null}
        used={used}
        canPick={canPick}
        behalf={behalf}
        records={records}
        spreads={Object.fromEntries(spreads)}
        timezone={tz}
        prior={prior}
        status={{ text: statusText, alive: row.alive && !outAlready }}
        backHref={qs(week.week)}
        historyHref={ctx.isGuest ? undefined : `/p/${slug}/standings`}
        save={saveSurvivorPick.bind(null, slug, week.slateId, behalf ? target : null)}
      />
    </div>
  );
}

/** "27–20", the picked team's score first. */
function cellScore(g: SvGame, teamId: string) {
  if (g.homeScore === null || g.awayScore === null) return null;
  const [us, them] = teamId === g.home.id ? [g.homeScore, g.awayScore] : [g.awayScore, g.homeScore];
  return `${us}–${them}`;
}

/**
 * Standings, laid out like the League Grid: entries down the side, a column per week (Week 1
 * on the left), each cell the team picked with its game's score, live or final, filled green or red.
 * A cell opens that game's play-by-play and box score.
 */
export async function SurvivorStandingsPage({ ctx, slug }: { ctx: PoolBase; slug: string }) {
  const loaded = await getSurvivor(ctx);
  const { settings, picks, members } = loaded;
  const weeks = await withLiveScores(loaded.weeks);
  const rows = survivorStandings(weeks, picks, members, settings);
  const counted = weeks.filter((w) => w.week >= settings.start_week).sort((a, b) => a.week - b.week);
  const order = new Map(counted.map((w, i) => [w.slateId, i]));
  const games = new Map(weeks.flatMap((w) => w.games).map((g) => [g.id, g]));
  const alive = rows.filter((r) => r.alive).length;
  const back = encodeURIComponent(`/p/${slug}/standings`);
  const head = "sticky top-0 z-20 border-b border-line bg-bg px-1 py-1.5 text-center align-bottom text-[11px] font-medium text-muted";

  const cellOf = (c: SvCell) => {
    const base = "h-11 min-w-13 border-b border-line px-0.5 text-center md:min-w-0";
    if (c.state === "out" || c.state === "before") return <td key={c.slateId} className={base} />;
    if (c.state === "open") return <td key={c.slateId} className={`${base} text-faint`} title="No pick showing yet">·</td>;
    if (c.state === "missed") {
      return (
        <td key={c.slateId} className={`${base} bg-[var(--loss-fill)] text-[11px] font-semibold text-loss`} title="No pick: a loss">
          No pick
        </td>
      );
    }
    const g = c.gameId ? games.get(c.gameId) : undefined;
    const live = Boolean(g && g.started && !g.final);
    const score = g && g.started && c.team ? cellScore(g, c.team.id) : null;
    const fill = c.state === "win" ? "bg-[var(--win-fill)] text-win" : c.state === "loss" ? "bg-[var(--loss-fill)] text-loss" : "text-ink";
    const label = `${c.team ? teamName(c.team) : ""}${c.state === "win" ? ", won" : c.state === "loss" ? ", lost" : c.state === "void" ? ", game didn't count" : live ? ", in progress" : ""}${score ? ` ${score}` : ""}`;
    const inner = (
      <>
        <span className="flex items-center justify-center gap-1">
          <TeamLogo src={c.team?.logo_url} abbr={c.team?.abbreviation} className="size-5 shrink-0" />
          <span className="text-[11px] font-bold leading-none max-sm:sr-only">{c.team?.abbreviation}</span>
        </span>
        {score && (
          <span className={`mt-0.5 flex items-center justify-center gap-1 text-[10px] font-semibold leading-none tabular-nums ${live ? "text-live" : ""}`}>
            {live && <span aria-hidden className="size-1.5 rounded-full bg-live" />}
            {score}
          </span>
        )}
        <span className="sr-only">{label}</span>
      </>
    );
    return (
      <td key={c.slateId} className={`${base} p-0 ${fill} ${c.state === "void" ? "opacity-50" : ""}`}>
        {g && g.started && g.espnId ? (
          <Link
            href={`/p/${slug}/game/${g.id}?back=${back}`}
            scroll={false}
            title={`${label} · play-by-play and box score`}
            className="flex h-11 flex-col items-center justify-center px-0.5 outline-none transition hover:bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          >
            {inner}
          </Link>
        ) : (
          <span className="flex h-11 flex-col items-center justify-center px-0.5" title={label}>{inner}</span>
        )}
      </td>
    );
  };

  return (
    // Fills the screen under the header like the League Grid, so the grid's own scrollbars sit
    // on screen; the week columns share the width on larger screens.
    <div
      data-fill-viewport
      className="flex max-h-[max(24rem,calc(100dvh-7.75rem-4px-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] flex-col sm:max-h-[max(24rem,calc(100dvh-8rem-3px-env(safe-area-inset-top)-env(safe-area-inset-bottom)))]"
    >
      <div className="mb-2 flex shrink-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Standings</h1>
        <p className="text-sm text-muted tabular-nums">
          <span className="font-semibold text-win">{alive} alive</span> of {rows.length}
          <span className="max-sm:hidden"> · Tap a pick for the game&apos;s play-by-play and box score</span>
        </p>
      </div>
      <AutoRefresh active={anyLive(weeks)} />
      {rows.length === 0 ? (
        <Empty>No entries yet.</Empty>
      ) : (
        <AxisLockScroll className="relative -mx-4 min-h-0 min-w-0 flex-1 overflow-auto isolate sm:mx-0">
          <table
            className="border-separate border-spacing-0 text-sm md:w-full md:min-w-[var(--grid-min)] md:table-fixed"
            style={{ "--grid-min": `${13 + counted.length * 3.75}rem` } as CSSProperties}
          >
            <thead>
              <tr>
                <th className={`${head} left-0 z-30 w-32 border-r px-3 text-left sm:px-4 md:w-52 lg:w-60`}>
                  <div className="flex items-end justify-between gap-3">
                    <span>Entry</span>
                    <span className="max-sm:hidden">Status</span>
                  </div>
                </th>
                {counted.map((w) => {
                  const live = w.games.some((g) => g.started && !g.final && !g.voided);
                  return (
                    <th key={w.slateId} className={head} title={w.label}>
                      {live && <div className="mb-0.5 whitespace-nowrap text-[10px]"><LiveDot>Live</LiveDot></div>}
                      <span className="whitespace-nowrap font-semibold text-ink">Wk {w.week}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const mine = r.userId === ctx.entryUserId;
                const cells = [...r.cells].sort((a, b) => (order.get(a.slateId) ?? 0) - (order.get(b.slateId) ?? 0));
                const status = r.alive ? (settings.lives > 1 ? `${r.livesLeft} of ${settings.lives}` : "Alive") : `Out · Wk ${r.outWeek}`;
                return (
                  <tr key={r.userId} className="[&:last-child>*]:border-b-0">
                    <th className={`sticky left-0 z-10 border-b border-r border-line bg-bg px-3 py-0.5 text-left text-[13px] font-medium sm:px-4 lg:text-sm ${mine ? "shadow-[inset_2px_0_0_var(--accent)]" : ""}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`min-w-0 flex-1 ${mine ? "text-accent" : r.alive ? "" : "text-muted"}`}>
                          {ctx.isCommissioner ? (
                            <Link href={`/p/${slug}/picks?for=${r.userId}`} className="block hover:underline" title="Make or fix this entry's pick">
                              <FitText min={9}>{r.name}</FitText>
                            </Link>
                          ) : (
                            <FitText min={9}>{r.name}</FitText>
                          )}
                          {/* Phones: the status under the name, so the column stays narrow. */}
                          <span className={`block text-[10px] leading-tight sm:hidden ${r.alive ? "font-semibold text-win" : "font-normal text-muted"}`}>{status}</span>
                        </span>
                        <span className={`shrink-0 whitespace-nowrap text-right text-xs tabular-nums max-sm:hidden ${r.alive ? "font-semibold text-win" : "font-normal text-muted"}`}>
                          {status}
                        </span>
                      </div>
                    </th>
                    {cells.map(cellOf)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </AxisLockScroll>
      )}
    </div>
  );
}
