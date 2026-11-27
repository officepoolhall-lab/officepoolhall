import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { Empty, Medal, SectionLabel, TeamLogo, chipClass } from "@/components/ui";
import { savePickXPicks } from "@/app/p/[slug]/pickx/actions";
import type { PoolBase } from "@/lib/pool";
import { ROUNDS, gameKey } from "@/lib/bracket";
import { pickXScoringGrid, pickXScoringTable, roundPointsOf, roundsStarted, type PickXSettings, type TeamStatus } from "@/lib/pickx";
import { getPickX, pickXStandings, type PickXEntry, type PickXRow } from "@/lib/pickxData";
import { PickXPicker } from "./PickXPicker";
import { PickXTeamsTable, type PickXTeamRow } from "./PickXTeamsTable";
import { PickXOwnership, type PickXOwnRow } from "./PickXOwnership";
import type { BracketTeam } from "@/lib/brackets";
import { PoolPageHeader } from "@/components/PoolPageHeader";
import { PickXBracket } from "./PickXBracket";
import { gamesByTeam, getLiveBracket, tourneyTicker } from "@/lib/tourneyLive";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ScoringInfo } from "@/components/ScoringInfo";
import { ExpandAll } from "@/components/ExpandAll";
import { FitText } from "@/components/FitText";
import { FillColumn } from "@/components/FillColumn";
import { Countdown } from "@/components/Countdown";

// The pages of an NCAA Pick X pool: Home, My Picks, Standings and Bracket. The pool routes
// reach these when settings.format is "pick_x". Laid out like the other pools (Playoff Fantasy's
// pages in particular): the shared page header, a lock reminder, the scoring "i", and each
// entry's teams in the same table everywhere.

const tzOf = (ctx: PoolBase) => ((ctx.pool.settings as { timezone?: string } | null)?.timezone ?? "America/Chicago");
const lockLabel = (iso: string, tz: string) => formatInTimeZone(iso, tz, "EEE, MMM d · h:mm a");
const NO_FIELD = "The bracket fills in from ESPN once the field is announced on Selection Sunday. Picks open then.";

type Field = Map<string, BracketTeam>;
/** Every team that can be picked, by id: the field, plus the First Four's teams. */
const fieldOf = (bracket: { field: (BracketTeam | null)[]; firstFour?: { teams: (BracketTeam | null)[] }[] } | null): Field =>
  new Map([...(bracket?.field ?? []), ...(bracket?.firstFour ?? []).flatMap((g) => g.teams)].filter((t): t is BracketTeam => Boolean(t)).map((t) => [t.id, t]));
const nameOf = (t?: BracketTeam | null) => t?.short_name ?? t?.name ?? "";

/** Each team's share of the entries that made picks (0-100, rounded). */
function ownership(entries: PickXEntry[]): { own: Map<string, number>; count: Map<string, number>; entries: number } {
  const set = entries.filter((e) => e.teamIds.length > 0);
  const count = new Map<string, number>();
  for (const e of set) for (const id of new Set(e.teamIds)) count.set(id, (count.get(id) ?? 0) + 1);
  return { own: new Map([...count].map(([id, n]) => [id, Math.round((n / Math.max(1, set.length)) * 100)])), count, entries: set.length };
}

/** An entry's teams for PickXTeamsTable: best seed first. */
function teamRows(teams: TeamStatus[], field: Field, regions: string[], s: PickXSettings, own: Map<string, number> | null): PickXTeamRow[] {
  return [...teams]
    .sort((a, b) => a.seed - b.seed || a.slot - b.slot)
    .map((t) => {
      const team = field.get(t.teamId);
      const { points, lostIn } = roundPointsOf(t, s.scoring);
      return { teamId: t.teamId, seed: t.seed, name: nameOf(team), abbr: team?.abbreviation ?? null, logo: team?.logo_url ?? null, region: regions[t.region] ?? "", own: own ? (own.get(t.teamId) ?? 0) : null, points, lostIn, total: t.points };
    });
}

/** Points by round for an entry (the sum of its teams' wins). */
const entryRounds = (r: PickXRow, s: PickXSettings) => ROUNDS.map((_, i) => r.teams.reduce((t, x) => t + (roundPointsOf(x, s.scoring).points[i] ?? 0), 0));

