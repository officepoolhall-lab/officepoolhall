import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Empty, PageTitle, SectionLabel, TeamLogo, chipClass } from "@/components/ui";
import { Countdown } from "@/components/Countdown";
import { FitText } from "@/components/FitText";
import { FillColumn } from "@/components/FillColumn";
import { savePfLineup } from "@/app/p/[slug]/formats/actions";
import type { PoolBase } from "@/lib/pool";
import { FLEX_POS, POSITIONS, POSITION_NAME, ROUNDS, optimalLineup, rosterText, pfScoringTable, rosterSize, statColumns, type PfDemoSeeds, type PfSettings } from "@/lib/playoffFantasy";
import { ScoringInfo as ScoringPopup } from "@/components/ScoringInfo";
import type { ReactNode } from "react";
import { NO_POINTS, pfPicture, getPf, getPfPoints, getPfGames, getPfInjuries, getPfSeasonStats, pfStandings, playoffTicker, weeklyView, type PfEntry, type PfPlayer, type PfPoints, type PfRow, type PfTeam, type PfWeeklyRow } from "@/lib/playoffFantasyData";
import { savePfWeekly } from "@/app/p/[slug]/formats/actions";
import { WEEKLY_ROUNDS, currentRound, lostIn, aliveAt, playerLocked, roundKicks, roundOpen, teamGame } from "@/lib/pfWeekly";
import type { PlayoffGame } from "@/lib/nflPlayoffs";
import { PfWeeklyRounds } from "./PfWeekly";
import { PfLineupBuilder } from "./PfLineupBuilder";
import { PfBracket } from "./PfBracket";
import { PfRosterTable, type PfRosterRow } from "./PfRoster";
import { PfSummaryTabs, type SumGroup, type SumPlayer } from "./PfSummaryTabs";
import { PoolPageHeader } from "@/components/PoolPageHeader";
import { LiveTicker } from "@/components/LiveTicker";
import { ExpandAll } from "@/components/ExpandAll";

// The pages of an NFL Playoff Fantasy pool: Home, My Team and Standings. The pool routes reach
// these when settings.format is "playoff_fantasy".

const card = "rounded-2xl bg-surface p-4 sm:p-5";
const tzOf = (ctx: PoolBase) => ((ctx.pool.settings as { timezone?: string } | null)?.timezone ?? "America/Chicago");
const lockLabel = (iso: string, tz: string) => formatInTimeZone(iso, tz, "EEE, MMM d · h:mm a");
/** Points, always to two decimals (12.40, 0.00). */
const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/**
 * Weekly style: the playoff games, everyone's points, and each entry's round lineups as the
 * viewer may see them (their own entry whole; the commissioner sees all; others' players as each
 * locks). Season-roster pools get their usual rows.
 */
async function standingsFor(ctx: PoolBase, settings: PfSettings, players: PfPlayer[], teams: PfTeam[], entries: PfEntry[], locked: boolean) {
  const games = await getPfGames(ctx.pool.season, players, teams, settings.demo_sim);
  const pts = locked ? await getPfPoints(ctx.pool.season, settings.scoring, players, teams, settings.demo_sim) : NO_POINTS;
  const now = Date.now(); // eslint-disable-line react-hooks/purity -- render-time snapshot of the locks
  if (settings.style !== "weekly") return { games, pts, rows: pfStandings(entries, players, teams, pts) as (PfRow | PfWeeklyRow)[], weekly: null, now };
  const rows = weeklyView(entries, players, teams, pts, games, { now, mode: settings.weekly_lock, full: (u) => u === ctx.entryUserId || ctx.isCommissioner });
  const cur = currentRound(games);
  // When the current round's lineups next lock: its first kickoff still to come.
  const ks = roundKicks(games, cur);
  const nextLock = ks && ks.first > now ? new Date(ks.first).toISOString() : null;
  return { games, pts, rows: rows as (PfRow | PfWeeklyRow)[], weekly: { rows, cur, nextLock, open: roundOpen(games, cur, now, settings.weekly_lock) }, now };
}

/** One entry's roster for the locked My Team table: position by position, each player's pool ownership, points by round and his playoff games. */
function rosterRows(ids: string[], players: PfPlayer[], teams: PfTeam[], pts: PfPoints, own: Map<string, number> | null): PfRosterRow[] {
  const playerOf = new Map(players.map((p) => [p.id, p]));
  const teamOf = new Map(teams.map((t) => [t.id, t]));
  const mine = ids.map((id) => playerOf.get(id)).filter((p): p is PfPlayer => Boolean(p));
  const order = (p: PfPlayer) => POSITIONS.indexOf(p.pos);
  return [...mine]
    .sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name))
    .map((p) => {
      const team = teamOf.get(p.teamId);
      const espn = team?.espnId ?? "";
      const score = pts.byPlayer.get(p.id);
      const games = pts.games.get(espn) ?? [];
      const log = statColumns(p.pos, [0, 1, 2, 3].map((i) => pts.lines.get(p.id)?.[i] ?? null));
      return {
        id: p.id,
        name: p.name,
        pos: p.pos,
        team: team?.abbreviation ?? null,
        logo: team?.logo_url ?? null,
        out: pts.out.has(espn),
        own: own ? (own.get(p.id) ?? 0) : null,
        total: score?.total ?? 0,
        statHead: log.head,
        rounds: [0, 1, 2, 3].map((i) => {
          const g = games[i] ?? null;
          return {
            game: g ? { oppAbbr: g.oppAbbr, oppLogo: g.oppLogo, home: g.home, us: g.us, them: g.them, state: g.state } : null,
            stats: log.rows[i],
            points: g ? (score?.rounds[i] ?? 0) : null,
          };
        }),
      };
    });
}

