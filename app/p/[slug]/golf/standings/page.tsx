import type { Metadata } from "next";
import { AutoRefresh } from "@/components/AutoRefresh";
import { GolfStandingsTable } from "@/components/GolfStandingsTable";
import { Empty, PageTitle, SectionLabel } from "@/components/ui";
import { getGolfContext, money } from "@/lib/golf";
import { getGolfStandingsData } from "@/lib/golfStandings";

export const metadata: Metadata = { title: "Standings" };

const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : Math.min(n % 10, 4) % 4]}`;

export default async function GolfStandingsPage({ params }: PageProps<"/p/[slug]/golf/standings">) {
  const { slug } = await params;
  const ctx = await getGolfContext(slug);
  // eslint-disable-next-line react-hooks/purity
  const data = await getGolfStandingsData(ctx, Date.now());
  const me = data.rows.find((r) => r.isMe);

  return (
    <div data-wide>
      <PageTitle
        sub={
          data.finalCount === 0
            ? "No events are final yet."
            : `Season prize money through ${data.lastFinal ? `Week ${data.lastFinal.week}, ${data.lastFinal.name}` : `${data.finalCount} events`}`
        }
      >
        Standings
      </PageTitle>
      <AutoRefresh active={!!data.current?.live} seconds={120} />

      {data.rows.length === 0 ? (
        <Empty>No standings yet.</Empty>
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
          <section aria-label="Season standings">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
              {me && !ctx.isGuest ? (
                <a href="#my-row" className="text-accent hover:underline">
                  {ctx.managing ? `${ctx.managing.ownerName}: ` : "You: "}
                  <span className="font-semibold">
                    {me.tied ? "T-" : ""}
                    {ordinal(me.place)}
                  </span>{" "}
                  of {data.rows.length}
                  {me.behind > 0 ? `, ${money(me.behind)} back` : ""}
                </a>
              ) : (
                <span className="text-muted">{data.rows.length} entries</span>
              )}
              {data.current && (
                <span className="text-xs text-muted">
                  Week {data.current.week} · {data.current.name}
                  {data.current.live ? " · under way" : data.current.open ? " · picks show at the lock" : ""}
                </span>
              )}
            </div>
            <GolfStandingsTable rows={data.rows} hasCurrent={!!data.current} hasLastWeek={!!data.lastFinal} />
            <p className="mt-2 text-xs text-muted">Select an entry to see its season. ▲▼ show places gained or lost last week.</p>
          </section>

          {/* Who earned the most each week. */}
          <section aria-labelledby="weekly-winners">
            <SectionLabel>
              <span id="weekly-winners">Weekly winners</span>
            </SectionLabel>
            {data.weekly.length === 0 ? (
              <p className="mt-2 border-y border-line py-3 text-sm text-muted">No events are final yet.</p>
            ) : (
              <>
                {data.weeklyLeaders.length > 0 && (
                  <ol className="mt-2 flex flex-wrap gap-1.5">
                    {data.weeklyLeaders.slice(0, 6).map((l) => (
                      <li key={l.name} className={`rounded-full bg-surface px-2.5 py-1 text-xs ${l.isMe ? "ring-2 ring-accent" : ""}`}>
                        <span className="font-medium">{l.name}</span> <span className="tabular-nums text-muted">×{l.wins}</span>
                      </li>
                    ))}
                  </ol>
                )}
                <ol className="mt-3 divide-y divide-line border-y border-line">
                  {data.weekly.map((w) => (
                    <li key={w.week} className="py-2 text-sm">
                      <div className="flex items-baseline justify-between gap-2 text-xs text-muted">
                        <span className="min-w-0 truncate">
                          Wk {w.week} · {w.event}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-ink">{w.earned > 0 ? money(w.earned) : "–"}</span>
                      </div>
                      {w.winners.length === 0 ? (
                        <div className="text-muted">No one earned prize money</div>
                      ) : (
                        w.winners.map((x) => (
                          <div key={x.name} className="flex items-baseline justify-between gap-2">
                            <span className={`min-w-0 truncate ${x.isMe ? "font-bold" : "font-medium"}`}>{x.name}</span>
                            <span className="shrink-0 text-xs text-muted">{x.golfer}</span>
                          </div>
                        ))
                      )}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
