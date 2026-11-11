import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronIcon, PageTitle } from "@/components/ui";
import { getGolfContext, money } from "@/lib/golf";
import { getGolfStandingsData } from "@/lib/golfStandings";

export const metadata: Metadata = { title: "Pick History" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ordinal = (x: number) => `${x}${x % 100 >= 11 && x % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][x % 10] ?? "th")}`;

/**
 * Pick History: one entry's season summary, then every event played with the golfer, finish,
 * prize money and running total. Another entry's pick shows once its event has started.
 */
export default async function GolfPickHistoryPage({ params }: PageProps<"/p/[slug]/golf/standings/[userId]">) {
  const { slug, userId } = await params;
  if (!UUID.test(userId)) notFound();
  const ctx = await getGolfContext(slug);
  // eslint-disable-next-line react-hooks/purity
  const data = await getGolfStandingsData(ctx, Date.now());
  const row = data.rows.find((r) => r.userId === userId);
  if (!row) notFound();

  let running = 0;
  const log = row.log.map((l) => ({ ...l, total: (running += l.earned) }));
  const stats: [string, string][] = [
    ["Place", `${row.tied ? "T-" : ""}${ordinal(row.place)} of ${data.rows.length}`],
    ["Earnings", money(row.total)],
    ["Behind", row.behind > 0 ? money(row.behind) : "Leader"],
    ["Cuts Made", `${row.cuts} of ${row.picks}`],
    ["Top 10s", String(row.top10s)],
    ["Wins", String(row.wins)],
    ["Weeks Won", String(row.weeklyWins)],
    ["Missed", String(row.missed)],
  ];

  return (
    <>
      <Link href={`/p/${slug}/golf/standings`} className="mb-2 inline-flex h-9 items-center gap-0.5 text-sm font-medium text-accent">
        <ChevronIcon className="size-4 rotate-180" /> Standings
      </Link>
      <PageTitle sub={row.isMe ? "Your Season" : "Season So Far"}>{row.name}</PageTitle>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-surface px-3 py-2">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="truncate text-[15px] font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {row.best && (
        <p className="mt-3 text-sm text-muted">
          Best Week: <span className="font-medium text-ink">{row.best.golfer}</span> at the {row.best.event.replace(/^the /i, "")} (Week {row.best.week}),{" "}
          <span className="font-medium text-ink">{money(row.best.earned)}</span>
        </p>
      )}

      {log.length === 0 ? (
        <p className="mt-6 border-y border-line py-3 text-sm text-muted">No events have been played yet.</p>
      ) : (
        <div className="mt-6 border-y border-line">
          <table className="w-full table-fixed text-xs sm:table-auto sm:text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="w-7 py-2 pr-1 font-medium sm:w-10">Wk</th>
                <th className="py-2 pr-2 font-medium">Tournament</th>
                <th className="py-2 pr-2 font-medium">Golfer</th>
                <th className="w-12 py-2 pr-2 font-medium sm:w-auto">Finish</th>
                <th className="w-[5.5rem] py-2 text-right font-medium sm:w-auto">Earnings</th>
                <th className="hidden py-2 pl-3 text-right font-medium sm:table-cell">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {log.map((l) => (
                <tr key={l.week}>
                  <td className="py-2 pr-1 tabular-nums text-muted">{l.week}</td>
                  <td className="truncate py-2 pr-2">{l.event}</td>
                  <td className={`break-words py-2 leading-snug pr-2 ${l.golfer ? "font-medium" : "text-muted"}`}>{l.golfer ?? "No Pick"}</td>
                  <td className="py-2 pr-2 tabular-nums text-muted">
                    {l.finish}
                    {!l.final && <span className="ml-1 text-xs text-live">Live</span>}
                  </td>
                  <td className={`py-2 text-right tabular-nums ${l.earned > 0 ? "font-semibold" : "text-muted"}`}>{l.final ? money(l.earned) : "–"}</td>
                  <td className="hidden py-2 pl-3 text-right tabular-nums text-muted sm:table-cell">{money(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
