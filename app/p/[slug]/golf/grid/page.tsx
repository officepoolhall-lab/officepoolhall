import type { Metadata } from "next";
import { Empty, PageTitle, Panel } from "@/components/ui";
import { gameTime } from "@/lib/format";
import {
  getGolfContext,
  getGolfEvents,
  getGolfMembers,
  getGolfStandings,
  getGolfVisiblePicks,
  isOpenForPicks,
  money,
} from "@/lib/golf";

export const metadata: Metadata = { title: "League Grid" };

/**
 * Every entry's golfer for each event. The database shows a pick to the pool only after that
 * event's first tee time, so an open event's column stays hidden for others.
 */
export default async function GolfGridPage({ params }: PageProps<"/p/[slug]/golf/grid">) {
  const { slug } = await params;
  const ctx = await getGolfContext(slug);
  const [events, members, picks, standings] = await Promise.all([
    getGolfEvents(ctx),
    getGolfMembers(ctx),
    getGolfVisiblePicks(ctx),
    getGolfStandings(ctx),
  ]);
  const now = Date.now();
  const pickFor = new Map<string, string>(picks.map((p) => [`${p.event_id}:${p.user_id}`, p.golfer_name] as [string, string]));
  const earningsByUser = new Map<string, number>(standings.map((s) => [s.user_id, s.season_earnings] as [string, number]));

  return (
    <>
      <PageTitle sub="Each entry's golfer by event. Picks show after the event's first tee time.">League Grid</PageTitle>
      {events.length === 0 ? (
        <Empty>No events are set up for this pool yet.</Empty>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="sticky left-0 bg-surface px-3 py-2 font-medium">Event</th>
                {members.map((m) => (
                  <th key={m.user_id} className="px-3 py-2 font-medium">
                    {m.display_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => {
                const open = isOpenForPicks(ev, now);
                return (
                  <tr key={ev.id} className="border-b border-line last:border-0">
                    <td className="sticky left-0 bg-surface px-3 py-2">
                      <div className="font-medium">{ev.name}</div>
                      <div className="text-xs text-muted">
                        {ev.start_at ? gameTime(ev.start_at, ctx.displayTz) : "TBA"}
                      </div>
                    </td>
                    {members.map((m) => {
                      const key = `${ev.id}:${m.user_id}`;
                      const golfer = pickFor.get(key);
                      const shown = golfer ?? (open ? "" : "No pick");
                      return (
                        <td key={m.user_id} className="px-3 py-2 text-muted">
                          {open && golfer ? <span className="text-xs italic">Hidden</span> : shown}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr>
                <td className="sticky left-0 bg-surface px-3 py-2 font-semibold">Season</td>
                {members.map((m) => (
                  <td key={m.user_id} className="px-3 py-2 font-semibold">
                    {money(earningsByUser.get(m.user_id) ?? 0)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}
