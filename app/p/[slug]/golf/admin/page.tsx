import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Empty, PageTitle, Panel } from "@/components/ui";
import { gameTime } from "@/lib/format";
import { getGolfContext, getGolfEvents } from "@/lib/golf";

export const metadata: Metadata = { title: "Admin" };

/** Commissioner view of the event list. Start times and results refresh on their own. */
export default async function GolfAdminPage({ params }: PageProps<"/p/[slug]/golf/admin">) {
  const { slug } = await params;
  const ctx = await getGolfContext(slug);
  if (!ctx.isCommissioner) notFound();
  const events = await getGolfEvents(ctx);

  return (
    <>
      <PageTitle sub="Event times and results refresh automatically from ESPN every 10 minutes.">Admin</PageTitle>
      {events.length === 0 ? (
        <Empty>No events are set up for this pool yet.</Empty>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="px-3 py-2 font-medium">Lock (first tee)</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">ESPN</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 text-muted">{ev.sort_order}</td>
                  <td className="px-3 py-2 font-medium">{ev.name}</td>
                  <td className="px-3 py-2">{ev.start_at ? gameTime(ev.start_at, ctx.displayTz) : "Not posted"}</td>
                  <td className="px-3 py-2">{ev.status.replace("_", " ")}</td>
                  <td className="px-3 py-2 text-muted">{ev.espn_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}