/** The scoring pop-up's "i", with this pool's rules. */
function Scoring({ settings }: { settings: PickXSettings }) {
  // The points table (seeds down the left, rounds across, the most a team can earn on the right), then the pick rules.
  const rules = pickXScoringTable(settings).filter((g) => g.group === "Rules");
  return (
    <ScoringInfo
      table={pickXScoringGrid(settings)}
      groups={rules}
      intro={`Pick ${settings.picks} teams. Every time one of them wins, you score the points for its seed and that round${settings.scoring.bonus ? ` (bonus of ${settings.scoring.bonus} included)` : ""}.`}
    />
  );
}

/**
 * Before the lock, for anyone whose picks aren't all in: how many are made, when they lock and a
 * link to finish. Red in the last day.
 */
function LockReminder({ ctx, slug, settings, entries, lockAt, locked }: { ctx: PoolBase; slug: string; settings: PickXSettings; entries: PickXEntry[]; lockAt: string | null; locked: boolean }) {
  if (locked || ctx.isGuest || !lockAt) return null;
  const mine = entries.find((e) => e.userId === ctx.entryUserId);
  if (!mine || mine.teamIds.length >= settings.picks) return null;
  const left = Date.parse(lockAt) - Date.now(); // eslint-disable-line react-hooks/purity -- render-time snapshot
  if (left <= 0) return null;
  const soon = left < 24 * 60 * 60 * 1000;
  return (
    <div className={`mb-4 flex items-center gap-3 rounded-xl border-2 px-4 py-2.5 text-sm ${soon ? "border-loss bg-[color-mix(in_srgb,var(--color-loss)_8%,transparent)]" : "border-accent bg-surface"}`}>
      <div className="min-w-0 flex-1">
        <FitText min={10} className="block font-semibold">
          {mine.teamIds.length ? `You've picked ${mine.teamIds.length} of ${settings.picks} teams.` : "You haven't picked your teams yet."}
        </FitText>
        <FitText min={9} className="block text-xs text-muted">
          Locks in <Countdown to={lockAt} done="moments" /> · {lockLabel(lockAt, tzOf(ctx))}
          <span className="hidden sm:inline">. Open picks score nothing.</span>
        </FitText>
      </div>
      <Link href={`/p/${slug}/picks`} className={`flex h-9 shrink-0 items-center rounded-lg px-3 text-sm font-semibold whitespace-nowrap text-white transition hover:brightness-110 ${soon ? "bg-loss" : "bg-accent"}`}>
        {mine.teamIds.length ? "Finish" : "Pick"} <span className="ml-1 hidden sm:inline">my teams</span> <span aria-hidden className="ml-1">→</span>
      </Link>
    </div>
  );
}

/** The national championship is played: standings are final, and the top three get medals. */
const titleDecided = (bracket: { results: Record<string, unknown> } | null | undefined) => Boolean(bracket?.results[gameKey(6, 0)]);

/** One entry's line in Home's standings. */
function StandingRow({ r, me, locked, final = false, pin = false, className = "" }: { r: PickXRow; me: boolean; locked: boolean; /** The championship is final: medals for the top three. */ final?: boolean; pin?: boolean; className?: string }) {
  return (
    <li
      {...(me && !pin ? { "data-fill-me": "" } : {})}
      {...(pin ? { "data-fill-pin": "flex" } : {})}
      className={`flex items-center gap-2.5 py-1.5 text-sm ${me ? "bg-accent/10 shadow-[inset_2px_0_0_var(--accent)]" : ""} ${className}`}
    >
      <span className="flex w-6 shrink-0 justify-end pl-1 text-xs tabular-nums text-muted">{locked ? final ? <Medal place={r.rank} className="size-6" /> : r.rank : ""}</span>
      <span className="min-w-0 flex-1">
        <FitText min={10} className={`block ${me ? "font-semibold text-accent" : "font-medium"}`}>{r.name}</FitText>
      </span>
      {/* Before the lock just the names: not whether each entry's picks are in. */}
      {locked && (
        <>
          <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted">{r.alive}/{r.teams.length}</span>
          <span className="w-10 shrink-0 pr-1 text-right font-bold tabular-nums">{r.points}</span>
        </>
      )}
    </li>
  );
}

