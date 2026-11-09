import type { Metadata } from "next";
import Link from "next/link";
import { Panel, PageTitle, SectionLabel } from "@/components/ui";
import { gameTime } from "@/lib/format";
import {
  getGolfContext,
  getGolfEvents,
  getGolfMyPicks,
  getGolfStandings,
  isOpenForPicks,
  money,
} from "@/lib/golf";

export const metadata: Metadata = { title: "Home" };

export default async function GolfHomePage({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const ctx = await getGolfContext(slug);
  const [events, myPicks, standings] = await Promise.all([
    getGolfEvents(ctx),
    getGolfMyPicks(ctx),
    getGolfStandings(ctx),
  ]);
  const now = Date.now();
  const next = events.find((ev) => isOpenForPicks(ev, now)) ?? events.find((ev) => ev.status === "in_progress");
  const nextPick = next ? myPicks.find((p) => p.event_id === next.id) : undefined;
  const mine = standings.find((s) => s.user_id === ctx.entryUserId);
  const place = mine ? standings.findIndex((s) => s.user_id === ctx.entryUserId) + 1 : null;

  return (
    <>
      <PageTitle sub={ctx.pool.name}>Home</PageTitle>

      <div className="grid gap-3 sm:grid-cols-2">
        <Panel className="p-4">
          <SectionLabel>Next event</SectionLabel>
          {next ? (
            <>
              <p className="mt-2 font-semibold">{next.name}</p>
              <p className="text-sm text-muted">
                {next.start_at ? `Locks at first tee, ${gameTime(next.start_at, ctx.displayTz)}` : "Tee time not posted yet"}
              </p>
              <p className="mt-2 text-sm">
                {nextPick ? (
                  <>
                    <span className="text-muted">Your pick: </span>
                    {nextPick.golfer_name}
                  </>
                ) : (
                  <span className="text-muted">No pick yet.</span>
                )}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">No open events right now.</p>
          )}
          <Link href={`/p/${slug}/golf/picks`} className="mt-3 inline-block text-sm font-medium text-accent">
            Go to My Picks
          </Link>
        </Panel>

        <Panel className="p-4">
          <SectionLabel>Season prize money</SectionLabel>
          {mine ? (
            <>
              <p className="mt-2 text-2xl font-semibold">{money(mine.season_earnings)}</p>
              <p className="text-sm text-muted">
                {place ? `${place} of ${standings.length}` : ""} · {mine.events_picked} event{mine.events_picked === 1 ? "" : "s"} picked
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">No standings yet.</p>
          )}
          <Link href={`/p/${slug}/golf/standings`} className="mt-3 inline-block text-sm font-medium text-accent">
            View standings
          </Link>
        </Panel>
      </div>
    </>
  );
}
