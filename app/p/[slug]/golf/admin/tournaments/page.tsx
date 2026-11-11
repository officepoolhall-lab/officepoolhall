import type { Metadata } from "next";
import { formatInTimeZone } from "date-fns-tz";
import { GolfEventAdminRow } from "@/components/GolfEventAdminRow";
import { Empty } from "@/components/ui";
import { tzAbbrev } from "@/lib/format";
import { getGolfContext, getGolfEvents } from "@/lib/golf";
import { updateGolfEvent } from "../actions";

export const metadata: Metadata = { title: "Tournaments" };

const STATUS: Record<string, string> = { scheduled: "Upcoming", in_progress: "Under Way", final: "Final", canceled: "Canceled" };

/**
 * The season's tournaments. Lock times, status and results come from ESPN every 10 minutes;
 * the commissioner can rename one (the TBD slot), close one under way as final (a tournament
 * cut short by weather), or cancel / restore one.
 */
export default async function GolfTournamentsPage({ params }: PageProps<"/p/[slug]/golf/admin/tournaments">) {
  const { slug } = await params;
  const ctx = await getGolfContext(slug);
  const events = await getGolfEvents(ctx);
  if (events.length === 0) return <Empty>No tournaments are set up for this pool yet.</Empty>;
  let week = 0;

  return (
    <>
      <p className="mb-3 text-sm text-muted">Lock times, status and results update from ESPN every 10 minutes.</p>
      <ol className="divide-y divide-line border-y border-line">
        {events.map((ev) => {
          if (ev.status !== "canceled") week++;
          return (
            <li key={ev.id} className="grid gap-1 py-3 sm:grid-cols-[3.5rem_minmax(0,1fr)_14rem_6rem] sm:items-center sm:gap-3">
              <span className="text-xs tabular-nums text-muted">{ev.status === "canceled" ? "—" : `Wk ${week}`}</span>
              <GolfEventAdminRow name={ev.name} status={ev.status} action={updateGolfEvent.bind(null, slug, ev.id)} />
              <span className="text-xs tabular-nums text-muted">
                {ev.start_at ? `Locks ${formatInTimeZone(ev.start_at, ctx.displayTz, "EEE MMM d, h:mm a")} ${tzAbbrev(ev.start_at, ctx.displayTz)}` : "Tee Times Not Posted"}
              </span>
              <span className={`text-xs font-semibold ${ev.status === "in_progress" ? "text-live" : ev.status === "canceled" ? "text-loss" : "text-muted"}`}>{STATUS[ev.status]}</span>
            </li>
          );
        })}
      </ol>
    </>
  );
}