/** Each player's share of the pool's lineups (0-100, rounded), counting entries that set one. */
function ownership(entries: { playerIds: string[] }[]): Map<string, number> {
  const set = entries.filter((e) => e.playerIds.length > 0);
  const count = new Map<string, number>();
  for (const e of set) for (const id of new Set(e.playerIds)) count.set(id, (count.get(id) ?? 0) + 1);
  return new Map([...count].map(([id, n]) => [id, Math.round((n / Math.max(1, set.length)) * 100)]));
}


/** The scoring pop-up's "i", with this pool's rules. */
function ScoringInfo({ settings }: { settings: PfSettings }) {
  const roster = rosterText(settings);
  const intro =
    settings.style === "weekly"
      ? `Lineup each round: ${roster}. A player's points are multiplied by the rounds in a row he's been in your lineup: 2x, 3x, up to 4x.`
      : `Lineup: ${roster}. Every player scores every round through the Super Bowl.`;
  return <ScoringPopup groups={pfScoringTable(settings)} intro={intro} />;
}

/**
 * Before the lock, for anyone whose lineup isn't full: how many are picked, when it locks and a
 * link to finish. Red in the last day.
 */
function LockReminder({ ctx, slug, settings, entries, locked, lockAt }: { ctx: PoolBase; slug: string; settings: PfSettings; entries: PfEntry[]; locked: boolean; /** Weekly style: when this round's lineups lock. */ lockAt?: string | null }) {
  const at = lockAt === undefined ? settings.lock_at : lockAt;
  if (locked || ctx.isGuest || !at) return null;
  const mine = entries.find((e) => e.userId === ctx.entryUserId);
  const size = rosterSize(settings);
  if (!mine || mine.playerIds.length >= size) return null;
  const left = Date.parse(at) - Date.now(); // eslint-disable-line react-hooks/purity -- render-time snapshot
  if (left <= 0) return null;
  const soon = left < 24 * 60 * 60 * 1000;
  return (
    <div className={`mb-4 flex items-center gap-3 rounded-xl border-2 px-4 py-2.5 text-sm ${soon ? "border-loss bg-[color-mix(in_srgb,var(--color-loss)_8%,transparent)]" : "border-accent bg-surface"}`}>
      <div className="min-w-0 flex-1">
        <FitText min={10} className="block font-semibold">
          {mine.playerIds.length ? `Your lineup has ${mine.playerIds.length} of ${size} players.` : "You haven't picked a lineup yet."}
        </FitText>
        <FitText min={9} className="block text-xs text-muted">
          {settings.style === "weekly" && settings.weekly_lock === "player" ? "First game in" : "Locks in"} <Countdown to={at} done="moments" /> · {lockLabel(at, tzOf(ctx))}<span className="hidden sm:inline">. Empty spots score nothing.</span>
        </FitText>
      </div>
      <Link href={`/p/${slug}/picks`} className={`flex h-9 shrink-0 items-center rounded-lg px-3 text-sm font-semibold whitespace-nowrap text-white transition hover:brightness-110 ${soon ? "bg-loss" : "bg-accent"}`}>
        {mine.playerIds.length ? "Finish" : "Pick"} <span className="ml-1 hidden sm:inline">my lineup</span> <span aria-hidden className="ml-1">→</span>
      </Link>
    </div>
  );
}

const NOT_READY = "Rosters open as soon as the playoff field is set, at the end of the regular season. The 14 teams and their players load here by themselves.";


/**
 * Home, laid out like every other pool's: the playoffs and the standings on the left, the news
 * in the middle, the pool's numbers and the rules on the right, split by the same thin blue
 * lines and ending level at the bottom.
 */
