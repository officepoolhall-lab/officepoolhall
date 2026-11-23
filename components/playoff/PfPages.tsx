import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Empty, PageTitle, SectionLabel, TeamLogo, chipClass } from "@/components/ui";
import { Suspense } from "react";
import { Countdown } from "@/components/Countdown";
import { FitText } from "@/components/FitText";
import { FillColumn } from "@/components/FillColumn";
import { savePfLineup } from "@/app/p/[slug]/formats/actions";
import type { PoolBase } from "@/lib/pool";
import { POSITIONS, ROUNDS, optimalLineup, rosterSize, type Position } from "@/lib/playoffFantasy";
import type { ReactNode } from "react";
import { getPlayoffGames, getPlayoffPicture } from "@/lib/nflPlayoffs";
import { NO_POINTS, getPf, getPfPoints, getPfInjuries, getPfSeasonStats, pfStandings, type PfPlayer, type PfPoints, type PfRow, type PfTeam } from "@/lib/playoffFantasyData";
import { PfLineupBuilder } from "./PfLineupBuilder";
import { PfBracket } from "./PfBracket";

// The pages of an NFL Playoff Fantasy pool: Home, My Team and Standings. The pool routes reach
// these when settings.format is "playoff_fantasy".

const card = "rounded-2xl bg-surface p-4 sm:p-5";
const tzOf = (ctx: PoolBase) => ((ctx.pool.settings as { timezone?: string } | null)?.timezone ?? "America/Chicago");
const lockLabel = (iso: string, tz: string) => formatInTimeZone(iso, tz, "EEE, MMM d · h:mm a");
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

