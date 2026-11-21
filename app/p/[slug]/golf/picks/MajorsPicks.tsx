import { formatInTimeZone } from "date-fns-tz";
import { Countdown } from "@/components/Countdown";
import { GolfEventSelect } from "@/components/GolfEventSelect";
import { MajorPicker } from "@/components/MajorPicker";
import { Empty } from "@/components/ui";
import { tzAbbrev } from "@/lib/format";
import { type GolfContext, type GolfEvent, money } from "@/lib/golf";
import { getEventInfo } from "@/lib/golfEventInfo";
import { formatShown, formatToPar, golferShown, oddsKeyFor, posLabel, purseOverride, scoreLineup, withProjectedEarnings } from "@/lib/golfMajors";
import { loadFieldHistory, loadSeasonHistory } from "@/lib/golfFieldHistory";
import { getMajorField, getMajorResults, withLiveScores, getMajorsSettings, getVisibleLineups } from "@/lib/golfMajorsData";
import { saveGolfLineup } from "../actions";
import { ScorecardLink } from "@/components/ScorecardLink";
import { espnTournamentId } from "@/lib/golfLive";

/**
 * My Picks for a Majors pool: the major's field to pick from (tiers or salary cap) until it
 * locks; after that the entry's lineup with each golfer's score so far.
 */