export async function PfHome({ ctx, slug }: { ctx: PoolBase; slug: string }) {
  const { settings, teams, players, entries, locked } = await getPf(ctx);
  // The Wild Card matchups (as the standings stand today until the season is over).
  const [picture, sf] = await Promise.all([pfPicture(ctx.pool.season, settings.demo_seeds, teams), standingsFor(ctx, settings, players, teams, entries, locked)]);
  const { games, pts, rows, weekly } = sf;
  const mine = ctx.isGuest ? undefined : rows.find((r) => r.userId === ctx.entryUserId);
  const mineAt = mine ? rows.indexOf(mine) : -1;
  const size = rosterSize(settings);
  const fieldSet = games.filter((g) => g.round === 0).length >= 6;
  const ticker = playoffTicker(games);
  // eslint-disable-next-line react-hooks/purity -- render-time snapshot; the countdown ticks client-side
  const now = Date.now();
  const teamsLeft = teams.filter((t) => !pts.out.has(t.espnId ?? "")).length;
  const stat = "mt-0.5 text-4xl font-extrabold tracking-[-0.03em] tabular-nums";

  return (
    <div data-wide className="space-y-6">
      {pts.live && <AutoRefresh active />}
      {weekly ? (
        <LockReminder ctx={ctx} slug={slug} settings={settings} entries={rows} locked={!weekly.open} lockAt={weekly.nextLock} />
      ) : (
        <LockReminder ctx={ctx} slug={slug} settings={settings} entries={entries} locked={locked} />
      )}
      {/* Live scores across the top, as on every pool's Home. */}
      {ticker.games.length > 0 && <LiveTicker games={ticker.games} now={now} timezone={tzOf(ctx)} />}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,23.5rem)_minmax(0,1fr)] lg:gap-x-0 lg:divide-x lg:divide-[color-mix(in_srgb,var(--accent)_35%,transparent)]">
        {/* The playoffs and where everyone stands (everything in it stays on one line, shrinking to fit). */}
        <FillColumn className="space-y-6 lg:pr-6">
          <section className="border-b border-line pb-4">
            <div className="whitespace-nowrap text-lg font-bold text-ink">NFL Playoffs</div>
            {players.length === 0 ? (
              <p className="mt-1 text-sm text-muted">{NOT_READY}</p>
            ) : (
              <>
                <div className="mt-2 grid grid-cols-2 gap-4 [&>*]:min-w-0">
                  {!ctx.isGuest && mine && (
                    <div>
                      <FitText min={9} className="text-xs text-muted">{locked ? "My Points" : weekly ? "My Lineup" : "My Roster"}</FitText>
                      <FitText min={18} className={stat}>
                        {locked ? (
                          fmt(mine.points)
                        ) : mine.playerIds.length >= size ? (
                          "Submitted"
                        ) : (
                          <span className={mine.playerIds.length ? "" : "text-muted"}>
                            {mine.playerIds.length}
                            <span className="text-muted">/{size}</span>
                          </span>
                        )}
                      </FitText>
                    </div>
                  )}
                  <div>
                    <FitText min={9} className="text-xs text-muted">{locked ? "Still Playing" : weekly ? "Lineups Lock" : "Rosters Lock"}</FitText>
                    <FitText min={18} className={stat}>
                      {locked ? (
                        mine ? (
                          <>
                            {mine.alive}
                            <span className="text-muted">/{mine.playerIds.length}</span>
                          </>
                        ) : (
                          <>
                            {teamsLeft}
                            <span className="text-muted">/{teams.length}</span>
                          </>
                        )
                      ) : settings.lock_at && Date.parse(settings.lock_at) > now ? (
                        <Countdown to={settings.lock_at} done="locked" />
                      ) : (
                        <span className="text-2xl">Wild Card</span>
                      )}
                    </FitText>
                  </div>
                </div>
                {!locked && settings.lock_at && <FitText min={9} className="mt-1 block text-xs text-muted">{lockLabel(settings.lock_at, tzOf(ctx))}</FitText>}
                {(weekly ? weekly.open : !locked) && !ctx.isGuest && mine && mine.playerIds.length < size && (
                  <Link
                    href={`/p/${slug}/picks`}
                    className="mt-3 flex h-10 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 text-[15px] font-semibold text-white shadow-sm transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:brightness-95"
                  >
                    <span className="whitespace-nowrap">
                      {weekly ? (mine.playerIds.length ? "Finish my lineup" : "Set my lineup") : mine.playerIds.length ? "Finish my roster" : "Build my roster"} <span aria-hidden>→</span>
                    </span>
                  </Link>
                )}
                <div className="mt-3 flex gap-1.5 whitespace-nowrap">
                  {!ctx.isGuest && <Link href={`/p/${slug}/picks`} className={chipClass(true, "", "sm")}>My Team</Link>}
                  <Link href={`/p/${slug}/standings`} className={chipClass(ctx.isGuest, "", "sm")}>Standings</Link>
                  <Link href={`/p/${slug}/summary`} className={chipClass(false, "", "sm")}>Pool Summary</Link>
                </div>
              </>
            )}
          </section>
          <section>
            <div className="flex items-baseline justify-between gap-3">
              <SectionLabel fit className="!text-sm lg:!text-base">Standings</SectionLabel>
            </div>
            {rows.length === 0 ? (
              <Empty>No entries yet.</Empty>
            ) : (
              // Every entry: phones show the top 10, desktop as many as fit beside the other
              // columns (FillColumn). Your own row is pinned under the list whenever it's cut.
              <ul data-fill-list className="mt-2 divide-y divide-line border-y border-line">
                {rows.map((r, i) => (
                  <StandingRow key={r.userId} r={r} me={r.userId === ctx.entryUserId} locked={locked} size={size} progress={ctx.isCommissioner} className={i >= 10 ? "max-lg:hidden" : ""} />
                ))}
                {mineAt >= 3 && mine && (
                  <>
                    <li aria-hidden data-fill-pin="block" className={`py-1 text-center text-xs leading-none text-faint lg:hidden ${mineAt >= 10 ? "" : "max-lg:hidden"}`}>···</li>
                    <StandingRow r={mine} me locked={locked} size={size} progress={ctx.isCommissioner} pin className={`lg:hidden ${mineAt >= 10 ? "" : "max-lg:hidden"}`} />
                  </>
                )}
              </ul>
            )}
          </section>
        </FillColumn>

        {/* The playoff bracket (the field as it stands today until the season is over). */}
        <div className="order-last lg:order-none lg:pl-6">
          {picture ? (
            <PfBracket picture={picture} games={games} out={pts.out} projected={!fieldSet} />
          ) : (
            <Empty>The bracket shows here once ESPN&apos;s standings can be read.</Empty>
          )}
        </div>

      </div>
    </div>
  );
}


