import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Empty, LinkButton, PageTitle, TeamLogo } from "@/components/ui";
import { savePfLineup } from "@/app/p/[slug]/formats/actions";
import type { PoolBase } from "@/lib/pool";
import { POSITIONS, ROUNDS, pfRules, rosterSize } from "@/lib/playoffFantasy";
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

export async function PfHome({ ctx, slug }: { ctx: PoolBase; slug: string }) {
  const { settings, teams, players, entries, locked } = await getPf(ctx);
  const pts = locked ? await getPfPoints(ctx.pool.season, settings.scoring, players, teams) : NO_POINTS;
  const rows = pfStandings(entries, players, teams, pts);
  const mine = rows.find((r) => r.userId === ctx.entryUserId);
  const size = rosterSize(settings);
  const tz = tzOf(ctx);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      {pts.live && <AutoRefresh active />}
      <div className="space-y-4">
        <section className={card}>
          <div className="text-xs font-semibold uppercase tracking-wide text-accent">NFL Playoffs</div>
          {players.length === 0 ? (
            <p className="mt-1 text-sm text-muted">{NOT_READY}</p>
          ) : locked ? (
            <>
              <div className="mt-1 text-lg font-bold">Rosters are locked</div>
              {mine && <p className="text-sm text-muted tabular-nums">You have {fmt(mine.points)} points with {mine.alive} of {mine.playerIds.length} players still playing.</p>}
            </>
          ) : (
            <>
              <div className="mt-1 text-lg font-bold tabular-nums">{mine ? `${mine.playerIds.length} of ${size} picked` : "Build your roster"}</div>
              <p className="text-sm text-muted">{settings.lock_at ? `Rosters lock ${lockLabel(settings.lock_at, tz)}.` : "Rosters lock at the first Wild Card kickoff."}</p>
              {!ctx.isGuest && mine && (
                <LinkButton href={`/p/${slug}/picks`} kind="accent" className="mt-3 w-full">
                  {mine.playerIds.length ? "Change my roster" : "Build my roster"}
                </LinkButton>
              )}
            </>
          )}
        </section>
        <section className={card}>
          <h2 className="text-base font-bold">How it works</h2>
          <ul className="mt-1 space-y-1 text-sm text-ink">
            {pfRules(settings).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      </div>
      <section className={card}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold">Standings</h2>
          <Link href={`/p/${slug}/standings`} className="rounded-full px-2 py-1 text-sm font-semibold text-accent hover:bg-hover">All</Link>
        </div>
        {rows.length ? <StandingsList rows={rows} me={ctx.entryUserId} locked={locked} size={size} limit={10} progress={ctx.isCommissioner} /> : <Empty>No entries yet.</Empty>}
      </section>
    </div>
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