/** One entry's roster, position by position, with each player's points and whether his team is still in. */
function RosterTable({ ids, players, teams, pts }: { ids: string[]; players: PfPlayer[]; teams: PfTeam[]; pts: PfPoints }) {
  const playerOf = new Map(players.map((p) => [p.id, p]));
  const teamOf = new Map(teams.map((t) => [t.id, t]));
  const mine = ids.map((id) => playerOf.get(id)).filter((p): p is PfPlayer => Boolean(p));
  const order = (p: PfPlayer) => POSITIONS.indexOf(p.pos);
  return (
    <ul className="divide-y divide-line">
      {[...mine].sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name)).map((p) => {
        const team = teamOf.get(p.teamId);
        const out = pts.out.has(team?.espnId ?? "");
        const score = pts.byPlayer.get(p.id);
        return (
          <li key={p.id} className={`flex items-center gap-2 py-2 text-sm ${out ? "opacity-50" : ""}`}>
            <span className="w-8 shrink-0 text-center text-[11px] font-bold text-muted">{p.pos}</span>
            <TeamLogo src={team?.logo_url} abbr={team?.abbreviation} className="size-5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              <span className={`font-semibold ${out ? "line-through" : ""}`}>{p.name}</span>
              <span className="ml-1.5 text-xs text-muted">{team?.abbreviation}{out ? " · out" : ""}</span>
            </span>
            {pts.roundsStarted > 1 && (
              <span className="hidden text-xs tabular-nums text-muted sm:inline">
                {ROUNDS.slice(0, pts.roundsStarted).map((r, i) => `${r.short} ${fmt(score?.rounds[i] ?? 0)}`).join(" · ")}
              </span>
            )}
            <span className="w-14 shrink-0 text-right font-bold tabular-nums">{fmt(score?.total ?? 0)}</span>
          </li>
        );
      })}
    </ul>
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
  const pts = locked ? await getPfPoints(ctx.pool.season, settings.scoring, players, teams) : NO_POINTS;
  const rows = pfStandings(entries, players, teams, pts);
  const mine = ctx.isGuest ? undefined : rows.find((r) => r.userId === ctx.entryUserId);
  const mineAt = mine ? rows.indexOf(mine) : -1;
  const size = rosterSize(settings);
  // The Wild Card matchups (as the standings stand today until the season is over).
  const [picture, games] = await Promise.all([getPlayoffPicture(ctx.pool.season).catch(() => null), getPlayoffGames(ctx.pool.season).catch(() => [])]);
  const fieldSet = games.filter((g) => g.round === 0).length >= 6;
  // eslint-disable-next-line react-hooks/purity -- render-time snapshot; the countdown ticks client-side
  const now = Date.now();
  const teamsLeft = teams.filter((t) => !pts.out.has(t.espnId ?? "")).length;
  const stat = "mt-0.5 text-4xl font-extrabold tracking-[-0.03em] tabular-nums";

  return (
    <div data-wide className="space-y-6">
      {pts.live && <AutoRefresh active />}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_minmax(0,17rem)] xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)_minmax(0,20rem)] 2xl:grid-cols-[minmax(0,23.5rem)_minmax(0,1fr)_minmax(0,23.5rem)] lg:gap-x-0 lg:divide-x lg:divide-[color-mix(in_srgb,var(--accent)_35%,transparent)]">
        {/* The playoffs and where everyone stands. */}
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
                      <FitText min={9} className="text-xs text-muted">{locked ? "My Points" : "My Roster"}</FitText>
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
                    <FitText min={9} className="text-xs text-muted">{locked ? "Still Playing" : "Rosters Lock"}</FitText>
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
                {!locked && settings.lock_at && <p className="mt-1 text-xs text-muted">{lockLabel(settings.lock_at, tzOf(ctx))}</p>}
                {!locked && !ctx.isGuest && mine && mine.playerIds.length < size && (
                  <Link
                    href={`/p/${slug}/picks`}
                    className="mt-3 flex h-10 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 text-[15px] font-semibold text-white shadow-sm transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:brightness-95"
                  >
                    <span className="whitespace-nowrap">
                      {mine.playerIds.length ? "Finish my roster" : "Build my roster"} <span aria-hidden>→</span>
                    </span>
                  </Link>
                )}
                <div className="mt-3 flex gap-1.5 whitespace-nowrap">
                  {!ctx.isGuest && <Link href={`/p/${slug}/picks`} className={chipClass(true, "", "sm")}>My Team</Link>}
                  <Link href={`/p/${slug}/standings`} className={chipClass(ctx.isGuest, "", "sm")}>Standings</Link>
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
        <div className="order-last lg:order-none lg:px-6">
          {picture ? (
            <PfBracket picture={picture} games={games} out={pts.out} projected={!fieldSet} />
          ) : (
            <Empty>The bracket shows here once ESPN&apos;s standings can be read.</Empty>
          )}
        </div>

        {/* The pool's numbers. */}
        <div className="space-y-6 lg:pl-6">
          <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
            <PfSummary season={ctx.pool.season} players={players} teams={teams} rows={rows} pts={pts} locked={locked} roster={settings.roster} />
          </Suspense>
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
      <span className={`min-w-0 flex-1 truncate ${me ? "font-semibold text-accent" : "font-medium"}`}>{r.name}</span>
      {/* Just the points (0 until the games start). */}
      <span className="w-12 shrink-0 pr-1 text-right font-bold tabular-nums">{fmt(r.points)}</span>
    </li>
  );
}

/**
 * Home's Pool Summary. Before the games: each position's top regular-season producers among the
 * playoff players (to help build a lineup). Once they start: the top scorer at each position and
 * the perfect lineup so far (against the best entry). After the lock: the most rostered players.
 * Never who has or hasn't entered a lineup.
 */
