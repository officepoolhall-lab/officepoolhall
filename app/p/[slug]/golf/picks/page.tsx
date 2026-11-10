import type { Metadata } from "next";
import { Suspense } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { Countdown } from "@/components/Countdown";
import { GolfPicker, type PickerGolfer } from "@/components/GolfPicker";
import { Empty, PageTitle, SectionLabel } from "@/components/ui";
import {
  finishLabel,
  getGolfContext,
  getGolfEvents,
  getGolfMyPicks,
  getGolfPickResults,
  getGolfResults,
  golfWeek,
  isOpenForPicks,
  money,
  type GolfContext,
  type GolfEvent,
  type GolfPick,
} from "@/lib/golf";
import { getLiveLeaderboard, getLivePickLine } from "@/lib/golfLive";
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
  const current = week.current;
  // Week numbers count the season's events in order, skipping canceled ones.
  const counted = events.filter((e) => e.status !== "canceled");
  const weekOf = new Map(counted.map((e, i) => [e.id, i + 1]));
  const pickByEvent = new Map<string, GolfPick>(myPicks.map((p) => [p.event_id, p] as [string, GolfPick]));
  const results = await getGolfPickResults(ctx, myPicks);

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
    const earned = ev.status === "final" ? (result?.earnings ?? 0) : 0;
    total += earned;
    return { ev, pick, result, earned, total };
  });

  return (
    <div data-wide>
      <PageTitle sub={ctx.managing ? `Co-managing ${ctx.managing.ownerName}'s entry` : "One golfer per event. Each golfer can be used once per season."}>
        My Picks
      </PageTitle>
      {ctx.isGuest && <p className="mb-4 text-sm text-muted">Guests can view picks but can&apos;t make them.</p>}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="space-y-8">
          {/* 1. This week: the event, the entry's pick, and the field to choose from. */}
          <section aria-labelledby="this-week">
            {current ? (
              <ThisWeek ctx={ctx} slug={slug} event={current} weekNumber={week.weekNumber!} weeks={week.weeks} pick={pickByEvent.get(current.id)} used={used} now={now} />
            ) : (
              <>
                <SectionLabel>
                  <span id="this-week">This week</span>
                </SectionLabel>
                <p className="mt-2 text-sm text-muted">The season is over. Thanks for playing.</p>
              </>
            )}
          </section>

          {/* 2. Season log: every event played so far. */}
          <section aria-labelledby="season-log">
            <div className="flex items-baseline justify-between gap-3">
              <SectionLabel>
                <span id="season-log">Season log</span>
              </SectionLabel>
              <span className="text-sm">
                <span className="text-muted">Season total </span>
                <span className="font-bold tabular-nums">{money(total)}</span>
              </span>
            </div>
            {log.length === 0 ? (
              <p className="mt-2 border-y border-line py-3 text-sm text-muted">No events have been played yet.</p>
            ) : (
              <div className="mt-2 overflow-x-auto border-y border-line">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="w-10 py-2 pr-2 font-medium">Wk</th>
                      <th className="py-2 pr-3 font-medium">Tournament</th>
                      <th className="py-2 pr-3 font-medium">Golfer</th>
                      <th className="py-2 pr-3 font-medium">Finish</th>
                      <th className="py-2 text-right font-medium">Earnings</th>
                      <th className="hidden py-2 pl-3 text-right font-medium sm:table-cell">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {log.map(({ ev, pick, result, earned, total: running }) => {
                      const final = ev.status === "final";
                      return (
                        <tr key={ev.id}>
                          <td className="py-2 pr-2 tabular-nums text-muted">{weekOf.get(ev.id)}</td>
                          <td className="max-w-[11rem] truncate py-2 pr-3">{ev.name}</td>
                          <td className={`py-2 pr-3 ${pick ? "font-medium" : "text-muted"}`}>{pick ? pick.golfer_name : "No pick"}</td>
                          <td className="py-2 pr-3 tabular-nums text-muted">
                            {pick ? finishLabel(result?.pos, final) : ""}
                            {!final && <span className="ml-1 text-xs text-live">Live</span>}
                          </td>
                          <td className={`py-2 text-right tabular-nums ${earned > 0 ? "font-semibold" : "text-muted"}`}>{final ? money(earned) : "–"}</td>
                          <td className="hidden py-2 pl-3 text-right tabular-nums text-muted sm:table-cell">{money(running)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="space-y-8">
          {/* 4. Golfers used: who's gone for the rest of the season. */}
          <section aria-labelledby="used">
            <div className="flex items-baseline justify-between gap-3">
              <SectionLabel>
                <span id="used">Golfers used</span>
              </SectionLabel>
              <span className="text-xs text-muted">
                {used.length} of {counted.length} weeks picked
              </span>
            </div>
            {used.length === 0 ? (
              <p className="mt-2 border-y border-line py-3 text-sm text-muted">None yet. Everyone is available.</p>
            ) : (
              <ol className="mt-2 divide-y divide-line border-y border-line">
                {used.map((p) => (
                  <li key={p.event_id} className="flex min-h-9 items-center gap-2.5 py-1.5 text-sm">
                    <span className="w-10 text-xs tabular-nums text-muted">Wk {p.week}</span>
                    <span className="min-w-0 flex-1 truncate">{p.golfer_name}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* 3. Upcoming: the rest of the schedule. */}
          <section aria-labelledby="upcoming">
            <div className="flex items-baseline justify-between gap-3">
              <SectionLabel>
                <span id="upcoming">Upcoming</span>
              </SectionLabel>
              <span className="text-xs text-muted">{upcoming.length} to go</span>
            </div>
            {upcoming.length === 0 ? (
              <p className="mt-2 border-y border-line py-3 text-sm text-muted">Nothing after this week.</p>
            ) : (
              <ol className="mt-2 divide-y divide-line border-y border-line">
                {upcoming.map((ev) => (
                  <li key={ev.id} className="flex min-h-9 items-center gap-2.5 py-1.5 text-sm">
                    <span className="w-10 text-xs tabular-nums text-muted">Wk {weekOf.get(ev.id)}</span>
                    <span className="min-w-0 flex-1 truncate">{ev.name}</span>
                    <span className="shrink-0 text-xs text-muted">{ev.start_at ? formatInTimeZone(ev.start_at, ctx.displayTz, "MMM d") : "TBA"}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/** The current event: its lock, the entry's pick, and (while open) the field to pick from. */
async function ThisWeek({
  ctx,
  slug,
  event,
  weekNumber,
  weeks,
  pick,
  used,
  now,
}: {
  ctx: GolfContext;
  slug: string;
  event: GolfEvent;
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
        <span id="this-week">
          Week {weekNumber} of {weeks}
        </span>
        {event.status === "in_progress" && <span className="ml-2 normal-case tracking-normal text-live">● Under way</span>}
      </div>
      <h2 className="mt-0.5 text-xl font-bold leading-snug">{event.name}</h2>
      <p className="text-xs text-muted">
        {event.start_at
          ? `First tee ${formatInTimeZone(event.start_at, ctx.displayTz, "EEE, MMM d · h:mm a")}`
          : "Tee times not posted yet. Picks open once they are."}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-4 border-y border-line py-3">
        <div className="min-w-0">
          <div className="text-xs text-muted">{ctx.managing ? `${ctx.managing.ownerName}'s pick` : "My Pick"}</div>
          <div className={`mt-0.5 truncate text-2xl font-extrabold tracking-[-0.02em] ${pick ? "" : "text-muted"}`}>
            {pick ? pick.golfer_name : ctx.isGuest ? "–" : open ? "Not picked" : "None"}
          </div>
          {pick && event.status === "in_progress" && (
            <Suspense fallback={null}>
              <LiveLine espnId={event.espn_id} golferId={pick.espn_golfer_id} />
            </Suspense>
          )}
        </div>
        <div>
          <div className="text-xs text-muted">{open ? "Picks Lock" : "Picks"}</div>
          <div className="mt-0.5 text-2xl font-extrabold tracking-[-0.02em] tabular-nums">
            {open && event.start_at ? <Countdown to={event.start_at} done="locked" /> : event.start_at ? "Locked" : "Not open"}
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

async function LiveLine({ espnId, golferId }: { espnId: string; golferId: string }) {
  const line = await getLivePickLine(espnId, golferId);
  return line ? <div className="text-xs tabular-nums text-muted">{line}</div> : null;
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
    />
  );
}
