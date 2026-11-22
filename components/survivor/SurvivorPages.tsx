import type { CSSProperties } from "react";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { AutoRefresh } from "@/components/AutoRefresh";
import { AxisLockScroll } from "@/components/AxisLockScroll";
import { FitText } from "@/components/FitText";
import { FillColumn } from "@/components/FillColumn";
import { Empty, LiveDot, PageTitle, SectionLabel, TeamLogo, chipClass } from "@/components/ui";
import { saveSurvivorPick } from "@/app/p/[slug]/formats/actions";
import type { PoolBase } from "@/lib/pool";
import { survivorStandings, weekClosed, type SvCell, type SvGame, type SvRow, type SvTeam, type SvWeek, type SurvivorSettings } from "@/lib/survivor";
import { anyLive, getSurvivor, getWeekExtras, withLiveScores } from "@/lib/survivorData";
import { SurvivorBoard, type SvPrior } from "./SurvivorBoard";
import { SurvivorSummary } from "./SurvivorSummary";
import { GridPanelDrawer } from "@/components/GridPanelDrawer";
import { Suspense } from "react";
import { Countdown } from "@/components/Countdown";
import { NewsList } from "@/components/NewsList";
import { getNews } from "@/lib/news";
import { NEWS_TITLE } from "@/lib/sports";
import { LiveTicker } from "@/components/LiveTicker";
import { getSlateGames, type PoolContext, type SlateGame } from "@/lib/pool";
import { withLiveClocks } from "@/lib/liveClock";

// The pages of an NFL Survivor pool: Home, My Pick and Standings. The pool routes reach these
// when settings.format is "survivor".

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

/** The pool's rules as label / value rows (Home's Pool Rules). */
function ruleRows(s: SurvivorSettings): [string, string][] {
  return [
    ["Each week", "Pick 1 winner"],
    ["Teams", s.reuse ? "Reuse allowed" : "Once per season"],
    ["Out after", s.lives === 1 ? "1 loss" : `${s.lives} losses`],
    ["Ties", s.tie === "loss" ? "Loss" : "Win"],
    ["No pick", "Loss"],
    ["Picks lock", "At kickoff"],
    ["Picks shown", "At kickoff"],
    ...(s.start_week > 1 ? ([["Starts", `Week ${s.start_week}`]] as [string, string][]) : []),
  ];
}

/**
 * Home, laid out like every other pool's: this week's games across the top; this week and
 * the pool's numbers on the left, the news in the middle, the season so far and the rules on
 * the right, split by the same thin blue lines.
 */