export async function PickXHome({ ctx, slug }: { ctx: PoolBase; slug: string }) {
  const { settings, bracket, entries, locked } = await getPickX(ctx);
  const tz = tzOf(ctx);
  const rows = pickXStandings(bracket, entries, settings);
  const mine = ctx.isGuest ? undefined : rows.find((r) => r.userId === ctx.entryUserId);
  const mineAt = mine ? rows.indexOf(mine) : -1;
  const field = fieldOf(bracket);
  const regions = bracket?.regions ?? [];
  const own = locked ? ownership(entries) : null;
  // eslint-disable-next-line react-hooks/purity -- render-time snapshot; the countdown ticks client-side
  const now = Date.now();
  const stat = "mt-0.5 text-4xl font-extrabold tracking-[-0.03em] tabular-nums";
  // Every team in the field: its points and whether it is still alive.
  const statuses = bracket ? pickXStandings(bracket, [{ userId: "", name: "", teamIds: bracket.field.filter(Boolean).map((t) => t!.id), editedBy: null, tiebreak: null }], settings)[0]?.teams ?? [] : [];
  const alive = statuses.filter((t) => t.alive);
  // Once picks lock: every team's share of the pool and what it has scored.
  const ownRows: PickXOwnRow[] = own
    ? statuses.map((t) => {
        const team = field.get(t.teamId);
        const c = own.count.get(t.teamId) ?? 0;
        return {
          teamId: t.teamId, seed: t.seed, name: nameOf(team), abbr: team?.abbreviation ?? null, logo: team?.logo_url ?? null,
          region: regions[t.region] ?? "", count: c, own: Math.round((c / Math.max(1, own.entries)) * 1000) / 10, points: t.points, wins: t.wins.length, alive: t.alive,
        };
      })
    : [];
  // Each team's games, for its row in the Pool Summary.
  const games = bracket && locked ? gamesByTeam(await getLiveBracket(bracket, tz, now)) : undefined;

  return (
    <div data-wide className="space-y-6">
      <LockReminder ctx={ctx} slug={slug} settings={settings} entries={entries} lockAt={bracket?.lockAt ?? null} locked={locked} />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 lg:gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,23.5rem)_minmax(0,1fr)] lg:gap-x-0 lg:divide-x lg:divide-[color-mix(in_srgb,var(--accent)_35%,transparent)]">
        {/* The tournament and where everyone stands (everything in it stays on one line). */}
        <FillColumn className="space-y-6 lg:pr-6">
          {/* Phones: no gap under it (the standings below are desktop-only). */}
          <section className="border-b border-line pb-4 max-lg:!mb-0">
            <div className="flex items-center gap-1.5">
              <FitText min={12} className="text-lg font-bold text-ink">{bracket?.name ?? "NCAA Tournament"}</FitText>
              <Scoring settings={settings} />
            </div>
            {!bracket ? (
              <p className="mt-1 text-sm text-muted">{NO_FIELD}</p>
            ) : (
              <>
                <div className="mt-2 grid grid-cols-2 gap-4 [&>*]:min-w-0">
                  {mine && (
                    <div>
                      <FitText min={9} className="text-xs text-muted">{locked ? "My Points" : "My Picks"}</FitText>
                      <FitText min={18} className={stat}>
                        {locked ? mine.points : mine.teamIds.length >= settings.picks ? "Submitted" : (
                          <span className={mine.teamIds.length ? "" : "text-muted"}>
                            {mine.teamIds.length}
                            <span className="text-muted">/{settings.picks}</span>
                          </span>
                        )}
                      </FitText>
                    </div>
                  )}
                  <div>
                    <FitText min={9} className="text-xs text-muted">{locked ? (mine ? "Teams Alive" : "Teams Left") : "Picks Lock"}</FitText>
                    <FitText min={18} className={stat}>
                      {locked ? (
                        mine ? (<>{mine.alive}<span className="text-muted">/{mine.teams.length}</span></>) : (<>{alive.length}<span className="text-muted">/64</span></>)
                      ) : Date.parse(bracket.lockAt) > now ? (
                        <Countdown to={bracket.lockAt} done="locked" />
                      ) : (
                        <span className="text-2xl">Round of 64</span>
                      )}
                    </FitText>
                  </div>
                </div>
                {!locked && <FitText min={9} className="mt-1 block text-xs text-muted">{lockLabel(bracket.lockAt, tz)}</FitText>}
                <div className="mt-3 flex gap-1.5 whitespace-nowrap">
                  {!ctx.isGuest && <Link href={`/p/${slug}/picks`} className={chipClass(true, "", "sm")}>My Picks</Link>}
                  <Link href={`/p/${slug}/standings`} className={chipClass(ctx.isGuest, "", "sm")}>Standings</Link>
                  <Link href={`/p/${slug}/bracket`} className={chipClass(false, "", "sm")}>Bracket</Link>
                </div>
              </>
            )}
          </section>
          {/* Phones skip the standings here (they have their own tab). */}
          <section className="max-lg:hidden">
            <div className="flex items-baseline justify-between gap-3">
              <SectionLabel fit className="!text-sm lg:!text-base">Standings</SectionLabel>
              {locked && <span className="shrink-0 text-[10px] font-bold tracking-wide text-muted uppercase">Alive · Pts</span>}
            </div>
            {rows.length === 0 ? (
              <Empty>No entries yet.</Empty>
            ) : (
              <ul data-fill-list className="mt-2 divide-y divide-line border-y border-line">
                {rows.map((r, i) => (
                  <StandingRow key={r.userId} r={r} me={r.userId === ctx.entryUserId} locked={locked} final={titleDecided(bracket)} className={i >= 10 ? "max-lg:hidden" : ""} />
                ))}
                {mineAt >= 3 && mine && (
                  <>
                    <li aria-hidden data-fill-pin="block" className={`py-1 text-center text-xs leading-none text-faint lg:hidden ${mineAt >= 10 ? "" : "max-lg:hidden"}`}>···</li>
                    <StandingRow r={mine} me locked={locked} final={titleDecided(bracket)} pin className={`lg:hidden ${mineAt >= 10 ? "" : "max-lg:hidden"}`} />
                  </>
                )}
              </ul>
            )}
          </section>
        </FillColumn>

        {/* The Pool Summary: once picks lock, every team's ownership and points. */}
        <div className="order-last space-y-8 lg:order-none lg:pl-6">
          {bracket && !(locked && own) && (
            <section className="max-w-3xl">
              <div className="border-b border-line pb-1">
                <SectionLabel fit className="!text-base lg:!text-lg">Pool Summary</SectionLabel>
              </div>
              <p className="py-3 text-sm text-muted">Available once picks lock.</p>
            </section>
          )}
          {bracket && locked && own && (
            <section className="max-w-3xl">
              <div className="border-b border-line pb-1">
                <SectionLabel fit className="!text-base lg:!text-lg">Pool Summary</SectionLabel>
              </div>
              <div className="mt-3">
                <PickXOwnership rows={ownRows} regions={regions} entries={own.entries} games={games} />
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export async function PickXPicksPage({ ctx, slug, forUserId }: { ctx: PoolBase; slug: string; forUserId?: string }) {
  const { settings, bracket, entries, locked } = await getPickX(ctx);
  const tz = tzOf(ctx);
  // The commissioner picking for a player: /picks?for=<user id>.
  const behalf = Boolean(forUserId && ctx.isCommissioner);
  const target = behalf ? forUserId! : ctx.entryUserId;
  const entry = entries.find((e) => e.userId === target);
  const now = Date.now(); // eslint-disable-line react-hooks/purity -- render-time snapshot
  const title = behalf && entry ? <>Picks <span className="text-accent">for {entry.name}</span></> : "My Picks";
  if (!bracket) return (<><PoolPageHeader title={title} now={now} timezone={tz} /><Empty>{NO_FIELD}</Empty></>);
  // Spots with a team, or a First Four game whose two teams can both be picked.
  const filled = bracket.field.filter((t, slot) => t || bracket.firstFour.some((g) => g.slot === slot)).length;

  if (locked && !behalf) {
    // Locked: the entry's teams, round by round.
    const row = pickXStandings(bracket, entry ? [entry] : [], settings)[0];
    const own = ownership(entries).own;
    const games = gamesByTeam(await getLiveBracket(bracket, tz, now));
    return (
      <>
        <PoolPageHeader title={<span className="inline-flex items-center gap-2">My Picks <Scoring settings={settings} /></span>} sub={`Picks locked ${lockLabel(bracket.lockAt, tz)}.`} now={now} timezone={tz} />
        {!row || row.teams.length === 0 ? (
          <Empty>No picks were made for this entry.</Empty>
        ) : (
          <section className="sm:max-w-3xl">
            <div className="flex items-baseline justify-between gap-3 border-b border-line pb-1">
              <SectionLabel fit className="!text-sm lg:!text-base">My Teams</SectionLabel>
              <span className="shrink-0 text-lg font-extrabold tabular-nums">{row.points}</span>
            </div>
            <PickXTeamsTable rows={teamRows(row.teams, fieldOf(bracket), bracket.regions, settings, own)} started={roundsStarted(bracket.results)} games={games} />
            <FitText min={8} className="mt-2 text-xs text-muted">
              Own % is the share of the pool&apos;s entries with that team. L marks the round a team lost in. Tap a team to see its games.
              {settings.tiebreaker === "title_total" && row.tiebreak !== null ? ` Your tiebreaker: ${row.tiebreak}.` : ""}
            </FitText>
          </section>
        )}
      </>
    );
  }


  return (
    <>
      <h1 className="sr-only">{behalf && entry ? `Picks for ${entry.name}` : "My Picks"}</h1>
      {behalf && entry && <p className="mb-3 text-lg font-bold">Picks <span className="text-accent">for {entry.name}</span></p>}
      {filled < 64 && <p className="mb-4 rounded-xl bg-surface px-3 py-2 text-sm text-muted">{64 - filled} spots in the field aren&apos;t set yet: they fill in from ESPN as the First Four games finish.</p>}
      {ctx.isGuest ? (
        <Empty>Guests can&apos;t make picks.</Empty>
      ) : (
        <PickXPicker
          field={bracket.field}
          playIn={bracket.firstFour.filter((g) => !g.winner && g.teams[0] && g.teams[1]).map((g) => ({ slot: g.slot, teams: g.teams as BracketTeam[] }))}
          regions={bracket.regions}
          initial={entry?.teamIds ?? []}
          settings={settings}
          save={savePickXPicks.bind(null, slug, behalf ? forUserId! : null)}
          forName={behalf ? entry?.name : undefined}
          lockText={`Locks ${lockLabel(bracket.lockAt, tz)}`}
          scoringInfo={<Scoring settings={settings} />}
          tiebreak={settings.tiebreaker === "title_total" ? { initial: entry?.tiebreak ?? null } : null}
        />
      )}
    </>
  );
}

export async function PickXStandingsPage({ ctx, slug }: { ctx: PoolBase; slug: string }) {
  const { settings, bracket, entries, locked } = await getPickX(ctx);
  const rows = pickXStandings(bracket, entries, settings);
  const tz = tzOf(ctx);
  const field = fieldOf(bracket);
  const regions = bracket?.regions ?? [];
  const started = roundsStarted(bracket?.results ?? {});
  const own = locked ? ownership(entries).own : null;
  const me = ctx.entryUserId;
  const tb = settings.tiebreaker === "title_total";
  // Like Playoff Fantasy's: the round's games in the header, scores kept fresh while they're on.
  const now = Date.now(); // eslint-disable-line react-hooks/purity -- render-time snapshot
  const live = bracket && locked ? await getLiveBracket(bracket, tz, now) : null;
  const games = live ? gamesByTeam(live) : undefined;
  // Place | Entry | the six rounds (from sm) | Total | the open/close arrow.
  const grid = "grid grid-cols-[2rem_minmax(0,1fr)_4.5rem_1.25rem] sm:grid-cols-[2.5rem_minmax(0,1fr)_repeat(6,3.5rem)_5rem_1.25rem] items-center gap-x-2";

  return (
    <div data-wide>
      {live && <AutoRefresh active={live.live || live.soon} seconds={30} />}
      <LockReminder ctx={ctx} slug={slug} settings={settings} entries={entries} lockAt={bracket?.lockAt ?? null} locked={locked} />
      <PoolPageHeader title={<span className="inline-flex items-center gap-2">Standings <Scoring settings={settings} /></span>} games={live ? tourneyTicker(live) : []} now={now} timezone={tz} />
      {rows.length === 0 ? (
        <Empty>No entries yet.</Empty>
      ) : (
        <section className="max-w-6xl">
          <div className="mb-2 flex items-center gap-3">
            <FitText min={8} className="min-w-0 flex-1 text-xs text-muted">
              {locked
                ? tb
                  ? `Tiebreaker: closest to title game total${settings.title_total !== null ? ` (${settings.title_total})` : ""}`
                  : ""
                : "Everyone's teams show here once picks lock."}
            </FitText>
            {locked && <ExpandAll target="pickx-standings" />}
          </div>
          <div className={`${grid} border-b border-line px-2 py-1.5 text-[11px] font-bold tracking-wide text-muted uppercase`}>
            <span>#</span>
            <span className="flex min-w-0 items-center gap-4">
              <span className="sm:w-44 sm:shrink-0 lg:w-52">Entry</span>
              {locked && <span className="hidden sm:block">Remaining Teams</span>}
            </span>
            {ROUNDS.map((r) => (
              <span key={r.round} className="hidden text-right sm:block">{r.short}</span>
            ))}
            <span className="text-right">Total</span>
            <span />
          </div>
          <div id="pickx-standings">
            {rows.map((r) => {
              const byRound = entryRounds(r, settings);
              return (
                <details key={r.userId} className={`group border-b border-line ${r.userId === me ? "bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]" : ""}`}>
                  <summary className={`${grid} cursor-pointer list-none px-2 py-2 text-sm hover:bg-surface [&::-webkit-details-marker]:hidden`}>
                    <span className="flex tabular-nums text-muted">{locked ? titleDecided(bracket) ? <Medal place={r.rank} className="size-6" /> : r.rank : ""}</span>
                    <span className="flex min-w-0 items-center gap-4">
                      <span className="min-w-0 sm:w-44 sm:shrink-0 lg:w-52">
                        <FitText min={10} className={`block font-semibold ${r.userId === me ? "text-accent" : ""}`}>{r.name}</FitText>
                        {locked && tb && r.tiebreak !== null && <span className="block text-[11px] text-muted tabular-nums">Tiebreaker: {r.tiebreak}</span>}
                        {/* Phones: the teams still alive, small, under the name. */}
                        {locked && r.alive > 0 && (
                          <span className="mt-1 flex items-center gap-1 sm:hidden">
                            {r.teams.filter((t) => t.alive).sort((a, b) => a.seed - b.seed).map((t) => {
                              const team = field.get(t.teamId);
                              return <TeamLogo key={t.teamId} src={team?.logo_url} abbr={team?.abbreviation} className="size-5 shrink-0" />;
                            })}
                          </span>
                        )}
                      </span>
                      {/* Desktop: the logos of the entry's teams still alive. */}
                      {locked && (
                        <span className="hidden min-w-0 flex-1 items-center gap-1.5 overflow-hidden sm:flex">
                          {r.teams.filter((t) => t.alive).sort((a, b) => a.seed - b.seed).map((t) => {
                            const team = field.get(t.teamId);
                            return <TeamLogo key={t.teamId} src={team?.logo_url} abbr={team?.abbreviation} className="size-6 shrink-0" />;
                          })}
                        </span>
                      )}
                    </span>
                    {byRound.map((v, i) => (
                      <span key={i} className={`hidden text-right tabular-nums sm:block ${i >= started || !locked ? "text-muted" : ""}`}>{i >= started || !locked ? "–" : v}</span>
                    ))}
                    <span className="text-right font-bold tabular-nums">{locked ? r.points : ""}</span>
                    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="size-4 justify-self-end text-muted transition-transform group-open:rotate-180">
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
                    </svg>
                  </summary>
                  <div className="px-2 pb-3 sm:pl-12">
                    {!locked ? (
                      <p className="py-1.5 text-xs text-muted">Shows when picks lock.</p>
                    ) : !r.teams.length ? (
                      <p className="py-1.5 text-xs text-muted">No picks made.</p>
                    ) : (
                      <>
                        <p className="pb-1 text-[11px] tabular-nums text-muted">{r.alive} of {r.teams.length} still alive</p>
                        <PickXTeamsTable rows={teamRows(r.teams, field, regions, settings, own)} started={started} compact games={games} />
                      </>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/** The tournament bracket, live: every game with ESPN's score, clock or tip time, the First Four included. */
export async function PickXBracketPage({ ctx, slug }: { ctx: PoolBase; slug: string }) {
  const { bracket, entries } = await getPickX(ctx);
  const tz = tzOf(ctx);
  const now = Date.now(); // eslint-disable-line react-hooks/purity -- render-time snapshot
  if (!bracket) return (<div data-wide><PoolPageHeader title="Bracket" now={now} timezone={tz} /><Empty>{NO_FIELD}</Empty></div>);
  const live = await getLiveBracket(bracket, tz, now);
  const mine = entries.find((e) => e.userId === ctx.entryUserId)?.teamIds ?? [];
  return (
    <div data-wide>
      <AutoRefresh active={live.live || live.soon} seconds={30} />
      <PoolPageHeader title="Bracket" now={now} timezone={tz} />
      <PickXBracket b={live} mine={mine} printHref={`/print/bracket/${slug}`} />
    </div>
  );
}
