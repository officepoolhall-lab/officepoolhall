import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageTitle, Panel } from "@/components/ui";
import { getGolfContext, getGolfEvents, getGolfResults, money } from "@/lib/golf";

export const metadata: Metadata = { title: "Scoreboard" };

/** The field and finishes for one event. ?event= picks it; defaults to the latest with results. */
export default async function GolfScoreboardPage({ params, searchParams }: PageProps<"/p/[slug]/golf/scoreboard">) {
  const { slug } = await params;
  const { event: eventParam } = await searchParams;
  const ctx = await getGolfContext(slug);
  const events = await getGolfEvents(ctx);
  const withStarted = events.filter((ev) => ev.status !== "scheduled");
  const selected =
    events.find((ev) => ev.id === eventParam) ?? withStarted[withStarted.length - 1] ?? events[0];
  const results = selected ? await getGolfResults(ctx, selected.id) : [];

  return (
    <>
      <PageTitle sub={selected ? `${selected.name} · ${selected.status.replace("_", " ")}` : undefined}>Scoreboard</PageTitle>
      {events.length > 1 && (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {events.map((ev) => (
            <Link
              key={ev.id}
              href={`/p/${slug}/golf/scoreboard?event=${ev.id}`}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs ${ev.id === selected?.id ? "border-accent font-semibold text-accent" : "border-line text-muted"}`}
            >
              {ev.sort_order}. {ev.name}
            </Link>
          ))}
        </div>
      )}
      {!selected || results.length === 0 ? (
        <Empty>The field for this event hasn&apos;t been posted yet.</Empty>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="px-3 py-2 font-medium">Pos</th>
                <th className="px-3 py-2 font-medium">Golfer</th>
                <th className="px-3 py-2 text-right font-medium">Earnings</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.espn_golfer_id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 text-muted">{r.pos ?? "-"}</td>
                  <td className="px-3 py-2 font-medium">{r.golfer_name}</td>
                  <td className="px-3 py-2 text-right">{r.earnings > 0 ? money(Number(r.earnings)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}
