import type { Metadata } from "next";
import { Empty, PageTitle, Panel } from "@/components/ui";
import { getGolfContext, getGolfStandings, money } from "@/lib/golf";

export const metadata: Metadata = { title: "Standings" };

export default async function GolfStandingsPage({ params }: PageProps<"/p/[slug]/golf/standings">) {
  const { slug } = await params;
  const ctx = await getGolfContext(slug);
  const standings = await getGolfStandings(ctx);

  return (
    <>
      <PageTitle sub="Season prize money from each entry's picks, final events only">Standings</PageTitle>
      {standings.length === 0 ? (
        <Empty>No standings yet.</Empty>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Entry</th>
                <th className="px-3 py-2 text-right font-medium">Events</th>
                <th className="px-3 py-2 text-right font-medium">Prize money</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.user_id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 text-muted">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">{s.display_name}</td>
                  <td className="px-3 py-2 text-right text-muted">{s.events_picked}</td>
                  <td className="px-3 py-2 text-right font-semibold">{money(s.season_earnings)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}