export async function MajorsPicks({ slug, ctx, events, eventParam }: { slug: string; ctx: GolfContext; events: GolfEvent[]; eventParam?: string }) {
  if (!events.length) return <Empty>No majors are set up for this pool yet.</Empty>;
  // eslint-disable-next-line react-hooks/purity -- server render
  const now = Date.now();
  const s = getMajorsSettings(ctx);
  const isOpen = (e: GolfEvent) =>
    e.status === "scheduled" && !!e.start_at && now < Date.parse(e.start_at) && !!e.picks_open_at && Date.parse(e.picks_open_at) <= now;
  // The major to show: the one asked for; else one open for picks; else under way; else the next; else the last.
  const event =
    events.find((e) => e.id === eventParam) ??
    events.find(isOpen) ??
    events.find((e) => e.status === "in_progress") ??
    events.find((e) => e.status === "scheduled") ??
    events[events.length - 1];
  const [field, lineups, info] = await Promise.all([getMajorField(ctx, event.id), getVisibleLineups(ctx), getEventInfo([event], ctx.pool.slug)]);
  // The purse: the commissioner's, else ESPN's. Shown up top, and projected earnings come from it.
  const purse = purseOverride(ctx.pool.settings, event.id) ?? info.get(event.id)?.purse ?? null;
  const mine = lineups.filter((l) => l.event_id === event.id && l.user_id === ctx.entryUserId);
  const open = isOpen(event);
  const started = event.status === "in_progress" || event.status === "final" || (!!event.start_at && Date.parse(event.start_at) <= now);
  const who = ctx.managing ? `${ctx.managing.ownerName}'s Lineup` : "My Lineup";

  const head = (
    <div className="mb-3 flex shrink-0 flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold leading-tight tracking-[-0.03em]">My Picks</h1>
        <h2 className="text-lg font-bold leading-snug">
          {event.name}
          {purse && <span className="ml-2 whitespace-nowrap align-middle text-sm font-semibold text-muted">· {money(purse)} Purse</span>}
        </h2>
        <p className="text-xs text-muted">
          {event.start_at
            ? `${started ? "Locked" : "Locks"} ${formatInTimeZone(event.start_at, ctx.displayTz, "EEE, MMM d · h:mm a")} ${tzAbbrev(event.start_at, ctx.displayTz)}`
            : "Tee times not posted yet"}
          {open && event.start_at && (
            <>
              {" · "}
              <span className="font-semibold text-ink">
                <Countdown to={event.start_at} />
              </span>
            </>
          )}
        </p>
      </div>
      {events.length > 1 && <GolfEventSelect basePath={`/p/${slug}/golf/picks`} value={event.id} events={events.map((e) => ({ id: e.id, label: e.name }))} />}
    </div>
  );

  if (started) {
    const final = event.status === "final";
    // Live place and score straight from ESPN while it's being played (fresh on every visit).
    const raw = await withLiveScores(ctx, [event], await getMajorResults(ctx, [event.id]), new Set(lineups.filter((l) => l.event_id === event.id).map((l) => l.espn_golfer_id)));
    // Prize money projected from each golfer's place now and the purse, until it's posted.
    const results = withProjectedEarnings(raw.get(event.id) ?? [], purse, final);
    const byId = new Map(results.map((r) => [r.espn_golfer_id, r]));
    const score = scoreLineup(mine.map((l) => l.espn_golfer_id), results, s, final);
    const counts = new Map(score.golfers.map((g) => [g.espn_golfer_id, g.counts]));
    const salary = s.contest === "salary";
    // ESPN's tournament (or the demo's saved one) for the scorecard pop-ups.
    const tournamentId = espnTournamentId(event.espn_id, ctx.pool.slug, event.status);
    const shown = (id: string) => formatShown(golferShown(id, results, salary ? s : { ...s, tiers: { ...s.tiers, scoring: "to_par" } }, final));
    const cash = (id: string) => (byId.has(id) ? money(byId.get(id)!.earnings) : "–");
    // Totals of the golfers who count.
    const countedIds = mine.map((l) => l.espn_golfer_id).filter((id) => counts.get(id));
    const toParTotal = countedIds.reduce<number | null>((t, id) => {
      const v = golferShown(id, results, { ...s, contest: "tiers", tiers: { ...s.tiers, scoring: "to_par" } }, final).value;
      return v === null ? t : (t ?? 0) + v;
    }, null);
    const cashTotal = countedIds.reduce((t, id) => t + (byId.get(id)?.earnings ?? 0), 0);
    const th = "py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted";
    return (
      <div data-wide>
        {head}
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{who}</h3>
        {mine.length === 0 ? (
          <Empty>No lineup for this major.</Empty>
        ) : (
          <table className="w-full max-w-4xl table-fixed text-sm">
            {/* Fixed column widths: one line per golfer on every screen, the numbers spread evenly
                (wider apart on larger screens) and the name taking the rest. */}
            <thead>
              <tr className="border-b border-line text-left">
                <th className={`${th} ${salary ? "w-16" : "w-10 text-center"}`}>{salary ? "Salary" : "Tier"}</th>
                <th className={`${th} px-1.5`}>Golfer</th>
                <th className={`${th} w-12 text-center sm:w-20`}>Pos</th>
                <th className={`${th} w-14 text-center sm:w-20`}>{salary ? "Pts" : "Score"}</th>
                <th className={`${th} w-[5.5rem] pr-1 text-right sm:w-32`}>
                  {final ? "Earnings" : (
                    <>
                      <span className="sm:hidden">Proj. $</span>
                      <span className="hidden sm:inline">Proj. Earnings</span>
                    </>
                  )}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...mine]
                .sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0) || (b.salary ?? 0) - (a.salary ?? 0) || a.golfer_name.localeCompare(b.golfer_name))
                .map((l) => {
                  const r = byId.get(l.espn_golfer_id);
                  const counted = counts.get(l.espn_golfer_id);
                  return (
                    <tr key={l.espn_golfer_id} className={counted ? "" : "text-muted"}>
                      {/* Tiers: just the number, centered under the Tier title (one line). */}
                      <td className={`whitespace-nowrap py-2 text-xs tabular-nums text-muted ${salary ? "" : "text-center"}`}>
                        {salary ? `$${(l.salary ?? 0).toLocaleString("en-US")}` : l.tier}
                      </td>
                      <td className={`truncate px-1.5 py-2 ${counted ? "font-semibold" : "font-medium"}`}>
                        {/* Tap a golfer for their hole-by-hole scorecard. One line: the name shrinks to fit,
                            then shortens to first initial and last name; the cell's side padding leaves room
                            for the hover highlight. */}
                        <ScorecardLink
                          fit
                          golfer={{
                            id: l.espn_golfer_id,
                            name: l.golfer_name,
                            country: null,
                            flag: null,
                            pos: posLabel(r),
                            toPar: r?.to_par === null || r?.to_par === undefined ? null : r.to_par === 0 ? "E" : r.to_par > 0 ? `+${r.to_par}` : String(r.to_par),
                            thru: r?.thru === null || r?.thru === undefined ? null : r.thru >= 18 ? "F" : String(r.thru),
                            rounds: r?.rounds ?? [null, null, null, null],
                            today: null,
                            earnings: final ? (r?.earnings ?? 0) : 0,
                            projected: final ? null : (r?.earnings ?? null),
                            pickedBy: 0,
                            mine: true,
                          }}
                          tournamentId={tournamentId}
                          eventName={event.name}
                          live={event.status === "in_progress"}
                        />
                      </td>
                      <td className="whitespace-nowrap py-2 text-center text-xs tabular-nums text-muted">{posLabel(r)}</td>
                      <td className="whitespace-nowrap py-2 text-center font-semibold tabular-nums">{shown(l.espn_golfer_id)}</td>
                      <td className="whitespace-nowrap py-2 pr-1 text-right tabular-nums">{cash(l.espn_golfer_id)}</td>
                    </tr>
                  );
                })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink/25">
                <td colSpan={3} className="py-2 text-xs text-muted">
                  {counts.size && countedIds.length < mine.length ? `Total (the ${countedIds.length} that count)` : "Total"}
                </td>
                <td className="whitespace-nowrap py-2 text-center font-bold tabular-nums">{salary ? formatShown({ kind: "points", value: score.total }) : formatToPar(toParTotal)}</td>
                <td className="whitespace-nowrap py-2 pr-1 text-right font-bold tabular-nums">{money(cashTotal)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    );
  }

  if (!field.length || !open) {
    return (
      <div data-wide>
        {head}
        <Empty>
          {field.length ? "Picks for this major aren't open yet." : "The field for this major isn't set yet. It's posted the week before."}
          {mine.length > 0 && ` Your saved lineup: ${mine.map((l) => l.golfer_name).join(", ")}.`}
        </Empty>
      </div>
    );
  }

  // What the Odds column is: the hand-loaded blend (Winner, Top 5, Top 10) for a regular tour
  // event, or DraftKings' odds to win for a major.
  const oddsKey = oddsKeyFor(event);
  const { data: oddsRow } = oddsKey
    ? await ctx.supabase.from("golf_odds").select("bookmaker").eq("odds_key", oddsKey).limit(1).maybeSingle()
    : { data: null };
  const oddsNote = !field.some((g) => g.odds !== null)
    ? null
    : oddsRow?.bookmaker === "draftkings-blend"
      ? "Odds are a blend of DraftKings' odds to win, to finish Top 5 and to finish Top 10 (weighted 50%, 30% and 20%), shown as odds to win."
      : "Odds are DraftKings' odds to win.";

  return (
    // The full width of the screen; the page scrolls (no inner scroll boxes), Save pinned at the bottom.
    <div data-wide>
      {head}
      <MajorPicker
        oddsNote={oddsNote}
        contest={s.contest}
        golfers={field}
        picks={s.tiers.picks}
        budget={s.salary.budget}
        roster={s.salary.roster}
        initial={mine.map((l) => l.espn_golfer_id)}
        readOnly={ctx.isGuest}
        // Each golfer's past years at this major and every PGA Tour event this season (not awaited: the
        // field shows straight away and History opens without another request).
        history={loadFieldHistory(ctx, event, events, field.map((g) => g.espn_golfer_id), { allTourEvents: true })}
        season={loadSeasonHistory(ctx, field.map((g) => g.espn_golfer_id))}
        save={saveGolfLineup.bind(null, slug, event.id, ctx.managing?.ownerId ?? null)}
      />
    </div>
  );
}