/** One entry's line in Home's standings. */
function StandingRow({ r, me, locked, pin = false, className = "" }: { r: PfRow; me: boolean; locked: boolean; size: number; progress: boolean; pin?: boolean; className?: string }) {
  return (
    <li
      {...(me && !pin ? { "data-fill-me": "" } : {})}
      {...(pin ? { "data-fill-pin": "flex" } : {})}
      className={`flex items-center gap-2.5 py-1.5 text-sm ${me ? "bg-accent/10 shadow-[inset_2px_0_0_var(--accent)]" : ""} ${className}`}
    >
      <span className="w-6 shrink-0 pl-1 text-right text-xs tabular-nums text-muted">{locked ? r.rank : ""}</span>
      {/* The whole name on one line: it shrinks to fit rather than being cut off. */}
      <span className="min-w-0 flex-1">
        <FitText min={10} className={`block ${me ? "font-semibold text-accent" : "font-medium"}`}>{r.name}</FitText>
      </span>
      {/* Just the points (0 until the games start). */}
      <span className="w-12 shrink-0 pr-1 text-right font-bold tabular-nums">{fmt(r.points)}</span>
    </li>
  );
}


/**
 * Each team's opponent in round r, for My Team: "vs PIT" at home, "@ DEN" away, "Bye" for a No. 1
 * seed in the Wild Card round. From the playoff games once they're set; before that (a demo
 * pool), the Wild Card matchups if the season ended today (2 hosts 7, 3 hosts 6, 4 hosts 5).
 */
async function opponentsFor(season: number, games: PlayoffGame[], teams: PfTeam[], r: number, seeds: PfDemoSeeds | null | undefined, all: PfTeam[] = teams): Promise<Record<string, string>> {
  const idOf = new Map(teams.map((t) => [t.espnId ?? "", t.id]));
  const abbr = (t: { abbreviation: string | null; name: string }) => t.abbreviation ?? t.name;
  const out: Record<string, string> = {};
  // Games with both teams set (ESPN lists the Wild Card games with "TBD" teams before then).
  const here = games.filter((g) => g.round === r && g.teams.length === 2 && g.teams.every((t) => idOf.has(t.espnId)));
  if (here.length) {
    for (const g of here)
      for (const [a, b] of [[g.teams[0], g.teams[1]], [g.teams[1], g.teams[0]]]) {
        const id = idOf.get(a.espnId);
        if (id) out[id] = `${a.homeAway === "home" ? "vs" : "@"} ${abbr(b)}`;
      }
    // The Wild Card round: a playoff team with no game has the bye.
    if (r === 0 && here.length >= 6) for (const t of teams) if (!out[t.id]) out[t.id] = "Bye";
    return out;
  }
  if (r !== 0) return out;
  const picture = await pfPicture(season, seeds, all);
  if (!picture) return out;
  for (const seeds of [picture.AFC, picture.NFC]) {
    const at = (n: number) => seeds.find((s) => s.seed === n);
    const top = at(1);
    if (top && idOf.has(top.espnId)) out[idOf.get(top.espnId)!] = "Bye";
    for (const [h, a] of [[2, 7], [3, 6], [4, 5]]) {
      const home = at(h);
      const away = at(a);
      // Only matchups between two of the pool's teams (its field may be from an earlier week).
      if (!home || !away || !idOf.has(home.espnId) || !idOf.has(away.espnId)) continue;
      out[idOf.get(home.espnId)!] = `vs ${abbr(away)}`;
      out[idOf.get(away.espnId)!] = `@ ${abbr(home)}`;
    }
  }
  return out;
}