async function PfSummary({ season, players, teams, rows, pts, locked, roster }: { season: number; players: PfPlayer[]; teams: PfTeam[]; rows: PfRow[]; pts: PfPoints; locked: boolean; roster: Record<Position, number> }) {
  const playerOf = new Map(players.map((p) => [p.id, p]));
  const teamOf = new Map(teams.map((t) => [t.id, t]));
  const started = pts.roundsStarted > 0;
  const ptsOf = (id: string) => pts.byPlayer.get(id)?.total ?? 0;
  const row = "flex items-center gap-2 py-1.5 text-sm";
  const label = "!text-sm lg:!text-base";
  const who = (p: PfPlayer, right: ReactNode, sub?: string | null) => {
    const t = teamOf.get(p.teamId);
    return (
      <li key={p.id} className={row}>
        <span className="w-8 shrink-0 text-[11px] font-bold text-muted">{p.pos}</span>
        <TeamLogo src={t?.logo_url} abbr={t?.abbreviation} className="size-5 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{p.name}</span>
          {sub && <span className="block truncate text-[11px] tabular-nums text-muted">{sub}</span>}
        </span>
        <span className="shrink-0 font-semibold tabular-nums">{right}</span>
      </li>
    );
  };

  // Before the games: the regular season's leaders, two at each skill position.
  const stats = started ? {} : await getPfSeasonStats(season, players);
  const producers = (["QB", "RB", "WR", "TE"] as const).flatMap((pos) =>
    players
      .filter((p) => p.pos === pos && stats[p.id])
      .sort((a, b) => stats[b.id].vol - stats[a.id].vol)
      .slice(0, 2),
  );

  // Once they start: each position's top scorer, and the perfect lineup.
  const leaders = started
    ? POSITIONS.filter((p) => roster[p] > 0).flatMap((pos) => {
        const top = players.filter((p) => p.pos === pos && ptsOf(p.id) > 0).sort((a, b) => ptsOf(b.id) - ptsOf(a.id))[0];
        return top ? [top] : [];
      })
    : [];
  const perfect = started ? optimalLineup(players, ptsOf, roster) : null;
  const bestEntry = rows[0];

  // After the lock: the most rostered.
  const counts = new Map<string, number>();
  if (locked) for (const r of rows) for (const id of r.playerIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  // The two most rostered at each position.
  const popular = POSITIONS.filter((p) => roster[p] > 0).flatMap((pos) =>
    [...counts.entries()]
      .filter(([id]) => playerOf.get(id)?.pos === pos)
      .sort((a, b) => b[1] - a[1] || playerOf.get(a[0])!.name.localeCompare(playerOf.get(b[0])!.name))
      .slice(0, 2),
  );

  return (
    <>
      <SectionLabel fit className={label}>Pool Summary</SectionLabel>
      {!started && producers.length > 0 && (
        <section className="-mt-4">
          <h3 className="mt-2 text-xs font-semibold text-muted">Top regular-season producers</h3>
          <ul className="mt-1 divide-y divide-line">{producers.map((p) => who(p, null, stats[p.id].line))}</ul>
        </section>
      )}
      {leaders.length > 0 && (
        <section className="-mt-4">
          <h3 className="mt-2 text-xs font-semibold text-muted">Top scorers by position</h3>
          <ul className="mt-1 divide-y divide-line">{leaders.map((p) => who(p, fmt(ptsOf(p.id))))}</ul>
        </section>
      )}
      {perfect && perfect.ids.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between gap-3">
            <SectionLabel fit className={label}>Perfect Lineup</SectionLabel>
            <span className="shrink-0 text-sm font-extrabold tabular-nums">{fmt(perfect.total)}</span>
          </div>
          {bestEntry && bestEntry.points > 0 && (
            <p className="mt-0.5 text-xs text-muted tabular-nums">
              Best entry: {bestEntry.name}, {fmt(bestEntry.points)} ({Math.round((bestEntry.points / perfect.total) * 100)}%)
            </p>
          )}
          <ul className="mt-1 divide-y divide-line">
            {perfect.ids
              .map((id) => playerOf.get(id)!)
              .sort((a, b) => POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) || ptsOf(b.id) - ptsOf(a.id))
              .map((p) => who(p, fmt(ptsOf(p.id))))}
          </ul>
        </section>
      )}
      {popular.length > 0 && (
        <section>
          <SectionLabel fit className={label}>Most Rostered</SectionLabel>
          <ul className="mt-1 divide-y divide-line">{popular.map(([id, n]) => who(playerOf.get(id)!, `${Math.round((n / Math.max(1, rows.length)) * 100)}%`))}</ul>
        </section>
      )}
      {!started && !producers.length && !popular.length && <p className="-mt-4 text-sm text-muted">Top scorers and the perfect lineup show here once the Wild Card round starts.</p>}
    </>
  );
}

