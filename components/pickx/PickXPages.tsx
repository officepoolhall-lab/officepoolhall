import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { Empty, LinkButton, PageTitle, TeamLogo } from "@/components/ui";
import { savePickXPicks } from "@/app/p/[slug]/pickx/actions";
import type { PoolBase } from "@/lib/pool";
import { ROUNDS } from "@/lib/bracket";
import { rulesSummary, seedAt } from "@/lib/pickx";
import { getPickX, pickXStandings, type PickXRow } from "@/lib/pickxData";
import { PickXPicker } from "./PickXPicker";
import type { BracketTeam } from "@/lib/brackets";

// The pages of an NCAA Pick X pool: Home, My Picks and Standings. The pool routes reach these
// when settings.format is "pick_x".

const card = "rounded-2xl bg-surface p-4 sm:p-5";
const tzOf = (ctx: PoolBase) => ((ctx.pool.settings as { timezone?: string } | null)?.timezone ?? "America/Chicago");
const lockLabel = (iso: string, tz: string) => formatInTimeZone(iso, tz, "EEE, MMM d · h:mm a");

/** A picked team as a chip: seed, logo, short name; points once it has won; struck through once out. */
function TeamChip({ t, team }: { t: PickXRow["teams"][number]; team?: { short_name: string | null; name: string; abbreviation: string | null; logo_url: string | null } | null }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold ring-1 ${
        t.alive ? "bg-bg text-ink ring-line" : "bg-[var(--loss-fill)] text-muted ring-transparent line-through"
      }`}
      title={`${t.seed} seed · ${t.wins.length} win${t.wins.length === 1 ? "" : "s"}`}
    >
      <span className="tabular-nums text-muted">{t.seed}</span>
      <TeamLogo src={team?.logo_url} abbr={team?.abbreviation} className="size-4" />
      {team?.abbreviation ?? team?.short_name ?? team?.name}
      {t.points > 0 && <span className="tabular-nums text-win">+{t.points}</span>}
    </span>
  );
}

function StandingsList({ rows, me, field, locked, picks, limit }: { rows: PickXRow[]; me: string; field: Map<string, BracketTeam>; locked: boolean; picks: number; limit?: number }) {
  const shown = limit ? rows.slice(0, limit) : rows;
  return (
    <ul className="divide-y divide-line">
      {shown.map((r) => (
        <li key={r.userId} className={`py-3 ${r.userId === me ? "-mx-2 rounded-xl bg-accent/10 px-2" : ""}`}>
          <div className="flex items-center gap-3">
            <span className="w-7 text-right text-sm tabular-nums text-muted">{locked ? r.rank : ""}</span>
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{r.name}</span>
            {locked ? (
              <>
                <span className="hidden text-xs text-muted tabular-nums sm:inline">
                  {r.alive} alive · up to +{r.upside}
                </span>
                <span className="w-12 text-right text-[15px] font-bold tabular-nums">{r.points}</span>
              </>
            ) : (
              <span className={`text-sm font-semibold tabular-nums ${r.teamIds.length >= picks ? "text-win" : "text-muted"}`}>
                {r.teamIds.length >= picks ? "Picks in" : `${r.teamIds.length}/${picks}`}
              </span>
            )}
          </div>
          {locked && r.teams.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5 pl-10">
              {[...r.teams]
                .sort((a, b) => b.points - a.points || a.seed - b.seed)
                .map((t) => (
                  <TeamChip key={t.teamId} t={t} team={field.get(t.teamId)} />
                ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export async function PickXHome({ ctx, slug }: { ctx: PoolBase; slug: string }) {
  const { settings, bracket, entries, locked } = await getPickX(ctx);
  const tz = tzOf(ctx);
  const rows = pickXStandings(bracket, entries, settings);
  const mine = rows.find((r) => r.userId === ctx.entryUserId);
  const field = new Map<string, BracketTeam>((bracket?.field ?? []).filter((t): t is BracketTeam => Boolean(t)).map((t) => [t.id, t]));
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="space-y-4">
        <section className={card}>
          <div className="text-xs font-semibold uppercase tracking-wide text-accent">{bracket?.name ?? "NCAA Tournament"}</div>
          {!bracket ? (
            <p className="mt-1 text-sm text-muted">The tournament field isn&apos;t set yet. Picks open once the commissioner sets the bracket.</p>
          ) : locked ? (
            <>
              <div className="mt-1 text-lg font-bold">Picks are locked</div>
              {mine && <p className="text-sm text-muted tabular-nums">You have {mine.points} points with {mine.alive} of {mine.teams.length} teams still alive.</p>}
            </>
          ) : (
            <>
              <div className="mt-1 text-lg font-bold tabular-nums">{mine ? `${mine.teamIds.length} of ${settings.picks} picked` : "Make your picks"}</div>
              <p className="text-sm text-muted">Picks lock {lockLabel(bracket.lockAt, tz)}.</p>
              {!ctx.isGuest && (
                <LinkButton href={`/p/${slug}/picks`} kind="accent" className="mt-3 w-full">
                  {mine && mine.teamIds.length ? "Change my picks" : "Make my picks"}
                </LinkButton>
              )}
            </>
          )}
        </section>
        <section className={card}>
          <h2 className="text-base font-bold">How it works</h2>
          <ul className="mt-1 space-y-1 text-sm text-ink">
            {rulesSummary(settings).map((l) => (
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
        {rows.length ? <StandingsList rows={rows} me={ctx.entryUserId} field={field} locked={locked} picks={settings.picks} limit={10} /> : <Empty>No entries yet.</Empty>}
      </section>
    </div>
  );
}

export async function PickXPicksPage({ ctx, slug, forUserId }: { ctx: PoolBase; slug: string; forUserId?: string }) {
  const { settings, bracket, entries, locked } = await getPickX(ctx);
  const tz = tzOf(ctx);
  // The commissioner picking for a player: /picks?for=<user id>.
  const target = forUserId && ctx.isCommissioner ? forUserId : ctx.entryUserId;
  const entry = entries.find((e) => e.userId === target);
  if (!bracket) return (<><PageTitle>My Picks</PageTitle><Empty>The tournament field isn&apos;t set yet. Picks open once the commissioner sets the bracket.</Empty></>);
  const filled = bracket.field.filter(Boolean).length;

  if (locked && !(forUserId && ctx.isCommissioner)) {
    // Locked: the entry's teams and how they're doing.
    const row = pickXStandings(bracket, entry ? [entry] : [], settings)[0];
    const field = new Map<string, BracketTeam>(bracket.field.filter((t): t is BracketTeam => Boolean(t)).map((t) => [t.id, t]));
    return (
      <>
        <PageTitle sub={`Picks locked ${lockLabel(bracket.lockAt, tz)}.`}>My Picks</PageTitle>
        {!row || row.teams.length === 0 ? (
          <Empty>No picks were made for this entry.</Empty>
        ) : (
          <div className={card}>
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-bold">Your teams</h2>
              <span className="text-lg font-bold tabular-nums">{row.points} pts</span>
            </div>
            <ul className="mt-2 divide-y divide-line">
              {[...row.teams]
                .sort((a, b) => a.seed - b.seed)
                .map((t) => {
                  const team = field.get(t.teamId);
                  return (
                    <li key={t.teamId} className={`flex items-center gap-3 py-2.5 ${t.alive ? "" : "opacity-50"}`}>
                      <span className="w-6 text-center text-xs font-bold tabular-nums text-muted">{t.seed}</span>
                      <TeamLogo src={team?.logo_url} abbr={team?.abbreviation} className="size-6" />
                      <span className={`min-w-0 flex-1 truncate font-semibold ${t.alive ? "" : "line-through"}`}>{team?.short_name ?? team?.name}</span>
                      <span className="text-xs text-muted">{t.wins.length ? t.wins.map((r) => ROUNDS[r - 1].short).join(" · ") : t.alive ? "No games yet" : "Out"}</span>
                      <span className="w-12 text-right font-bold tabular-nums">{t.points}</span>
                    </li>
                  );
                })}
            </ul>
          </div>
        )}
      </>
    );
  }

  const forName = forUserId && ctx.isCommissioner ? entry?.name : undefined;
  return (
    <>
      <PageTitle sub={<>Picks lock {lockLabel(bracket.lockAt, tz)}. {rulesSummary(settings).slice(1).join(" ")}</>}>
        {forName ? <>Picks <span className="text-accent">for {forName}</span></> : "My Picks"}
      </PageTitle>
      {filled < 64 && <p className="mb-4 rounded-xl bg-surface px-3 py-2 text-sm text-muted">{64 - filled} spots in the field aren&apos;t set yet (First Four games, or the commissioner is still filling the bracket).</p>}
      {ctx.isGuest ? (
        <Empty>Guests can&apos;t make picks.</Empty>
      ) : (
        <PickXPicker
          field={bracket.field}
          regions={bracket.regions}
          initial={entry?.teamIds ?? []}
          settings={settings}
          save={savePickXPicks.bind(null, slug, forUserId && ctx.isCommissioner ? forUserId : null)}
          forName={forName}
        />
      )}
    </>
  );
}

export async function PickXStandingsPage({ ctx }: { ctx: PoolBase }) {
  const { settings, bracket, entries, locked } = await getPickX(ctx);
  const rows = pickXStandings(bracket, entries, settings);
  const field = new Map<string, BracketTeam>((bracket?.field ?? []).filter((t): t is BracketTeam => Boolean(t)).map((t) => [t.id, t]));
  // Most picked teams, once everyone's picks show.
  const counts = new Map<string, number>();
  if (locked) for (const e of entries) for (const id of e.teamIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const popular = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const slotOf = new Map<string, number>((bracket?.field ?? []).map((t, i) => [t?.id ?? "", i]));
  return (
    <>
      <PageTitle sub={locked ? "Points from every win by each entry's teams. Struck-through teams are out." : "Everyone's teams show once picks lock."}>Standings</PageTitle>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <section className={card}>
          {rows.length ? <StandingsList rows={rows} me={ctx.entryUserId} field={field} locked={locked} picks={settings.picks} /> : <Empty>No entries yet.</Empty>}
        </section>
        {locked && popular.length > 0 && (
          <section className={card}>
            <h2 className="text-base font-bold">Most picked</h2>
            <ul className="mt-2 space-y-2">
              {popular.map(([id, n]) => {
                const team = field.get(id);
                return (
                  <li key={id} className="flex items-center gap-2 text-sm">
                    <span className="w-6 text-center text-xs font-bold tabular-nums text-muted">{seedAt(slotOf.get(id) ?? 0)}</span>
                    <TeamLogo src={team?.logo_url} abbr={team?.abbreviation} className="size-5" />
                    <span className="min-w-0 flex-1 truncate font-semibold">{team?.short_name ?? team?.name}</span>
                    <span className="tabular-nums text-muted">{Math.round((100 * n) / entries.length)}%</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