export async function PfPicksPage({ ctx, slug, forUserId, round }: { ctx: PoolBase; slug: string; forUserId?: string; /** Weekly style: which round to show (default: the current one). */ round?: number }) {
  const { settings, teams, players, entries, locked } = await getPf(ctx);
  const tz = tzOf(ctx);
  const behalf = Boolean(forUserId && ctx.isCommissioner && forUserId !== ctx.user.id);
  const target = behalf ? forUserId! : ctx.entryUserId;
  const entry = entries.find((e) => e.userId === target);
  const title = behalf && entry ? <>Roster <span className="text-accent">for {entry.name}</span></> : "My Team";
  // The top of the page, as on every pool's My Picks: the round on the left, its live scores beside it.
  const now = Date.now(); // eslint-disable-line react-hooks/purity -- render-time snapshot
  const allGames = await getPfGames(ctx.pool.season, players, teams, settings.demo_sim);
  const ticker = playoffTicker(allGames);
  const head = (sub?: ReactNode) => (
    <PoolPageHeader
      title={<>{ticker.label ?? "NFL Playoffs"}{behalf && entry ? <span className="text-accent"> for {entry.name}</span> : null}</>}
      sub={sub}
      games={ticker.games}
      now={now}
      timezone={tz}
    />
  );
  if (players.length === 0) return (<><PageTitle>{title}</PageTitle><Empty>{NOT_READY}</Empty></>);
  if (!entry) return (<><PageTitle>{title}</PageTitle><Empty>{ctx.isGuest ? "Guests can't build a roster." : "This entry isn't playing."}</Empty></>);
  if (settings.style === "weekly") return <PfWeeklyPicks {...{ ctx, slug, settings, players, teams, entry, locked, behalf, target, round, head }} />;

  if (locked && !behalf) {
    const pts = await getPfPoints(ctx.pool.season, settings.scoring, players, teams, settings.demo_sim);
    const row = pfStandings([entry], players, teams, pts)[0];
    return (
      <>
        {head()}
        {pts.live && <AutoRefresh active />}
        {entry.playerIds.length === 0 ? (
          <Empty>No roster was set for this entry.</Empty>
        ) : (
          <section className="mt-4 sm:max-w-2xl">
            <div className="flex items-baseline justify-between gap-3 border-b border-line pb-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <SectionLabel fit className="!text-sm lg:!text-base">My Lineup</SectionLabel>
                <ScoringInfo settings={settings} />
              </span>
              <span className="shrink-0 text-lg font-extrabold tabular-nums">{fmt(row.points)}</span>
            </div>
            <PfRosterTable rows={rosterRows(entry.playerIds, players, teams, pts, ownership(entries))} roundTotals={row.rounds} started={pts.roundsStarted} />
            <p className="mt-2 text-xs text-muted">Lineups locked {lockLabel(settings.lock_at!, tz)}.</p>
          </section>
        )}
      </>
    );
  }

  const [stats, injuries, opponents] = await Promise.all([getPfSeasonStats(ctx.pool.season, players, settings.scoring, teams), getPfInjuries(teams), opponentsFor(ctx.pool.season, allGames, teams, 0, settings.demo_seeds)]);
  return (
    <>
      <h1 className="sr-only">{title}</h1>
      {ticker.games.length > 0 && <LiveTicker games={ticker.games} now={now} timezone={tz} className="mb-4" />}
      {ctx.isGuest ? (
        <Empty>Guests can&apos;t build a roster.</Empty>
      ) : (
        <PfLineupBuilder
          players={players}
          stats={stats}
          injuries={injuries}
          teams={teams}
          roster={settings.roster}
          flex={settings.flex}
          initial={entry.playerIds}
          save={savePfLineup.bind(null, slug, behalf ? target : null)}
          forName={behalf ? entry.name : undefined}
          lockText={settings.lock_at ? `Locks ${lockLabel(settings.lock_at, tz)}` : "Locks at the first Wild Card kickoff"}
          scoringInfo={<ScoringInfo settings={settings} />}
          timezone={tz}
          opponents={opponents}
        />
      )}
    </>
  );
}

/**
 * My Team, weekly style: a chip for each round so far, then the chosen round's lineup. The
 * current round, while it's open, is the lineup builder (any players, no team limit; players
 * whose game has kicked off are locked; each shows the multiplier he'd score at this round). A
 * round that has locked shows its lineup with each player's multiplied points. The commissioner,
 * setting another entry's lineup, can change any round so far.
 */
