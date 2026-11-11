import type { Metadata } from "next";
import { Suspense } from "react";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { Countdown } from "@/components/Countdown";
import { GolfLiveTicker } from "@/components/GolfLiveTicker";
import { GolfPicker, type PickerGolfer } from "@/components/GolfPicker";
import { GolfPicksTabs } from "@/components/GolfPicksTabs";
import { Empty, PageTitle } from "@/components/ui";
import {
  finishLabel,
  getGolfContext,
  getGolfEvents,
  getGolfMyPicks,
  getGolfPickResults,
  getMissedPickValues,
  getGolfResults,
  golfWeek,
  isOpenForPicks,
  opensLater,
  picksOpenAt,
  money,
  type GolfContext,
  type GolfEvent,
  type GolfPick,
} from "@/lib/golf";
import { loadFieldHistory } from "@/lib/golfFieldHistory";
import { getLiveLeaderboard } from "@/lib/golfLive";
import { tzAbbrev } from "@/lib/format";
import { getEventInfo, shortPurse } from "@/lib/golfEventInfo";
import { SignatureTag } from "@/components/SignatureTag";
import { getWorldRankMap, golferKey } from "@/lib/worldRankings";
import { saveGolfPick } from "../actions";

export const metadata: Metadata = { title: "My Picks" };

