import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { Empty, LinkButton, PageTitle, TeamLogo, chipClass } from "@/components/ui";
import { saveSurvivorPick } from "@/app/p/[slug]/formats/actions";
import type { PoolBase } from "@/lib/pool";
import { survivorRules, survivorStandings, weekClosed, type SvCell, type SvRow, type SvTeam, type SvWeek } from "@/lib/survivor";
import { getSurvivor } from "@/lib/survivorData";
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
  const { settings, weeks, picks, members } = await getSurvivor(ctx, behalf ? forUserId : undefined);
  const tz = tzOf(ctx);
  const target = behalf ? forUserId! : ctx.entryUserId;
  const rows = survivorStandings(weeks, picks, members, settings);
  const row = rows.find((r) => r.userId === target);
  const counted = weeks.filter((w) => w.week >= settings.start_week);
  const week = (weekParam ? counted.find((w) => w.week === Number(weekParam)) : null) ?? currentWeek(weeks, settings.start_week);
  const title = behalf && row ? <>Pick <span className="text-accent">for {row.name}</span></> : "My Pick";

  if (!week) return (<><PageTitle>{title}</PageTitle><Empty>No week is open yet. The commissioner publishes each week&apos;s games before the first kickoff.</Empty></>);
  if (!row) return (<><PageTitle>{title}</PageTitle><Empty>{ctx.isGuest ? "Guests can't make picks." : "This entry isn't playing."}</Empty></>);

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
  const asTeam = (t: SvTeam): PickerTeam => ({ id: t.id, name: teamName(t), abbreviation: t.abbreviation, logo_url: t.logo_url, used: usedLabel(t) });
  const qs = (w: number) => `/p/${slug}/picks?week=${w}${behalf ? `&for=${target}` : ""}`;

  return (
    <>
      <PageTitle sub={outAlready ? `Eliminated in Week ${row.outWeek}.` : `${lives(row, settings.lives)}. One team to win; your pick locks when its game kicks off.`}>{title}</PageTitle>
      {counted.length > 1 && (
        <div className="-mx-4 mb-3 flex gap-1 overflow-x-auto px-4 py-1.5">
          {[...counted].reverse().map((w) => (
            <Link key={w.slateId} href={qs(w.week)} className={chipClass(w.slateId === week.slateId, "shrink-0", "sm")}>
              {w.label}
            </Link>
          ))}
        </div>
      )}
      {canPick ? (
        <SurvivorPicker
          key={`${week.slateId}:${pick?.teamId ?? ""}`}
          games={week.games
            .filter((g) => !g.voided)
            .map((g) => ({
              id: g.id,
              when: formatInTimeZone(g.startAt, tz, "EEE, MMM d · h:mm a"),
              // The commissioner can set a pick on a game that's started.
              locked: g.started && !behalf,
              home: asTeam(g.home),
              away: asTeam(g.away),
            }))}
          pick={pick ? { gameId: pick.gameId, teamId: pick.teamId } : null}
          pickLocked={Boolean(pickGame?.started) && !behalf}
          save={saveSurvivorPick.bind(null, slug, week.slateId, behalf ? target : null)}
        />
      ) : (
        <div className={card}>
          {cell?.team ? (
            <p className="flex items-center gap-3">
              <TeamLogo src={cell.team.logo_url} abbr={cell.team.abbreviation} className="size-9" />
              <span>
                <span className="block text-lg font-bold">{teamName(cell.team)}</span>
                <span className={`text-sm font-semibold ${cell.state === "win" ? "text-win" : cell.state === "loss" ? "text-loss" : "text-muted"}`}>
                  {cell.state === "win" ? "Won" : cell.state === "loss" ? "Lost" : cell.state === "void" ? "Game didn't count" : "In progress"}
                </span>
              </span>
            </p>
          ) : (
            <p className="text-sm text-muted">{outAlready ? "This entry was already out." : cell?.state === "missed" ? "No pick was made this week, which counts as a loss." : "No pick this week."}</p>
          )}
        </div>
      )}

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

export async function SurvivorStandingsPage({ ctx, slug }: { ctx: PoolBase; slug: string }) {
  const { settings, weeks, picks, members } = await getSurvivor(ctx);
  const rows = survivorStandings(weeks, picks, members, settings);
  const counted = weeks.filter((w) => w.week >= settings.start_week);
  const alive = rows.filter((r) => r.alive).length;
  return (
    <>
      <PageTitle sub={`${alive} of ${rows.length} still alive. Each week's pick shows once its game kicks off.`}>Standings</PageTitle>
      {rows.length === 0 ? (
        <Empty>No entries yet.</Empty>
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full border-separate border-spacing-x-1 border-spacing-y-1 text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="sticky left-0 z-10 bg-surface py-1 pr-2 text-left font-medium">Entry</th>
                <th className="whitespace-nowrap px-1 text-left font-medium">Status</th>
                {counted.map((w) => (
                  <th key={w.slateId} className="min-w-10 px-0.5 text-center font-medium tabular-nums" title={w.label}>W{w.week}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId} className={r.alive ? "" : "opacity-60"}>
                  <td className={`sticky left-0 z-10 max-w-40 truncate bg-surface py-1 pr-2 text-[15px] font-semibold ${r.userId === ctx.entryUserId ? "text-accent" : ""}`}>
                    {ctx.isCommissioner ? (
                      <Link href={`/p/${slug}/picks?for=${r.userId}`} className="hover:underline" title="Make or fix this entry's pick">{r.name}</Link>
                    ) : (
                      r.name
                    )}
                  </td>
                  <td className={`whitespace-nowrap px-1 text-xs font-semibold tabular-nums ${r.alive ? "text-win" : "text-muted"}`}>{lives(r, settings.lives)}</td>
                  {r.cells.map((c) => (
                    <td key={c.slateId}>
                      <Cell c={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