async function PfWeeklyPicks({
  ctx, slug, settings, players, teams, entry, locked, behalf, target, round, head,
}: {
  ctx: PoolBase; slug: string; settings: PfSettings; players: PfPlayer[]; teams: PfTeam[]; entry: PfEntry; locked: boolean;
  behalf: boolean; target: string; round?: number; head: (sub?: ReactNode) => ReactNode;
}) {
  const tz = tzOf(ctx);
  const games: PlayoffGame[] = await getPfGames(ctx.pool.season, players, teams, settings.demo_sim);
  const pts = locked ? await getPfPoints(ctx.pool.season, settings.scoring, players, teams, settings.demo_sim) : NO_POINTS;
  const now = Date.now(); // eslint-disable-line react-hooks/purity -- render-time snapshot of the locks
  const mode = settings.weekly_lock;
  const [row] = weeklyView([entry], players, teams, pts, games, { now, mode, full: () => true });
  const cur = currentRound(games);
  const r = Math.max(0, Math.min(cur, Number.isInteger(round) ? round! : cur));
  const editable = behalf || roundOpen(games, r, now, mode);
  const espnOf = new Map(teams.map((t) => [t.id, t.espnId ?? ""]));
  const lost = lostIn(games);
  const wp = (p: PfPlayer) => ({ id: p.id, pos: p.pos, team: espnOf.get(p.teamId) ?? "" });
  // The round's teams: those still in it (a Wild Card bye counts; later rounds, the teams with a game).
  const playing = teams.filter((t) => aliveAt(lost, t.espnId ?? "", r) && (r === 0 || teamGame(games, r, t.espnId ?? "")));
  const lockedIds = behalf ? [] : players.filter((p) => playerLocked(wp(p), r, games, now, mode)).map((p) => p.id);
  // Each player's multiplier this round if he's in the lineup: 1 + the rounds in a row just before it.
  const before = row.lineups.slice(0, r);
  const mult: Record<string, number> = {};
  for (const p of players) {
    let n = 1;
    for (let k = before.length - 1; k >= 0 && before[k].includes(p.id) && n < 4; k--) n++;
    if (n > 1) mult[p.id] = n;
  }
  const ks = roundKicks(games, r);
  const lockText =
    mode === "player"
      ? "Each player locks at his kickoff"
      : ks
        ? `Locks ${lockLabel(new Date(ks.first).toISOString(), tz)}`
        : settings.lock_at && r === 0
          ? `Locks ${lockLabel(settings.lock_at, tz)}`
          : "Locks at the round's first kickoff";
  const link = (i: number) => `/p/${slug}/picks?week=${i}${behalf ? `&for=${target}` : ""}`;
  const chips = (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {Array.from({ length: cur + 1 }, (_, i) => (
        <Link key={i} href={link(i)} scroll={false} className={chipClass(i === r, "cursor-pointer", "sm")}>
          {ROUNDS[i].name}
          {pts.roundsStarted > i && <span className="ml-1 tabular-nums opacity-70">{fmt(row.rounds[i])}</span>}
        </Link>
      ))}
      {Array.from({ length: WEEKLY_ROUNDS - cur - 1 }, (_, j) => (
        <span key={`n${j}`} className={chipClass(false, "cursor-default opacity-40", "sm")} title="Opens when the round before it is over">{ROUNDS[cur + 1 + j].name}</span>
      ))}
      <span className="ml-auto text-sm text-muted tabular-nums">
        Total <span className="font-extrabold text-ink">{fmt(row.points)}</span>
      </span>
    </div>
  );

  if (!editable) {
    return (
      <>
        {head()}
        {pts.live && <AutoRefresh active />}
        {chips}
        <section className="sm:max-w-xl">
          <PfWeeklyRounds row={row} players={players} teams={teams} pts={pts} rounds={[r]} />
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <ScoringInfo settings={settings} /> {r < cur ? "This round is over." : "This round's lineup has locked."} A player&apos;s points are multiplied by the rounds in a row he&apos;s been in the lineup.
          </p>
        </section>
      </>
    );
  }

  const [stats, injuries, opponents] = await Promise.all([getPfSeasonStats(ctx.pool.season, players, settings.scoring, teams), getPfInjuries(teams), opponentsFor(ctx.pool.season, games, playing, r, settings.demo_seeds, teams)]);
  return (
    <>
      <h1 className="sr-only">My Team</h1>
      {head()}
      {chips}
      {ctx.isGuest ? (
        <Empty>Guests can&apos;t set a lineup.</Empty>
      ) : (
        <PfLineupBuilder
          key={r}
          players={players}
          stats={stats}
          injuries={injuries}
          teams={playing}
          roster={settings.roster}
          flex={settings.flex}
          initial={row.lineups[r] ?? []}
          save={savePfWeekly.bind(null, slug, behalf ? target : null, r)}
          forName={behalf ? entry.name : undefined}
          title={`${ROUNDS[r].name} Lineup`}
          lockText={lockText}
          scoringInfo={<ScoringInfo settings={settings} />}
          timezone={tz}
          oneTeam={false}
          lockedIds={lockedIds}
          mult={mult}
          opponents={opponents}
        />
      )}
    </>
  );
}

/**
 * Standings, laid out like the golf pools': every entry's full lineup as a card across the
 * screen on desktop (as many columns as fit), a list to tap open on phones. Each card: place,
 * name and points, then its players by position with their points (a player whose team is out
 * is crossed out). No lineup shows until lineups lock (your own is on My Team).
 */
