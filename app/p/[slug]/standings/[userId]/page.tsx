import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronIcon, PageTitle, SectionLabel } from "@/components/ui";
import { points } from "@/lib/format";
import { type HistoryWeek, getPlayerHistory } from "@/lib/playerHistory";
import { getPoolContext } from "@/lib/pool";
import { segmentForWeek } from "@/lib/poolSettings";
import { winPct } from "@/lib/record";
import { getStandings } from "@/lib/standings";

export const metadata: Metadata = { title: "Player history" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const recordText = (r: { wins: number; losses: number; pushes: number }) => `${r.wins}–${r.losses}${r.pushes ? `–${r.pushes}` : ""}`;
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

/** One player's record history: season summary, then every week with its rank, grouped by bonus segment. */
export default async function PlayerHistoryPage({ params }: PageProps<"/p/[slug]/standings/[userId]">) {
  const { slug, userId } = await params;
  if (!UUID.test(userId)) notFound();
  const ctx = await getPoolContext(slug);
  const [history, season] = await Promise.all([getPlayerHistory(ctx, userId), getStandings(ctx)]);
  if (!history) notFound();

  const me = userId === ctx.user.id;
  const row = season.find((r) => r.userId === userId);
  const flat = !ctx.settings.confidence;

  // Newest week first, grouped by bonus segment when the pool has them.
  const groups: { name: string | null; weeks: HistoryWeek[] }[] = [];
  for (const w of [...history.weeks].reverse()) {
    const seg = segmentForWeek(ctx.settings, w.week);
    const name = seg ? seg.name : null;
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.weeks.push(w);
    else groups.push({ name, weeks: [w] });
  }
  const totals = (weeks: HistoryWeek[]) =>
    weeks.reduce((t, w) => ({ wins: t.wins + w.wins, losses: t.losses + w.losses, pushes: t.pushes + w.pushes, points: t.points + w.points }), {
      wins: 0,
      losses: 0,
      pushes: 0,
      points: 0,
    });

  return (
    <div>
      <Link href={`/p/${slug}/standings`} className="-ml-1 mb-2 inline-flex h-9 items-center gap-0.5 px-1 text-sm font-medium text-accent">
        <ChevronIcon className="size-4 rotate-180" /> Standings
      </Link>
      <PageTitle sub={me ? "You" : undefined}>{history.name}</PageTitle>

      {row && (
        <dl className="mb-6 grid grid-cols-2 gap-4 border-b border-line pb-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">Season rank</dt>
            <dd className="text-3xl font-semibold tabular-nums">{ordinal(row.rank)}<span className="text-base font-normal text-muted"> of {season.length}</span></dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Record</dt>
            <dd className="text-3xl font-semibold tabular-nums">{recordText(row)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Win %</dt>
            <dd className="text-3xl font-semibold tabular-nums">{winPct(row.wins, row.losses)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Points</dt>
            <dd className="text-3xl font-semibold tabular-nums">{points(row.points)}</dd>
          </div>
        </dl>
      )}

      {groups.map((g) => {
        const t = totals(g.weeks);
        return (
          <section key={g.name ?? "season"} className="mb-6">
            <div className="flex min-h-9 items-center justify-between gap-3">
              <SectionLabel>{g.name ?? "By week"}</SectionLabel>
              {g.name && (
                <span className="text-xs tabular-nums text-muted">
                  {recordText(t)} · {winPct(t.wins, t.losses)}
                  {!flat && <> · {points(t.points)} pts</>}
                </span>
              )}
            </div>
            <ul className="divide-y divide-line border-y border-line">
              <li className="flex items-end gap-3 pb-1.5 pt-2 text-[11px] font-medium text-muted" aria-hidden>
                <span className="min-w-0 flex-1">Week</span>
                <span className="w-16 text-right">Record</span>
                <span className="w-14 text-right">Win %</span>
                <span className="w-12 text-right">Pts</span>
                <span className="w-20 text-right">Rank</span>
              </li>
              {g.weeks.map((w) => (
                <li key={w.slateId} className="flex min-h-11 items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate">
                    {/* The week's picks for everyone, on the Grid. */}
                    <Link href={`/p/${slug}/grid/${w.week}`} className="font-medium hover:underline">{w.label}</Link>
                    {w.missed && <span className="ml-1.5 text-xs text-muted">No picks</span>}
                    {w.status !== "graded" && <span className="ml-1.5 text-xs text-accent">In progress</span>}
                  </span>
                  <span className="w-16 text-right font-semibold tabular-nums">{recordText(w)}</span>
                  <span className="w-14 text-right text-sm tabular-nums text-muted">{winPct(w.wins, w.losses)}</span>
                  <span className="w-12 text-right text-sm tabular-nums text-muted">{points(w.points)}</span>
                  <span className="w-20 text-right text-sm tabular-nums text-muted">
                    {w.rank ? (
                      <>
                        <span className="font-semibold text-ink">{ordinal(w.rank)}</span> of {w.of}
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