export async function SurvivorHome({ ctx, slug }: { ctx: PoolBase; slug: string }) {
  const loaded = await getSurvivor(ctx);
  const { settings, picks, members } = loaded;
  const weeks = await withLiveScores(loaded.weeks);
  const rows = survivorStandings(weeks, picks, members, settings);
  const mine = ctx.isGuest ? undefined : rows.find((r) => r.userId === ctx.entryUserId);
  const week = currentWeek(weeks, settings.start_week);
  const myCell = week && mine ? mine.cells.find((c) => c.slateId === week.slateId) : undefined;
  const myPick = week ? picks.find((p) => p.slateId === week.slateId && p.userId === ctx.entryUserId) : undefined;
  const pickGame = myPick ? week?.games.find((g) => g.id === myPick.gameId) : undefined;
  // eslint-disable-next-line react-hooks/purity -- render-time snapshot; the countdown ticks client-side
  const now = Date.now();
  const games = week ? await weekSlateGames(ctx, week, now) : [];
  const nextKick = week?.games.filter((g) => !g.voided && !g.started).map((g) => g.startAt).sort()[0] ?? null;
  const canPick = Boolean(mine?.alive && week && !weekClosed(week) && !pickGame?.started);
  const counted = weeks.filter((w) => w.week >= settings.start_week);
  const entryFee = Number((ctx.pool as { entry_fee?: number | string | null }).entry_fee ?? 0);
  const summary = { rows, weeks: counted, reuse: settings.reuse, entryFee, page: true } as const;

  return (
    <div data-wide className="space-y-6">
      {games.length > 0 && <LiveTicker games={games} now={now} timezone={tzOf(ctx)} />}
      <AutoRefresh active={anyLive(weeks)} />
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_minmax(0,17rem)] xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)_minmax(0,20rem)] 2xl:grid-cols-[minmax(0,23.5rem)_minmax(0,1fr)_minmax(0,23.5rem)] lg:gap-x-0 lg:divide-x lg:divide-[color-mix(in_srgb,var(--accent)_35%,transparent)]">
        {/* This week, then who's left and what the pool picked. On desktop the left and middle
            columns end level with the right one (FillColumn trims this week's picks and the news). */}
        <FillColumn className="space-y-6 lg:pr-6">
          {week ? (
            <section className="border-b border-line pb-4">
              <div className="whitespace-nowrap text-lg font-bold text-ink">{week.label}</div>
              <div className="mt-2 grid grid-cols-2 gap-4 [&>*]:min-w-0">
                {!ctx.isGuest && (
                  <div className="min-w-0">
                    <FitText min={9} className="text-xs text-muted">My Pick</FitText>
                    <FitText min={16} className="mt-0.5 text-3xl font-extrabold tracking-[-0.03em]">
                      {!mine ? (
                        <span className="text-muted">No entry</span>
                      ) : !mine.alive ? (
                        <span className="text-loss">Out · Wk {mine.outWeek}</span>
                      ) : myCell?.team ? (
                        <span className={`inline-flex items-center gap-2 ${myCell.state === "win" ? "text-win" : myCell.state === "loss" ? "text-loss" : ""}`}>
                          <TeamLogo src={myCell.team.logo_url} abbr={myCell.team.abbreviation} className="size-[1.1em] shrink-0" />
                          {teamName(myCell.team)}
                        </span>
                      ) : (
                        <span className="text-muted">None yet</span>
                      )}
                    </FitText>
                  </div>
                )}
                {nextKick && (
                  <div className="min-w-0">
                    <FitText min={9} className="text-xs text-muted">Next Game Locks</FitText>
                    <FitText min={16} className="mt-0.5 text-3xl font-extrabold tracking-[-0.03em] tabular-nums">
                      <Countdown to={nextKick} done="locked" />
                    </FitText>
                  </div>
                )}
              </div>
              {canPick && !myCell?.team && (
                <Link
                  href={`/p/${slug}/picks`}
                  className="mt-3 flex h-10 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 text-[15px] font-semibold text-white shadow-sm transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:brightness-95"
                >
                  <span className="whitespace-nowrap">Make {week.label} Pick <span aria-hidden>→</span></span>
                </Link>
              )}
              <div className="mt-3 flex gap-1.5 whitespace-nowrap">
                {!ctx.isGuest && <Link href={`/p/${slug}/picks`} className={chipClass(true, "", "sm")}>My Pick</Link>}
                <Link href={`/p/${slug}/standings`} className={chipClass(ctx.isGuest, "", "sm")}>Everyone&apos;s picks</Link>
              </div>
            </section>
          ) : (
            <Empty>
              No week is published yet.
              {ctx.isCommissioner && (
                <> <Link className="text-accent" href={`/p/${slug}/admin/slate`}>Set up the first week</Link>.</>
              )}
            </Empty>
          )}
          {rows.length > 0 && <SurvivorSummary {...summary} only={["remaining", "picks"]} />}
        </FillColumn>

        {/* Top stories, as on every pool's Home. */}
        <FillColumn className="order-last lg:order-none lg:px-6">
          <Suspense fallback={<p className="text-sm text-muted">Loading the news…</p>}>
            <SurvivorNews now={now} />
          </Suspense>
        </FillColumn>

        {/* The season so far, then the rules. */}
        <div className="space-y-6 lg:pl-6">
          {rows.length > 0 && <SurvivorSummary {...summary} only={["teams", "eliminated"]} />}
          <section>
            <SectionLabel fit className="!text-sm lg:!text-base">Pool Rules</SectionLabel>
            {/* Short tiles, two across: each rule's name over its answer, one line apiece. */}
            <dl className="mt-2 grid grid-cols-2 gap-2">
              {ruleRows(settings).map(([k, v]) => (
                <div key={k} className="min-w-0 rounded-xl bg-surface px-3 py-2">
                  <dt className="truncate text-[11px] font-medium uppercase tracking-wide text-muted">{k}</dt>
                  <dd className="mt-0.5 min-w-0 text-sm font-semibold text-ink">
                    <FitText min={10}>{v}</FitText>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

/** NFL top stories; streams in after the rest of the page. */
async function SurvivorNews({ now }: { now: number }) {
  return <NewsList stories={await getNews("nfl", 10)} now={now} title={NEWS_TITLE.nfl} />;
}

/**
 * A week's games with everything the other pools' cards and ticker show (TV, live clock and
 * last play). A demo pool's made-up live scores (settings.demo_live_week) are laid over them.
 */
async function weekSlateGames(ctx: PoolBase, week: SvWeek, now: number): Promise<SlateGame[]> {
  const sv = new Map(week.games.map((g) => [g.id, g]));
  const stored = (await getSlateGames(ctx as unknown as PoolContext, week.slateId)).map((g) => {
    const d = sv.get(g.id);
    if (!d || !d.clock || d.final) return g;
    return { ...g, status: "in_progress", homeScore: d.homeScore, awayScore: d.awayScore, clock: d.clock };
  });
  return withLiveClocks("nfl", stored, now);
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
  const [games, { spreads, records }] = await Promise.all([weekSlateGames(ctx, week, now), getWeekExtras(ctx, week)]);

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
      {/* The week on the left; live scores fill the space to their right. Earlier weeks' picks
          are in the left column; their games are on the Scores page. */}
      <div className="sm:flex sm:items-start sm:gap-6">
        <div className="shrink-0">
          <PageTitle>
            {week.label}
            {behalf ? <span className="text-accent"> for {row.name}</span> : null}
          </PageTitle>
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
  // A thin line between weeks.
  const weekLine = "border-r border-line last:border-r-0";

  const cellOf = (c: SvCell) => {
    const base = `h-12 min-w-[4.75rem] border-b border-line px-0.5 text-center md:min-w-0 ${weekLine}`;
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
    // The green or red fill gives the result; team names and scores stay black.
    const fill = `text-ink ${c.state === "win" ? "bg-[var(--win-fill)]" : c.state === "loss" ? "bg-[var(--loss-fill)]" : ""}`;
    const label = `${c.team ? teamName(c.team) : ""}${c.state === "win" ? ", won" : c.state === "loss" ? ", lost" : c.state === "void" ? ", game didn't count" : live ? ", in progress" : ""}${score ? ` ${score}` : ""}`;
    const home = Boolean(g && c.team && c.team.id === g.home.id);
    const opp = g ? (home ? g.away : g.home) : null;
    const abbr = (t: SvTeam | null | undefined) => t?.abbreviation ?? t?.short_name ?? t?.name ?? "";
    // Away team on top, home team below; the team ahead (the winner, once final) in bold.
    const hs = g?.homeScore ?? null;
    const as = g?.awayScore ?? null;
    const lead: "home" | "away" | null = hs !== null && as !== null && hs !== as ? (hs > as ? "home" : "away") : null;
    const line = (t: SvTeam, score: number | null, side: "home" | "away") => (
      <>
        <span className={lead === side ? "font-extrabold" : "font-normal opacity-70"}>{abbr(t)}</span>
        <span className={`text-right ${lead === side ? "font-extrabold" : "font-normal opacity-70"}`}>{score ?? ""}</span>
      </>
    );
    const inner =
      g && g.started && opp ? (
        // Under way or over: the score, away above home; the pick's logo on the right.
        <span className="flex items-center justify-center gap-1.5">
          <span className="grid grid-cols-[auto_auto] items-baseline gap-x-1.5 text-left text-[11px] leading-[1.15] tabular-nums">
            {line(g.away, as, "away")}
            {line(g.home, hs, "home")}
          </span>
          <span className="relative">
            <TeamLogo src={c.team?.logo_url} abbr={c.team?.abbreviation} className="size-6 shrink-0" />
            {live && <span aria-hidden className="absolute -right-0.5 -top-0.5 size-2 animate-pulse rounded-full bg-live ring-2 ring-bg" />}
          </span>
        </span>
      ) : (
        // Before kickoff: the pick's logo, large, with the matchup under it ("DEN @ SEA").
        <span className="flex flex-col items-center justify-center gap-0.5">
          <TeamLogo src={c.team?.logo_url} abbr={c.team?.abbreviation} className="size-7 shrink-0" />
          {opp && (
            <span className="whitespace-nowrap text-[10px] font-semibold leading-none">
              {abbr(c.team)} <span className="font-normal text-muted">{home ? "vs" : "@"}</span> {abbr(opp)}
            </span>
          )}
        </span>
      );
    const content = (
      <>
        {inner}
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
            className="flex h-12 flex-col items-center justify-center px-1 outline-none transition hover:bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          >
            {content}
          </Link>
        ) : (
          <span className="flex h-12 flex-col items-center justify-center px-1" title={label}>{content}</span>
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
        <p className="text-base text-muted tabular-nums sm:text-lg">
          <span className="text-2xl font-extrabold text-win sm:text-3xl">{alive}</span> <span className="font-semibold text-win">alive</span> of {rows.length}
        </p>
      </div>
      <AutoRefresh active={anyLive(weeks)} />
      {rows.length === 0 ? (
        <Empty>No entries yet.</Empty>
      ) : (
        <AxisLockScroll className="relative -mx-4 min-h-0 min-w-0 flex-1 overflow-auto isolate sm:mx-0">
          <table
            className="border-separate border-spacing-0 text-sm md:w-full md:min-w-[var(--grid-min)] md:table-fixed"
            style={{ "--grid-min": `${13 + counted.length * 4.75}rem` } as CSSProperties}
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
                    <th key={w.slateId} className={`${head} ${weekLine}`} title={w.label}>
                      {live && <div className="mb-0.5 whitespace-nowrap text-[10px]"><LiveDot>Live</LiveDot></div>}
                      <span className="whitespace-nowrap text-[13px] font-bold text-ink sm:text-sm">Week {w.week}</span>
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
                        <span className={`min-w-0 flex-1 ${mine ? "text-accent" : r.alive ? "" : "text-loss"}`}>
                          {ctx.isCommissioner ? (
                            <Link href={`/p/${slug}/picks?for=${r.userId}`} className="block hover:underline" title="Make or fix this entry's pick">
                              <FitText min={9}>{r.name}</FitText>
                            </Link>
                          ) : (
                            <FitText min={9}>{r.name}</FitText>
                          )}
                          {/* Phones: the status under the name, so the column stays narrow. */}
                          <span className={`block text-[10px] leading-tight sm:hidden ${r.alive ? "font-semibold text-win" : "font-medium text-loss"}`}>{status}</span>
                        </span>
                        <span className={`shrink-0 whitespace-nowrap text-right text-xs tabular-nums max-sm:hidden ${r.alive ? "font-semibold text-win" : "font-medium text-loss"}`}>
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
      {/* The Pool Summary tab on the screen's edge, as on the League Grid. */}
      {rows.length > 0 && (
        <GridPanelDrawer>
          <SurvivorSummary rows={rows} weeks={counted} lives={settings.lives} reuse={settings.reuse} entryFee={Number((ctx.pool as { entry_fee?: number | string | null }).entry_fee ?? 0)} />
        </GridPanelDrawer>
      )}
    </div>
  );
}