export async function PfStandingsPage({ ctx, slug }: { ctx: PoolBase; slug: string }) {
  const { settings, teams, players, entries, locked } = await getPf(ctx);
  const { games, pts, rows, weekly } = await standingsFor(ctx, settings, players, teams, entries, locked);
  const standingsTicker = playoffTicker(games);
  const me = ctx.entryUserId;
  const tz = tzOf(ctx);
  const own = locked ? ownership(entries) : null;
  const started = pts.roundsStarted;
  // Place | Entry | the four rounds (from sm) | Total | the open/close arrow.
  const grid = "grid grid-cols-[2rem_minmax(0,1fr)_4.5rem_1.25rem] sm:grid-cols-[2.5rem_minmax(0,1fr)_repeat(4,4.25rem)_5rem_1.25rem] items-center gap-x-2";
  const round = (r: PfRow, i: number) => (i >= started ? "–" : fmt(r.rounds[i]));

  return (
    <div data-wide>
      {pts.live && <AutoRefresh active />}
      {weekly ? (
        <LockReminder ctx={ctx} slug={slug} settings={settings} entries={rows} locked={!weekly.open} lockAt={weekly.nextLock} />
      ) : (
        <LockReminder ctx={ctx} slug={slug} settings={settings} entries={entries} locked={locked} />
      )}
      <PoolPageHeader title={<span className="inline-flex items-center gap-2">Standings <ScoringInfo settings={settings} /></span>} games={standingsTicker.games} now={Date.now() /* eslint-disable-line react-hooks/purity */} timezone={tz} />
      {rows.length === 0 ? (
        <Empty>No entries yet.</Empty>
      ) : (
        <section className="max-w-4xl">
          <div className="mb-2 flex items-center gap-3">
            <FitText min={8} className="min-w-0 flex-1 text-xs text-muted">
              {!locked
                ? "Lineups show here once they lock."
                : weekly
                  ? settings.weekly_lock === "player"
                    ? "Tap an entry for its lineups. Players show as their games kick off."
                    : "Tap an entry for its lineups, round by round."
                  : "Tap an entry to see its lineup, and a player for his game stats."}
            </FitText>
            {locked && <ExpandAll target="pf-standings" />}
          </div>
          <div className={`${grid} border-b border-line px-2 py-1.5 text-[11px] font-bold tracking-wide text-muted uppercase`}>
            <span>#</span>
            <span>Entry</span>
            {ROUNDS.map((r) => (
              <span key={r.short} className="hidden text-right sm:block">{r.short}</span>
            ))}
            <span className="text-right">Total</span>
            <span />
          </div>
          {/* Every entry one row; open it for the full lineup (the same table as My Team). */}
          <div id="pf-standings">
            {rows.map((r) => (
              <details key={r.userId} className={`group border-b border-line ${r.userId === me ? "bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]" : ""}`}>
                <summary className={`${grid} cursor-pointer list-none px-2 py-2 text-sm hover:bg-surface [&::-webkit-details-marker]:hidden`}>
                  <span className="tabular-nums text-muted">{locked ? r.rank : ""}</span>
                  <FitText min={10} className={`font-semibold ${r.userId === me ? "text-accent" : ""}`}>{r.name}</FitText>
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className={`hidden text-right tabular-nums sm:block ${i >= started ? "text-muted" : ""}`}>{round(r, i)}</span>
                  ))}
                  <span className="text-right font-bold tabular-nums">{fmt(r.points)}</span>
                  <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="size-4 justify-self-end text-muted transition-transform group-open:rotate-180">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
                  </svg>
                </summary>
                <div className="px-2 pb-3 sm:pl-12">
                  {!locked ? (
                    <p className="py-1.5 text-xs text-muted">Shows when lineups lock.</p>
                  ) : weekly && "lineups" in r ? (
                    <div className="pt-1">
                      <PfWeeklyRounds row={r} players={players} teams={teams} pts={pts} rounds={Array.from({ length: weekly.cur + 1 }, (_, i) => i)} hidden={r.userId !== me && !ctx.isCommissioner} compact />
                    </div>
                  ) : !r.playerIds.length ? (
                    <p className="py-1.5 text-xs text-muted">No lineup set.</p>
                  ) : (
                    <>
                      <p className="pb-1 text-[11px] tabular-nums text-muted">{r.alive} of {r.playerIds.length} still playing</p>
                      <PfRosterTable rows={rosterRows(r.playerIds, players, teams, pts, own)} roundTotals={r.rounds} started={started} compact />
                    </>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** The perfect lineup in the pool's lineup order: each position's spots (best first), then any
 *  running backs, receivers and tight ends past their spots as FLEX, then kicker and defense. */
function perfectSlots(list: PfPlayer[], ptsOf: (id: string) => number, roster: Record<string, number>) {
  const order = ["QB", "RB", "WR", "TE", "FLEX", "K", "DEF"];
  const out: { p: PfPlayer; slot: string }[] = [];
  for (const pos of POSITIONS) {
    const at = list.filter((p) => p.pos === pos).sort((a, b) => ptsOf(b.id) - ptsOf(a.id));
    at.forEach((p, i) => out.push({ p, slot: i < (roster[pos] ?? 0) ? pos : "FLEX" }));
  }
  return out.sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot) || ptsOf(b.p.id) - ptsOf(a.p.id));
}

/** Pool Summary: two tabs, Ownership % (every rostered player, by position, sortable) and Top Players (each position's most rostered and highest scoring, and the perfect lineup). */
export async function PfSummaryPage({ ctx, slug }: { ctx: PoolBase; slug: string }) {
  const { settings, teams, players, entries, locked } = await getPf(ctx);
  // Weekly style: ownership is of the current round's lineups (as far as they've locked).
  const { games, pts, rows } = await standingsFor(ctx, settings, players, teams, entries, locked);
  const ticker = playoffTicker(games);
  const started = pts.roundsStarted > 0;
  const teamOf = new Map(teams.map((t) => [t.id, t]));
  const ptsOf = (id: string) => pts.byPlayer.get(id)?.total ?? 0;
  const positions = POSITIONS.filter((p) => settings.roster[p] > 0);

  // After the lock: how many lineups have each player.
  const counts = new Map<string, number>();
  if (locked) for (const r of rows) for (const id of new Set(r.playerIds)) counts.set(id, (counts.get(id) ?? 0) + 1);
  const lineups = rows.filter((r) => r.playerIds.length > 0).length;
  const sum = (p: PfPlayer): SumPlayer => {
    const t = teamOf.get(p.teamId);
    const count = counts.get(p.id) ?? 0;
    return { id: p.id, name: p.name, pos: p.pos, team: t?.abbreviation ?? null, logo: t?.logo_url ?? null, out: pts.out.has(t?.espnId ?? ""), count, own: Math.round((count / Math.max(1, lineups)) * 1000) / 10, points: ptsOf(p.id) };
  };
  const owned = players.filter((p) => counts.has(p.id)).map(sum);

  // Highest scoring: playoff points once games start; before that the regular season under the
  // pool's scoring, with the stat line.
  const stats = started ? {} : await getPfSeasonStats(ctx.pool.season, players, settings.scoring, teams);
  const TOP = 3;
  const groups: SumGroup[] = positions.map((pos) => {
    const at = players.filter((p) => p.pos === pos);
    return {
      pos,
      name: `${POSITION_NAME[pos]}s`,
      rostered: at
        .filter((p) => counts.has(p.id))
        .sort((a, b) => counts.get(b.id)! - counts.get(a.id)! || ptsOf(b.id) - ptsOf(a.id) || a.name.localeCompare(b.name))
        .slice(0, TOP)
        .map((p) => { const x = sum(p); return { p: x, value: `${x.own.toFixed(1)}%` }; }),
      scoring: started
        ? at.filter((p) => ptsOf(p.id) > 0).sort((a, b) => ptsOf(b.id) - ptsOf(a.id)).slice(0, TOP).map((p) => ({ p: sum(p), value: fmt(ptsOf(p.id)) }))
        : at
            .filter((p) => (stats[p.id]?.fp ?? 0) > 0)
            .sort((a, b) => stats[b.id].fp - stats[a.id].fp)
            .slice(0, TOP)
            .map((p) => ({ p: sum(p), value: fmt(stats[p.id].fp), sub: stats[p.id].line || null })),
    };
  });

  // The perfect lineup, once games start.
  // Weekly style has no team limit: simply each position's top scorers.
  const perfect = !started
    ? null
    : settings.style === "weekly"
      ? (() => {
          const ids = positions.flatMap((pos) => players.filter((p) => p.pos === pos && ptsOf(p.id) > 0).sort((a, b) => ptsOf(b.id) - ptsOf(a.id)).slice(0, settings.roster[pos]).map((p) => p.id));
          // Then the flex spots: the best running backs, receivers and tight ends left.
          ids.push(...players.filter((p) => FLEX_POS.includes(p.pos) && !ids.includes(p.id) && ptsOf(p.id) > 0).sort((a, b) => ptsOf(b.id) - ptsOf(a.id)).slice(0, settings.flex).map((p) => p.id));
          return { ids, total: Math.round(ids.reduce((t, id) => t + ptsOf(id), 0) * 100) / 100 };
        })()
      : optimalLineup(players, ptsOf, settings.roster, settings.flex);
  const best = rows[0];
  const playerOf = new Map(players.map((p) => [p.id, p]));
  const perfectNode =
    perfect && perfect.ids.length > 0 ? (
      <section className="max-w-xl">
        <div className="flex items-baseline justify-between gap-3 border-b-2 border-line pb-1">
          <SectionLabel fit className="!text-sm lg:!text-base">Perfect Lineup</SectionLabel>
          <span className="shrink-0 text-sm font-extrabold tabular-nums">{fmt(perfect.total)}</span>
        </div>
        {best && best.points > 0 && (
          <FitText min={9} className="mt-1 block text-xs text-muted tabular-nums">
            Best entry: {best.name}, {fmt(best.points)} ({Math.round((best.points / perfect.total) * 100)}%)
          </FitText>
        )}
        <ul className="mt-1 divide-y divide-line">
          {perfectSlots(perfect.ids.map((id) => playerOf.get(id)!), ptsOf, settings.roster)
            .map(({ p, slot }) => {
              const t = teamOf.get(p.teamId);
              return (
                <li key={p.id} className="flex h-8 items-center gap-1.5 text-[13px]">
                  <span className="w-8 shrink-0 text-[10px] font-bold text-muted">{slot}</span>
                  <TeamLogo src={t?.logo_url} abbr={t?.abbreviation} className="size-4 shrink-0" />
                  <FitText min={10} className="min-w-0 flex-1 font-medium">{p.name}</FitText>
                  <span className="shrink-0 font-semibold tabular-nums">{fmt(ptsOf(p.id))}</span>
                </li>
              );
            })}
        </ul>
      </section>
    ) : null;

  return (
    <div data-wide>
      {pts.live && <AutoRefresh active />}
      <LockReminder ctx={ctx} slug={slug} settings={settings} entries={entries} locked={locked} />
      <PoolPageHeader title="Pool Summary" games={ticker.games} now={Date.now() /* eslint-disable-line react-hooks/purity */} timezone={tzOf(ctx)} />
      {players.length === 0 ? (
        <Empty>{NOT_READY}</Empty>
      ) : (
        <PfSummaryTabs owned={owned} groups={groups} positions={positions} lineups={lineups} locked={locked} started={started} perfect={perfectNode} />
      )}
    </div>
  );
}