export default async function GolfPicksPage({ params }: PageProps<"/p/[slug]/golf/picks">) {
  const { slug } = await params;
  const ctx = await getGolfContext(slug);
  const [events, myPicks] = await Promise.all([getGolfEvents(ctx), getGolfMyPicks(ctx)]);
  // Server render time is fine here; the countdown itself ticks client-side.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  if (events.length === 0) {
    return (
      <>
        <PageTitle>My Picks</PageTitle>
        <Empty>No events are set up for this pool yet.</Empty>
      </>
    );
  }

  const week = golfWeek(events, now);
  // The tournament to pick for: one open for picks (normally the week's own, from Monday 7 a.m.),
  // else the week's event (under way, or not open yet).
  const openNow = events.find((e) => isOpenForPicks(e, now));
  const current = openNow ?? week.current;
  // Week numbers count the season's events in order, skipping canceled ones.
  const counted = events.filter((e) => e.status !== "canceled");
  const weekOf = new Map(counted.map((e, i) => [e.id, i + 1]));
  const pickByEvent = new Map<string, GolfPick>(myPicks.map((p) => [p.event_id, p] as [string, GolfPick]));
  const results = await getGolfPickResults(ctx, myPicks);
  // Each tournament's purse and Signature status (ESPN), for this week's event and the schedule.
  const info = await getEventInfo(counted.filter((e) => e.status === "scheduled" || e.id === current?.id), ctx.pool.slug);
  // What a week with no pick earned, under the commissioner's rule ($0 or the week's lowest).
  const missedValue = await getMissedPickValues(
    ctx,
    counted.filter((e) => e.status === "final" && !myPicks.some((p) => p.event_id === e.id)).map((e) => e.id),
  );

  const played = counted.filter((e) => e.status === "final" || e.status === "in_progress");
  const upcoming = counted.filter((e) => e.status === "scheduled" && e.id !== current?.id);
  const used = myPicks
    .filter((p) => weekOf.has(p.event_id))
    .map((p) => ({ ...p, week: weekOf.get(p.event_id)! }))
    .sort((a, b) => a.week - b.week);

  // Running season total: prize money counts once an event is final.
  let total = 0;
  const log = played.map((ev) => {
    const pick = pickByEvent.get(ev.id);
    const result = pick ? results.get(`${ev.id}|${pick.espn_golfer_id}`) : undefined;
    const earned = ev.status === "final" ? (pick ? (result?.earnings ?? 0) : (missedValue.get(ev.id) ?? 0)) : 0;
    total += earned;
    return { ev, pick, result, earned, total };
  });

  return (
    <div data-wide>
      {/* The same scroll as Home: last week's finish, tee times, or the live leaderboard. */}
      <Suspense fallback={<div className="mb-4 h-7" />}>
        <div className="mb-4">
          <GolfLiveTicker ctx={ctx} />
        </div>
      </Suspense>
      <PageTitle sub={ctx.managing ? `Co-managing ${ctx.managing.ownerName}'s entry` : undefined}>
        My Picks
      </PageTitle>
      {ctx.isGuest && <p className="mb-4 text-sm text-muted">Guests can view picks but can&apos;t make them.</p>}

      <GolfPicksTabs
        thisWeek={
          current ? (
            <ThisWeek ctx={ctx} slug={slug} event={current} purse={info.get(current.id)?.purse ?? null} signature={info.get(current.id)?.signature ?? false} weekNumber={events.filter((e) => e.status !== "canceled").indexOf(current) + 1} weeks={week.weeks} pick={pickByEvent.get(current.id)} used={used} now={now} />
          ) : (
            <p className="text-sm text-muted">The season is over. Thanks for playing.</p>
          )
        }
        // Every event played so far, which is also the list of golfers used.
        log={
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-xs text-muted">
                {used.length} of {counted.length} weeks picked
              </span>
              <span>
                <span className="text-muted">Season total </span>
                <span className="font-bold tabular-nums">{money(total)}</span>
              </span>
            </div>
            {log.length === 0 ? (
              <p className="mt-2 border-y border-line py-3 text-sm text-muted">No events have been played yet.</p>
            ) : (
              <div className="mt-2 overflow-x-auto border-y border-line">
                {/* Phones: smaller type and tighter columns so it fits without scrolling sideways. */}
                <table className="w-full table-fixed text-xs sm:table-auto sm:text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="w-7 py-2 pr-1 font-medium sm:w-10 sm:pr-2">Wk</th>
                      <th className="py-2 pr-2 font-medium sm:pr-3">Tournament</th>
                      <th className="py-2 pr-2 font-medium sm:pr-3">Golfer</th>
                      <th className="w-12 py-2 pr-2 font-medium sm:w-auto sm:pr-3">Finish</th>
                      <th className="w-[5.5rem] py-2 text-right font-medium sm:w-auto">Earnings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {log.map(({ ev, pick, result, earned }) => {
                      const final = ev.status === "final";
                      return (
                        <tr key={ev.id}>
                          <td className="py-2 pr-1 tabular-nums text-muted sm:pr-2">{weekOf.get(ev.id)}</td>
                          <td className="truncate py-2 pr-2 sm:max-w-[11rem] sm:pr-3">{ev.name}</td>
                          <td className={`break-words py-2 leading-snug pr-2 sm:pr-3 ${pick ? "font-medium" : "text-muted"}`}>{pick ? pick.golfer_name : "No Pick"}</td>
                          <td className="py-2 pr-2 tabular-nums text-muted sm:pr-3">
                            {pick ? finishLabel(result?.pos, final) : ""}
                            {!final && <span className="ml-1 text-xs text-live">Live</span>}
                          </td>
                          <td className={`py-2 text-right tabular-nums ${earned > 0 ? "font-semibold" : "text-muted"}`}>{final ? money(earned) : "–"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        }
        // The rest of the schedule.
        upcoming={
          <>
            <div className="text-xs text-muted">{upcoming.length} to go</div>
            {upcoming.length === 0 ? (
              <p className="mt-2 border-y border-line py-3 text-sm text-muted">Nothing after this week.</p>
            ) : (
              <div className="mt-2 border-y border-line">
                {/* Column titles, lined up with the rows below. */}
                <div className="flex items-end gap-2.5 border-b border-line pb-1.5 pt-2 text-[11px] font-medium text-muted" aria-hidden>
                  <span className="w-10">Wk</span>
                  <span className="min-w-0 flex-1">Tournament</span>
                  <span className="w-14 text-right">Purse</span>
                  <span className="w-[4.5rem] text-right">Start Date</span>
                </div>
                <ol className="divide-y divide-line">
                  {upcoming.map((ev) => {
                    const i = info.get(ev.id);
                    // The first tee time once posted; before that ESPN's start date for the event.
                    const start = ev.start_at ? formatInTimeZone(ev.start_at, ctx.displayTz, "EEE MMM d") : i?.startDate ? formatInTimeZone(fromZonedTime(`${i.startDate}T12:00:00`, "America/New_York"), "America/New_York", "EEE MMM d") : "TBA";
                    return (
                      <li key={ev.id} className="flex min-h-9 items-center gap-2.5 py-1.5 text-sm">
                        <span className="w-10 text-xs tabular-nums text-muted">Wk {weekOf.get(ev.id)}</span>
                        <span className="flex min-w-0 flex-1 items-center gap-1.5">
                          <span className="min-w-0 truncate">{ev.name}</span>
                          {i?.signature && <SignatureTag />}
                        </span>
                        <span className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums" title={i?.purse ? `Purse ${money(i.purse)}` : undefined}>
                          {i?.purse ? shortPurse(i.purse) : <span className="font-normal text-faint">–</span>}
                        </span>
                        <span className="w-[4.5rem] shrink-0 text-right text-xs tabular-nums text-muted">{start}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </>
        }
      />
    </div>
  );
}

/** The current event: its lock, the entry's pick, and (while open) the field to pick from. */
async function ThisWeek({
  ctx,
  slug,
  event,
  purse,
  signature,
  weekNumber,
  weeks,
  pick,
  used,
  now,
}: {
  ctx: GolfContext;
  slug: string;
  event: GolfEvent;
  /** The tournament's purse, when ESPN gives one. */
  purse: number | null;
  /** A PGA Tour Signature Event. */
  signature: boolean;
  weekNumber: number;
  weeks: number;
  pick: GolfPick | undefined;
  used: (GolfPick & { week: number })[];
  now: number;
}) {
  const open = isOpenForPicks(event, now);
  const canPick = open && !ctx.isGuest;

  return (
    <>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">
        Week {weekNumber} of {weeks}
        {event.status === "in_progress" && <span className="ml-2 normal-case tracking-normal text-live">● Under Way</span>}
      </div>
      <h2 className="mt-0.5 text-xl font-bold leading-snug">
        {event.name}
        {/* The purse, so bigger-money weeks stand out. */}
        {purse && <span className="ml-2 whitespace-nowrap align-middle text-sm font-semibold text-muted">· {money(purse)} Purse</span>}
        {signature && <SignatureTag className="ml-2 align-middle" />}
      </h2>
      <p className="text-xs text-muted">
        {event.start_at
          ? `Tournament Locks ${formatInTimeZone(event.start_at, ctx.displayTz, "EEE, MMM d · h:mm a")} ${tzAbbrev(event.start_at, ctx.displayTz)}`
          : "Tee Times Not Posted Yet · Picks Open Monday of Tournament Week, 7 AM Central"}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-4 border-y border-line py-3">
        <div className="min-w-0">
          <div className="text-xs text-muted">{ctx.managing ? `${ctx.managing.ownerName}'s pick` : "My Pick"}</div>
          <div className={`mt-0.5 break-words text-base font-bold leading-snug ${pick ? "" : "text-muted"}`}>
            {pick ? pick.golfer_name : ctx.isGuest ? "–" : open ? "Not Picked" : "None"}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">{open ? "Picks Lock" : opensLater(event, now) ? "Picks Open" : "Picks"}</div>
          <div className="mt-0.5 text-base font-bold leading-snug tabular-nums">
            {open && event.start_at ? (
              <Countdown to={event.start_at} done="locked" />
            ) : opensLater(event, now) ? (
              `${formatInTimeZone(picksOpenAt(event)!, ctx.displayTz, "EEE h:mm a")} ${tzAbbrev(picksOpenAt(event)!, ctx.displayTz)}`
            ) : event.start_at ? (
              "Locked"
            ) : (
              "Not Open"
            )}
          </div>
        </div>
      </div>

      {canPick && (
        <Suspense fallback={<p className="mt-4 text-sm text-muted">Loading the field…</p>}>
          <Field ctx={ctx} slug={slug} event={event} pick={pick} used={used} />
        </Suspense>
      )}
    </>
  );
}

/**
 * The open event's field with each golfer's tee time (ESPN's live page, or the pool's stored
 * times for demo events) and world rank, and the week this entry already used them.
 */
async function Field({
  ctx,
  slug,
  event,
  pick,
  used,
}: {
  ctx: GolfContext;
  slug: string;
  event: GolfEvent;
  pick: GolfPick | undefined;
  used: (GolfPick & { week: number })[];
}) {
  const [field, live, ranks] = await Promise.all([getGolfResults(ctx, event.id), getLiveLeaderboard(event.espn_id, 600), getWorldRankMap()]);
  if (field.length === 0) return <p className="mt-4 text-sm text-muted">The field hasn&apos;t been posted yet.</p>;

  // Past results for the whole field, loaded once here and streamed to the page when ready
  // (not awaited: the field shows straight away, and History opens without another request).
  const history = loadFieldHistory(ctx, event, await getGolfEvents(ctx), field.map((g) => g.espn_golfer_id));

  const liveTee = new Map((live ?? []).map((g) => [g.id, g.tee]));
  const usedWeek = new Map(used.filter((p) => p.event_id !== event.id).map((p) => [p.espn_golfer_id, p.week]));
  const golfers: PickerGolfer[] = field.map((g) => {
    const tee = liveTee.get(g.espn_golfer_id) ?? g.tee_at;
    return {
      id: g.espn_golfer_id,
      name: g.golfer_name,
      lastName: g.golfer_name.split(" ").slice(-1)[0],
      tee: tee ?? null,
      teeLabel: tee ? formatInTimeZone(tee, ctx.displayTz, "EEE h:mm a") : null,
      rank: ranks.get(golferKey(g.golfer_name)) ?? null,
      usedWeek: usedWeek.get(g.espn_golfer_id) ?? null,
    };
  });

  return (
    <GolfPicker
      action={saveGolfPick.bind(null, slug, event.id)}
      golfers={golfers}
      currentId={pick?.espn_golfer_id ?? null}
      forUserId={ctx.managing ? ctx.entryUserId : null}
      history={history}
    />
  );
}
