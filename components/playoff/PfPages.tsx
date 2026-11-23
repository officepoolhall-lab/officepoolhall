import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Empty, PageTitle, SectionLabel, TeamLogo, chipClass } from "@/components/ui";
import { Suspense } from "react";
import { Countdown } from "@/components/Countdown";
import { FitText } from "@/components/FitText";
import { FillColumn } from "@/components/FillColumn";
import { NewsList } from "@/components/NewsList";
import { getNews } from "@/lib/news";
import { NEWS_TITLE } from "@/lib/sports";
import { createAdminClient } from "@/lib/supabase/admin";
import { savePfLineup } from "@/app/p/[slug]/formats/actions";
import type { PoolBase } from "@/lib/pool";
import { POSITIONS, ROUNDS, recLabel, rosterSize, type PfSettings } from "@/lib/playoffFantasy";
import { NO_POINTS, getPf, getPfPoints, pfStandings, type PfPlayer, type PfPoints, type PfRow, type PfTeam } from "@/lib/playoffFantasyData";
import { PfLineupBuilder } from "./PfLineupBuilder";

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

function StandingsList({ rows, me, locked, size, limit, progress = false }: { rows: PfRow[]; me: string; locked: boolean; size: number; limit?: number; /** Before the lock: show how far along every roster is (the commissioner); players see only their own. */ progress?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {(limit ? rows.slice(0, limit) : rows).map((r) => (
        <li key={r.userId} className={`flex items-center gap-3 py-2.5 ${r.userId === me ? "-mx-2 rounded-xl bg-accent/10 px-2" : ""}`}>
          <span className="w-7 text-right text-sm tabular-nums text-muted">{locked ? r.rank : ""}</span>
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{r.name}</span>
          {locked ? (
            <>
              <span className="hidden text-xs text-muted tabular-nums sm:inline">{r.alive} still playing</span>
              <span className="w-16 text-right text-[15px] font-bold tabular-nums">{fmt(r.points)}</span>
            </>
          ) : progress || r.userId === me ? (
            <span className={`text-sm font-semibold tabular-nums ${r.playerIds.length >= size ? "text-win" : "text-muted"}`}>
              {r.playerIds.length >= size ? "Roster in" : `${r.playerIds.length}/${size}`}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

const NOT_READY = "Rosters open as soon as the playoff field is set, at the end of the regular season. The 14 teams and their players load here by themselves.";

/** The rules in a sentence or two (Home's Pool Rules). */
function rulesSummary(s: PfSettings): string {
  const spots = POSITIONS.filter((p) => s.roster[p] > 0)
    .map((p) => (s.roster[p] === 1 ? (p === "DEF" ? "a defense" : `a ${p}`) : `${s.roster[p]} ${p}s`))
    .join(", ");
  return `Pick one player from each playoff team: ${spots}. Everyone scores every round until his team is out, ${recLabel(s.scoring.rec)} scoring, and the most points wins.`;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 })}`;

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
  const size = rosterSize(settings);
  // eslint-disable-next-line react-hooks/purity -- render-time snapshot; the countdown ticks client-side
  const now = Date.now();
  // Rosters in: counted for everyone (others' lineups stay hidden until the lock).
  const { data: lineupSizes } = await (createAdminClient() as unknown as { from: (t: string) => any }) // eslint-disable-line @typescript-eslint/no-explicit-any
    .from("pf_lineups")
    .select("user_id, player_ids")
    .eq("pool_id", ctx.pool.id);
  const inIds = new Set(entries.map((e) => e.userId));
  const rostersIn = ((lineupSizes ?? []) as { user_id: string; player_ids: string[] | null }[]).filter((l) => inIds.has(l.user_id) && (l.player_ids?.length ?? 0) >= size).length;
  const fee = Number((ctx.pool as { entry_fee?: number | string | null }).entry_fee ?? 0);
  const pot = fee * rows.length;
  // Most rostered, once lineups lock (before then nobody sees anyone else's).
  const playerOf = new Map(players.map((p) => [p.id, p]));
  const teamOf = new Map(teams.map((t) => [t.id, t]));
  const counts = new Map<string, number>();
  if (locked) for (const r of rows) for (const id of r.playerIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const popular = [...counts.entries()]
    .filter(([id]) => playerOf.has(id))
    .sort((a, b) => b[1] - a[1] || playerOf.get(a[0])!.name.localeCompare(playerOf.get(b[0])!.name))
    .slice(0, 8);
  const teamsLeft = teams.filter((t) => !pts.out.has(t.espnId ?? "")).length;
  const stat = "mt-0.5 text-4xl font-extrabold tracking-[-0.03em] tabular-nums";
  const row = "flex items-center justify-between gap-3 py-1.5 text-sm";

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
              <span className="shrink-0 text-xs text-muted tabular-nums">{rows.length} entries</span>
            </div>
            {rows.length === 0 ? (
              <Empty>No entries yet.</Empty>
            ) : (
              <ul data-fill-list className="mt-2 divide-y divide-line border-y border-line">
                {rows.slice(0, 40).map((r) => {
                  const me = r.userId === ctx.entryUserId;
                  return (
                    <li key={r.userId} {...(me ? { "data-fill-me": "" } : {})} className={`flex items-center gap-2.5 py-1.5 text-sm ${me ? "bg-accent/10 shadow-[inset_2px_0_0_var(--accent)]" : ""}`}>
                      <span className="w-6 shrink-0 pl-1 text-right text-xs tabular-nums text-muted">{locked ? r.rank : ""}</span>
                      <span className={`min-w-0 flex-1 truncate ${me ? "font-semibold text-accent" : "font-medium"}`}>{r.name}</span>
                      {locked ? (
                        <>
                          <span className="shrink-0 text-xs text-muted tabular-nums">{r.alive} left</span>
                          <span className="w-12 shrink-0 pr-1 text-right font-bold tabular-nums">{fmt(r.points)}</span>
                        </>
                      ) : (ctx.isCommissioner || me) ? (
                        <span className={`shrink-0 pr-1 text-xs font-semibold tabular-nums ${r.playerIds.length >= size ? "text-win" : "text-muted"}`}>
                          {r.playerIds.length >= size ? "Roster in" : `${r.playerIds.length}/${size}`}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </FillColumn>

        {/* Top stories, as on every pool's Home. */}
        <FillColumn className="order-last lg:order-none lg:px-6">
          <Suspense fallback={<p className="text-sm text-muted">Loading the news…</p>}>
            <PfNews now={now} />
          </Suspense>
        </FillColumn>

        {/* The pool's numbers, then the rules. */}
        <div className="space-y-6 lg:pl-6">
          <section>
            <SectionLabel fit className="!text-sm lg:!text-base">Pool Summary</SectionLabel>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-surface px-3 py-2.5 text-center">
                <div className="text-2xl font-extrabold tabular-nums">
                  {rostersIn}
                  <span className="text-base font-bold text-muted">/{rows.length}</span>
                </div>
                <div className="text-xs text-muted">Rosters in</div>
              </div>
              <div className="rounded-xl bg-surface px-3 py-2.5 text-center">
                <div className="text-2xl font-extrabold tabular-nums">{pot > 0 ? money(pot) : `${teamsLeft}/${teams.length || 14}`}</div>
                <div className="text-xs text-muted">{pot > 0 ? "Pot" : "Teams left"}</div>
              </div>
            </div>
          </section>
          {teams.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between gap-3">
                <SectionLabel fit className="!text-sm lg:!text-base">Playoff Field</SectionLabel>
                <span className="shrink-0 text-xs text-muted tabular-nums">{teamsLeft} of {teams.length} left</span>
              </div>
              <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                {teams.map((t) => {
                  const out = pts.out.has(t.espnId ?? "");
                  return (
                    <li key={t.id} className={`flex min-w-0 items-center gap-2 text-sm ${out ? "text-muted line-through opacity-60" : "text-ink"}`}>
                      <TeamLogo src={t.logo_url} abbr={t.abbreviation} className="size-5 shrink-0" />
                      <span className="truncate">{t.name}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {popular.length > 0 && (
            <section>
              <SectionLabel fit className="!text-sm lg:!text-base">Most Rostered</SectionLabel>
              <ul className="mt-1 divide-y divide-line">
                {popular.map(([id, n]) => {
                  const p = playerOf.get(id)!;
                  const t = teamOf.get(p.teamId);
                  return (
                    <li key={id} className={row}>
                      <span className="flex min-w-0 items-center gap-2">
                        <TeamLogo src={t?.logo_url} abbr={t?.abbreviation} className="size-5 shrink-0" />
                        <span className="truncate font-medium">{p.name}</span>
                        <span className="shrink-0 text-xs text-muted">{p.pos}</span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">{Math.round((n / Math.max(1, rows.length)) * 100)}%</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          <section>
            <SectionLabel fit className="!text-sm lg:!text-base">Pool Rules</SectionLabel>
            <p className="mt-2 text-sm leading-relaxed text-ink">{rulesSummary(settings)}</p>
          </section>
        </div>
      </div>
    </div>
  );
}

/** NFL top stories; streams in after the rest of the page. */
async function PfNews({ now }: { now: number }) {
  return <NewsList stories={await getNews("nfl", 10)} now={now} title={NEWS_TITLE.nfl} />;
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

  return (
    <>
      <PageTitle sub={<>{settings.lock_at ? `Rosters lock ${lockLabel(settings.lock_at, tz)}. ` : ""}One player from each playoff team.</>}>{title}</PageTitle>
      {ctx.isGuest ? (
        <Empty>Guests can&apos;t build a roster.</Empty>
      ) : (
        <PfLineupBuilder
          players={players}
          teams={teams}
          roster={settings.roster}
          initial={entry.playerIds}
          save={savePfLineup.bind(null, slug, behalf ? target : null)}
          forName={behalf ? entry.name : undefined}
        />
      )}
    </>
  );
}

export async function PfStandingsPage({ ctx, slug }: { ctx: PoolBase; slug: string }) {
  const { settings, teams, players, entries, locked } = await getPf(ctx);
  const pts = locked ? await getPfPoints(ctx.pool.season, settings.scoring, players, teams) : NO_POINTS;
  const rows = pfStandings(entries, players, teams, pts);
  const size = rosterSize(settings);
  return (
    <>
      <PageTitle sub={locked ? "Total fantasy points, Wild Card round through the Super Bowl. Open an entry to see its players." : "Everyone's roster shows once rosters lock."}>Standings</PageTitle>
      {pts.live && <AutoRefresh active />}
      <section className={card}>
        {rows.length === 0 ? (
          <Empty>No entries yet.</Empty>
        ) : !locked ? (
          <>
            <StandingsList rows={rows} me={ctx.entryUserId} locked={false} size={size} progress={ctx.isCommissioner} />
            {ctx.isCommissioner && <p className="mt-3 text-xs text-muted">To set a roster for a player, open Commissioner → Players.</p>}
          </>
        ) : (
          <div className="divide-y divide-line">
            {rows.map((r) => (
              <details key={r.userId} className="group">
                <summary className={`flex cursor-pointer list-none items-center gap-3 py-2.5 [&::-webkit-details-marker]:hidden ${r.userId === ctx.entryUserId ? "-mx-2 rounded-xl bg-accent/10 px-2" : ""}`}>
                  <span className="w-7 text-right text-sm tabular-nums text-muted">{r.rank}</span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{r.name}</span>
                  {pts.roundsStarted > 1 && (
                    <span className="hidden text-xs tabular-nums text-muted md:inline">
                      {ROUNDS.slice(0, pts.roundsStarted).map((x, i) => `${x.short} ${fmt(r.rounds[i])}`).join(" · ")}
                    </span>
                  )}
                  <span className="hidden text-xs text-muted tabular-nums sm:inline">{r.alive} still playing</span>
                  <span className="w-16 text-right text-[15px] font-bold tabular-nums">{fmt(r.points)}</span>
                </summary>
                <div className="pb-3 pl-10">
                  {r.playerIds.length ? <RosterTable ids={r.playerIds} players={players} teams={teams} pts={pts} /> : <p className="py-2 text-sm text-muted">No roster was set.</p>}
                  {ctx.isCommissioner && (
                    <Link href={`/p/${slug}/picks?for=${r.userId}`} className="-mx-1.5 -my-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold text-accent transition hover:bg-hover">Fix this roster</Link>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