export async function PfPicksPage({ ctx, slug, forUserId }: { ctx: PoolBase; slug: string; forUserId?: string }) {
  const { settings, teams, players, entries, locked } = await getPf(ctx);
  const tz = tzOf(ctx);
  const behalf = Boolean(forUserId && ctx.isCommissioner && forUserId !== ctx.user.id);
  const target = behalf ? forUserId! : ctx.entryUserId;
  const entry = entries.find((e) => e.userId === target);
  const title = behalf && entry ? <>Roster <span className="text-accent">for {entry.name}</span></> : "My Team";
  if (players.length === 0) return (<><PageTitle>{title}</PageTitle><Empty>{NOT_READY}</Empty></>);
  if (!entry) return (<><PageTitle>{title}</PageTitle><Empty>{ctx.isGuest ? "Guests can't build a roster." : "This entry isn't playing."}</Empty></>);

  if (locked && !behalf) {
    const pts = await getPfPoints(ctx.pool.season, settings.scoring, players, teams);
    const row = pfStandings([entry], players, teams, pts)[0];
    return (
      <>
        <PageTitle sub={`Rosters locked ${lockLabel(settings.lock_at!, tz)}.`}>{title}</PageTitle>
        {pts.live && <AutoRefresh active />}
        {entry.playerIds.length === 0 ? (
          <Empty>No roster was set for this entry.</Empty>
        ) : (
          <div className={card}>
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-bold">Your players</h2>
              <span className="text-lg font-bold tabular-nums">{fmt(row.points)} pts</span>
            </div>
            <RosterTable ids={entry.playerIds} players={players} teams={teams} pts={pts} />
          </div>
        )}
      </>
    );
  }

  const [stats, injuries] = await Promise.all([getPfSeasonStats(ctx.pool.season, players), getPfInjuries(teams)]);
  return (
    <>
      <h1 className="sr-only">{title}</h1>
      {ctx.isGuest ? (
        <Empty>Guests can&apos;t build a roster.</Empty>
      ) : (
        <PfLineupBuilder
          players={players}
          stats={stats}
          injuries={injuries}
          teams={teams}
          roster={settings.roster}
          initial={entry.playerIds}
          save={savePfLineup.bind(null, slug, behalf ? target : null)}
          forName={behalf ? entry.name : undefined}
          lockText={settings.lock_at ? `Locks ${lockLabel(settings.lock_at, tz)}` : "Locks at the first Wild Card kickoff"}
          timezone={tz}
        />
      )}
    </>
  );
}

/**
 * Standings, laid out like the golf pools': every entry's full lineup as a card across the
 * screen on desktop (as many columns as fit), a list to tap open on phones. Each card: place,
 * name and points, then its players by position with their points (a player whose team is out
 * is crossed out). Other entries' lineups show once lineups lock (the commissioner sees them all).
 */
