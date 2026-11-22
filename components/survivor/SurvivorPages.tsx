import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { AutoRefresh } from "@/components/AutoRefresh";
import { AxisLockScroll } from "@/components/AxisLockScroll";
import { FitText } from "@/components/FitText";
import { Empty, LinkButton, LiveDot, PageTitle, TeamLogo, chipClass } from "@/components/ui";
import { saveSurvivorPick } from "@/app/p/[slug]/formats/actions";
import type { PoolBase } from "@/lib/pool";
import { survivorRules, survivorStandings, weekClosed, type SvCell, type SvGame, type SvRow, type SvTeam, type SvWeek } from "@/lib/survivor";
import { anyLive, getSurvivor, getWeekExtras, withLiveScores } from "@/lib/survivorData";
import { SurvivorPicker, type PickerTeam } from "./SurvivorPicker";

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

export async function SurvivorPicksPage({ ctx, slug, forUserId, weekParam }: { ctx: PoolBase; slug: string; forUserId?: string; weekParam?: string }) {
  const behalf = Boolean(forUserId && ctx.isCommissioner && forUserId !== ctx.user.id);
  const loaded = await getSurvivor(ctx, behalf ? forUserId : undefined);
  const { settings, picks, members } = loaded;
  const weeks = await withLiveScores(loaded.weeks);
  const tz = (ctx as { displayTz?: string }).displayTz ?? tzOf(ctx);
  const target = behalf ? forUserId! : ctx.entryUserId;
  const rows = survivorStandings(weeks, picks, members, settings);
  const row = rows.find((r) => r.userId === target);
  const counted = weeks.filter((w) => w.week >= settings.start_week);
  const week = (weekParam ? counted.find((w) => w.week === Number(weekParam)) : null) ?? currentWeek(weeks, settings.start_week);
  const title = behalf && row ? <>Pick <span className="text-accent">for {row.name}</span></> : "My Pick";

  if (!week) return (<><PageTitle>{title}</PageTitle><Empty>No week is open yet. The commissioner publishes each week&apos;s games before the first kickoff.</Empty></>);
  if (!row) return (<><PageTitle>{title}</PageTitle><Empty>{ctx.isGuest ? "Guests can't make picks." : "This entry isn't playing."}</Empty></>);

  const { spreads, records } = await getWeekExtras(ctx, week);
  const pick = picks.find((p) => p.slateId === week.slateId && p.userId === target) ?? null;
  const pickGame = pick ? week.games.find((g) => g.id === pick.gameId) : undefined;
  // Out before this week: nothing to pick (the commissioner can still fix a pick).
  const cell = row.cells.find((c) => c.slateId === week.slateId);
  const outAlready = cell?.state === "out";
  const canPick = !ctx.isGuest && (behalf || (!outAlready && !weekClosed(week)));
  const usedLabel = (t: SvTeam): string | null => {
    if (settings.reuse) return null;
    const w = row.used.get(t.id);
    return w !== undefined && w !== week.week ? `Used · Week ${w}` : null;
  };
  const asTeam = (g: SvGame, side: "home" | "away"): PickerTeam => {
    const t = side === "home" ? g.home : g.away;
    const spread = spreads.get(g.id);
    const record = t.espn_id ? records[t.espn_id] : undefined;
    return {
      id: t.id,
      name: teamName(t),
      abbreviation: t.abbreviation,
      logo_url: t.logo_url,
      espnId: t.espn_id ?? null,
      record: record ? record.replace(/-/g, "–") : null,
      spread: spread === undefined ? null : side === "home" ? spread : -spread,
      score: g.started ? (side === "home" ? g.homeScore : g.awayScore) : null,
      used: usedLabel(t),
    };
  };
  const qs = (w: number) => `/p/${slug}/picks?week=${w}${behalf ? `&for=${target}` : ""}`;

  return (
    <>
      <PageTitle sub={outAlready ? `Eliminated in Week ${row.outWeek}.` : undefined}>{title}</PageTitle>
      <AutoRefresh active={anyLive([week])} />
      {counted.length > 1 && (
        <div className="-mx-4 mb-3 flex gap-1 overflow-x-auto px-4 py-1.5">
          {[...counted].reverse().map((w) => (
            <Link key={w.slateId} href={qs(w.week)} className={chipClass(w.slateId === week.slateId, "shrink-0", "sm")}>
              {w.label}
            </Link>
          ))}
        </div>
      )}
      {!canPick && !cell?.team && (
        <p className="mb-3 text-sm text-muted">
          {outAlready ? "This entry was already out this week." : cell?.state === "missed" ? "No pick was made this week, which counts as a loss." : "No pick this week."}
        </p>
      )}
      <SurvivorPicker
        key={`${week.slateId}:${target}:${pick?.teamId ?? ""}`}
        games={week.games
          .filter((g) => !g.voided)
          .map((g) => ({
            id: g.id,
            when: g.timeTbd ? formatInTimeZone(g.startAt, tz, "EEE, MMM d") + " · TBD" : formatInTimeZone(g.startAt, tz, "EEE, MMM d · h:mm a"),
            tv: g.tv ?? null,
            state: g.final ? ("final" as const) : g.started ? ("live" as const) : ("upcoming" as const),
            clock: g.clock ?? null,
            // The commissioner can set a pick on a game that's started.
            locked: g.started && !behalf,
            href: g.started && g.espnId ? `/p/${slug}/game/${g.id}?back=${encodeURIComponent(qs(week.week))}` : null,
            home: asTeam(g, "home"),
            away: asTeam(g, "away"),
          }))}
        pick={pick ? { gameId: pick.gameId, teamId: pick.teamId } : null}
        pickLocked={Boolean(pickGame?.started) && !behalf}
        readOnly={!canPick}
        weekLabel={week.label}
        timezone={tz}
        save={saveSurvivorPick.bind(null, slug, week.slateId, behalf ? target : null)}
      />

      <section className={`${card} mt-4`}>
        <h2 className="text-base font-bold">Picks so far</h2>
        <ul className="mt-1 divide-y divide-line">
          {row.cells.filter((c) => c.state !== "out" && c.state !== "before" && c.state !== "open").length === 0 && <li className="py-2.5 text-sm text-muted">Nothing yet.</li>}
          {row.cells
            .filter((c) => c.state !== "out" && c.state !== "before" && c.state !== "open")
            .map((c) => (
              <li key={c.slateId} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="w-16 text-muted">Week {c.week}</span>
                {c.team ? (
                  <>
                    <TeamLogo src={c.team.logo_url} abbr={c.team.abbreviation} className="size-5" />
                    <span className="min-w-0 flex-1 truncate font-semibold">{teamName(c.team)}</span>
                  </>
                ) : (
                  <span className="min-w-0 flex-1 text-muted">No pick</span>
                )}
                <span className={`font-semibold ${c.state === "win" ? "text-win" : c.state === "loss" || c.state === "missed" ? "text-loss" : "text-muted"}`}>
                  {c.state === "win" ? "Won" : c.state === "loss" || c.state === "missed" ? "Lost" : c.state === "void" ? "No result" : "Pending"}
                </span>
              </li>
            ))}
        </ul>
      </section>
    </>
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
    const base = "h-11 min-w-14 border-b border-line px-0.5 text-center";
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
    <>
      <PageTitle sub={`${alive} of ${rows.length} still alive. Each week's pick shows once its game kicks off; tap a pick for the game's play-by-play and box score.`}>Standings</PageTitle>
      <AutoRefresh active={anyLive(weeks)} />
      {rows.length === 0 ? (
        <Empty>No entries yet.</Empty>
      ) : (
        <AxisLockScroll className="relative -mx-4 max-h-[max(24rem,calc(100dvh-14rem))] overflow-auto isolate sm:mx-0">
          <table className="border-separate border-spacing-0 text-sm sm:w-full">
            <thead>
              <tr>
                <th className={`${head} left-0 z-30 border-r px-4 text-left`}>
                  <div className="flex items-end justify-between gap-3">
                    <span>Entry</span>
                    <span>Status</span>
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
                return (
                  <tr key={r.userId} className="[&:last-child>*]:border-b-0">
                    <th className={`sticky left-0 z-10 border-b border-r border-line bg-bg px-4 py-0.5 text-left text-[13px] font-medium lg:text-sm ${mine ? "shadow-[inset_2px_0_0_var(--accent)]" : ""}`}>
                      <div className="flex items-center justify-between gap-3">
                        <span className={`w-28 min-w-0 sm:w-40 ${mine ? "text-accent" : r.alive ? "" : "text-muted"}`}>
                          {ctx.isCommissioner ? (
                            <Link href={`/p/${slug}/picks?for=${r.userId}`} className="block hover:underline" title="Make or fix this entry's pick">
                              <FitText min={9}>{r.name}</FitText>
                            </Link>
                          ) : (
                            <FitText min={9}>{r.name}</FitText>
                          )}
                        </span>
                        <span className={`shrink-0 whitespace-nowrap text-right text-xs font-semibold tabular-nums ${r.alive ? "text-win" : "font-normal text-muted"}`}>
                          {r.alive ? (settings.lives > 1 ? `${r.livesLeft} of ${settings.lives}` : "Alive") : `Out · Wk ${r.outWeek}`}
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
    </>
  );
}
