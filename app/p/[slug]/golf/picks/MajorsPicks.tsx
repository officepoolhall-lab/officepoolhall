import { formatInTimeZone } from "date-fns-tz";
import { Countdown } from "@/components/Countdown";
import { GolfEventSelect } from "@/components/GolfEventSelect";
import { MajorPicker } from "@/components/MajorPicker";
import { Empty } from "@/components/ui";
import { tzAbbrev } from "@/lib/format";
import { type GolfContext, type GolfEvent, money } from "@/lib/golf";
import { fantasyPoints, formatToPar, toParScores } from "@/lib/golfMajors";
import { loadFieldHistory } from "@/lib/golfFieldHistory";
import { getMajorField, getMajorResults, getMajorsSettings, getVisibleLineups } from "@/lib/golfMajorsData";
import { saveGolfLineup } from "../actions";

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
  const [field, lineups] = await Promise.all([getMajorField(ctx, event.id), getVisibleLineups(ctx)]);
  const mine = lineups.filter((l) => l.event_id === event.id && l.user_id === ctx.entryUserId);
  const open = isOpen(event);
  const started = event.status === "in_progress" || event.status === "final" || (!!event.start_at && Date.parse(event.start_at) <= now);
  const who = ctx.managing ? `${ctx.managing.ownerName}'s Lineup` : "My Lineup";

  const head = (
    <div className="mb-3 flex shrink-0 flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold leading-tight tracking-[-0.03em]">My Picks</h1>
        <h2 className="text-lg font-bold leading-snug">{event.name}</h2>
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
        <p className="text-xs text-muted">{rulesLine(s)}</p>
      </div>
      {events.length > 1 && <GolfEventSelect basePath={`/p/${slug}/golf/picks`} value={event.id} events={events.map((e) => ({ id: e.id, label: e.name }))} />}
    </div>
  );

  if (started) {
    const results = (await getMajorResults(ctx, [event.id])).get(event.id) ?? [];
    const byId = new Map(results.map((r) => [r.espn_golfer_id, r]));
    const tp = toParScores(results);
    const final = event.status === "final";
    const value = (id: string) => {
      const r = byId.get(id);
      if (!r) return "–";
      if (s.contest === "salary") return `${fantasyPoints(r, final).total.toFixed(1).replace(/\.0$/, "")} pts`;
      if (s.tiers.scoring === "earnings") return r.earnings ? money(r.earnings) : "$0";
      return formatToPar(tp.get(id) ?? null);
    };
    return (
      <div data-wide>
        {head}
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{who}</h3>
        {mine.length === 0 ? (
          <Empty>No lineup for this major.</Empty>
        ) : (
          // Across the screen in columns on wider screens.
          <ul className="grid border-t border-line sm:grid-cols-2 sm:gap-x-6 xl:grid-cols-4 [&>li]:border-b [&>li]:border-line">
            {[...mine]
              .sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0) || (b.salary ?? 0) - (a.salary ?? 0))
              .map((l) => {
                const r = byId.get(l.espn_golfer_id);
                return (
                  <li key={l.espn_golfer_id} className="flex min-h-11 items-center gap-2 py-1.5 text-sm">
                    <span className="w-14 shrink-0 text-xs tabular-nums text-muted">{s.contest === "salary" ? `$${(l.salary ?? 0).toLocaleString("en-US")}` : `Tier ${l.tier}`}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{l.golfer_name}</span>
                    <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">{r?.out ? (r.pos && !/^\d|^T/.test(r.pos) ? r.pos : "MC") : (r?.pos ?? "")}</span>
                    <span className="w-20 shrink-0 text-right font-semibold tabular-nums">{value(l.espn_golfer_id)}</span>
                  </li>
                );
              })}
          </ul>
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

  return (
    // The full width of the screen; the page scrolls (no inner scroll boxes), Save pinned at the bottom.
    <div data-wide>
      {head}
      <MajorPicker
        contest={s.contest}
        golfers={field}
        picks={s.tiers.picks}
        budget={s.salary.budget}
        roster={s.salary.roster}
        initial={mine.map((l) => l.espn_golfer_id)}
        readOnly={ctx.isGuest}
        // Each golfer's past years at this major and this season's majors (not awaited: the
        // field shows straight away and History opens without another request).
        history={loadFieldHistory(ctx, event, events, field.map((g) => g.espn_golfer_id))}
        save={saveGolfLineup.bind(null, slug, event.id, ctx.managing?.ownerId ?? null)}
      />
    </div>
  );
}

function rulesLine(s: ReturnType<typeof getMajorsSettings>) {
  if (s.contest === "salary") return `${s.salary.roster} golfers under $${s.salary.budget.toLocaleString("en-US")} · DraftKings scoring`;
  const total = s.tiers.picks.reduce((a, b) => a + b, 0);
  const pickText = s.tiers.picks.every((n) => n === s.tiers.picks[0])
    ? `${s.tiers.picks[0]} from each of ${s.tiers.count} tiers`
    : `${s.tiers.picks.map((n, i) => `${n} from Tier ${i + 1}`).join(", ")}`;
  return `${pickText} · best ${s.tiers.counting} of ${total} count · ${s.tiers.scoring === "earnings" ? "prize money" : "score to par"}`;
}