export async function PfStandingsPage({ ctx, slug }: { ctx: PoolBase; slug: string }) {
  const { settings, teams, players, entries, locked } = await getPf(ctx);
  const pts = locked ? await getPfPoints(ctx.pool.season, settings.scoring, players, teams) : NO_POINTS;
  const rows = pfStandings(entries, players, teams, pts);
  const me = ctx.entryUserId;
  const tz = tzOf(ctx);
  const playerOf = new Map(players.map((p) => [p.id, p]));
  const teamOf = new Map(teams.map((t) => [t.id, t]));
  const ptsOf = (id: string) => pts.byPlayer.get(id)?.total ?? 0;
  const lineup = (r: PfRow) =>
    r.playerIds
      .map((id) => playerOf.get(id))
      .filter((p): p is PfPlayer => Boolean(p))
      .sort((a, b) => POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) || ptsOf(b.id) - ptsOf(a.id) || a.name.localeCompare(b.name));
  // The narrowest card that shows everything: position, logo, points and gaps (about 7rem) plus
  // the longest player name at 13px (~0.45rem a letter), or the entry's name along the top.
  const longestPlayer = Math.max(0, ...rows.flatMap((r) => lineup(r).map((p) => p.name.length)));
  const longestEntry = Math.max(0, ...rows.map((r) => r.name.length));
  const cardRem = Math.max(14, Math.ceil(Math.max(7.5 + longestPlayer * 0.45, 5.5 + longestEntry * 0.52) * 2) / 2);
  const hidden = !locked && !ctx.isCommissioner;

  const Players = ({ r }: { r: PfRow }) => {
    const list = lineup(r);
    if (!list.length) return <p className="py-1.5 text-xs text-muted">{r.userId === me || !hidden ? "No lineup yet." : "Shows when lineups lock."}</p>;
    return (
      <ul className="mt-1">
        {list.map((p) => {
          const t = teamOf.get(p.teamId);
          const out = pts.out.has(t?.espnId ?? "");
          return (
            <li key={p.id} className={`flex h-6 items-center gap-1.5 text-[13px] ${out ? "text-muted" : "text-ink"}`}>
              <span className="w-7 shrink-0 text-[10px] font-bold text-muted">{p.pos}</span>
              <TeamLogo src={t?.logo_url} abbr={t?.abbreviation} className="size-4 shrink-0" />
              <span className={`min-w-0 flex-1 truncate ${out ? "line-through decoration-1" : ""}`}>{p.name}</span>
              <span className="shrink-0 tabular-nums">{fmt(ptsOf(p.id))}</span>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div data-wide>
      {pts.live && <AutoRefresh active />}
      <PageTitle
        sub={
          locked
            ? `Total fantasy points, Wild Card round through the Super Bowl${pts.live ? " · Live" : ""}.`
            : `Lineups show here once they lock${settings.lock_at ? `, ${lockLabel(settings.lock_at, tz)}` : ""}.`
        }
      >
        Standings
      </PageTitle>
      {rows.length === 0 ? (
        <Empty>No entries yet.</Empty>
      ) : (
        <>
          {/* Desktop: every entry's lineup as a card, as many across as fit. */}
          <ol className="hidden gap-2 lg:grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${cardRem}rem), 1fr))` }}>
            {rows.map((r) => (
              <li key={r.userId} className={`rounded-lg border px-2.5 py-2 ${r.userId === me ? "border-accent bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]" : "border-line"}`}>
                <div className="flex items-baseline gap-1.5 border-b border-line pb-1 text-sm">
                  <span className="w-5 shrink-0 tabular-nums text-muted">{locked ? r.rank : ""}</span>
                  <FitText min={11} className={`flex-1 font-semibold ${r.userId === me ? "text-accent" : ""}`}>{r.name}</FitText>
                  <span className="shrink-0 font-bold tabular-nums">{fmt(r.points)}</span>
                </div>
                {locked && pts.roundsStarted > 0 && <p className="mt-0.5 text-[11px] tabular-nums text-muted">{r.alive} of {r.playerIds.length} still playing</p>}
                <Players r={r} />
                {ctx.isCommissioner && (
                  <Link href={`/p/${slug}/picks?for=${r.userId}`} className="-mx-1 mt-1 inline-block rounded-md px-1 text-[11px] font-semibold text-accent transition hover:bg-hover">
                    Edit lineup
                  </Link>
                )}
              </li>
            ))}
          </ol>

          {/* Phones and tablets: a list; tap an entry to see its lineup. */}
          <div className="border-t border-line lg:hidden">
            {rows.map((r) => (
              <details key={r.userId} className={`group border-b border-line ${r.userId === me ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : ""}`}>
                <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-2 text-sm hover:bg-surface [&::-webkit-details-marker]:hidden">
                  <span className="w-7 shrink-0 tabular-nums text-muted">{locked ? r.rank : ""}</span>
                  <span className={`min-w-0 flex-1 truncate font-medium ${r.userId === me ? "text-accent" : ""}`}>{r.name}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{fmt(r.points)}</span>
                  <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
                  </svg>
                </summary>
                <div className="px-2 pb-3 pl-11">
                  <Players r={r} />
                  {ctx.isCommissioner && (
                    <Link href={`/p/${slug}/picks?for=${r.userId}`} className="-mx-1 mt-1 inline-block rounded-md px-1 text-xs font-semibold text-accent transition hover:bg-hover">
                      Edit lineup
                    </Link>
                  )}
                </div>
              </details>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
