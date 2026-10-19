import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PickSummaryRow } from "@/components/PickSummaryRow";
import { ChevronIcon, PageTitle, SectionLabel } from "@/components/ui";
import { points } from "@/lib/format";
import { isGameLocked } from "@/lib/locks";
import { type HistoryWeek, getPlayerHistory } from "@/lib/playerHistory";
import { getPoolContext, getSlateGames, type SlateGame } from "@/lib/pool";
import { segmentForWeek } from "@/lib/poolSettings";
import { winPct } from "@/lib/record";
import { getStandings } from "@/lib/standings";

export const metadata: Metadata = { title: "Pick History" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const n = (x: number) => x.toLocaleString("en-US");
const recordText = (r: { wins: number; losses: number; pushes: number }) => `${n(r.wins)}–${n(r.losses)}${r.pushes ? `–${n(r.pushes)}` : ""}`;
const ordinal = (x: number) => `${x}${x % 100 >= 11 && x % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][x % 10] ?? "th"}`;

type Pick = { slate_id: string; game_id: string; picked_side: string; confidence: number | null; result: string | null };

/**
 * Pick History: one player's season summary, then every week at once, newest first and grouped
 * by bonus segment, each with its record, rank and the picks themselves (like My Picks).
 * Another player's picks show from each game's kickoff (RLS), so an open week can be partial.
 */
export default async function PickHistoryPage({ params }: PageProps<"/p/[slug]/standings/[userId]">) {
  const { slug, userId } = await params;
  if (!UUID.test(userId)) notFound();
  const ctx = await getPoolContext(slug);
  const [history, season] = await Promise.all([getPlayerHistory(ctx, userId), getStandings(ctx)]);
  if (!history) notFound();

  const ids = history.weeks.map((w) => w.slateId);
  const { data: pickRows } = ids.length
    ? await ctx.supabase.from("picks").select("slate_id, game_id, picked_side, confidence, result").eq("user_id", userId).in("slate_id", ids)
    : { data: [] as Pick[] };
  const picks = (pickRows ?? []) as Pick[];
  // Games only for weeks that have a visible pick.
  const pickedSlates = [...new Set(picks.map((p) => p.slate_id))];
  const gameLists = await Promise.all(pickedSlates.map((id) => getSlateGames(ctx, id)));
  const gamesBySlate = new Map<string, Map<string, SlateGame>>(pickedSlates.map((id, i) => [id, new Map(gameLists[i].map((g) => [g.id, g]))]));

  const me = userId === ctx.entryUserId;
  const row = season.find((r) => r.userId === userId);
  const flat = !ctx.settings.confidence;
  const pickType = ctx.settings.pick_type;
  // eslint-disable-next-line react-hooks/purity -- render-time snapshot of which games are live or locked
  const now = Date.now();

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

  const weekPicks = (w: HistoryWeek) => {
    const games = gamesBySlate.get(w.slateId);
    if (!games) return [];
    return picks
      .filter((p) => p.slate_id === w.slateId && games.has(p.game_id))
      .map((p) => ({ p, g: games.get(p.game_id)! }))
      .sort((a, b) => a.g.startAt.localeCompare(b.g.startAt));
  };

  return (
    // data-wide: weeks sit side by side on wide screens.
    <div data-wide>
      <Link href={`/p/${slug}/standings`} className="-ml-1 mb-2 inline-flex h-9 items-center gap-0.5 px-1 text-sm font-medium text-accent">
        <ChevronIcon className="size-4 rotate-180" /> Standings
      </Link>
      <PageTitle sub={`${history.name}${me ? " · You" : ""}`}>Pick History</PageTitle>

      {row && (
        <dl className="mb-6 grid grid-cols-2 gap-4 border-b border-line pb-4 sm:grid-cols-4 lg:max-w-3xl">
          <div>
            <dt className="text-xs text-muted">Season rank</dt>
            <dd className="text-3xl font-semibold tabular-nums">{ordinal(row.rank)}<span className="text-base font-normal text-muted"> of {season.length}</span></dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Record</dt>
            <dd className="whitespace-nowrap text-3xl font-semibold tabular-nums">{recordText(row)}</dd>
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

      {groups.map((grp) => {
        const t = totals(grp.weeks);
        return (
          <section key={grp.name ?? "season"} className="mb-8">
            <div className="mb-2 flex min-h-9 items-center justify-between gap-3 border-b border-line">
              <SectionLabel>{grp.name ?? "All weeks"}</SectionLabel>
              {grp.name && (
                <span className="text-xs tabular-nums text-muted">
                  {recordText(t)} · {winPct(t.wins, t.losses)}
                  {!flat && <> · {points(t.points)} pts</>}
                </span>
              )}
            </div>
            {/* Every week at once: one card per week, side by side on wider screens. */}
            <div className="grid gap-x-8 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
              {grp.weeks.map((w) => {
                const list = weekPicks(w);
                return (
                  <article key={w.slateId} aria-label={w.label}>
                    <div className="flex items-baseline gap-2">
                      {/* The week's picks for everyone, on the Grid. */}
                      <Link href={`/p/${slug}/grid/${w.week}`} className="text-base font-bold text-ink hover:underline">{w.label}</Link>
                      {w.status !== "graded" && <span className="text-xs font-medium text-accent">In progress</span>}
                      <span className="ml-auto whitespace-nowrap text-sm tabular-nums">
                        <span className="font-semibold text-ink">{recordText(w)}</span>
                        <span className="text-muted"> · {winPct(w.wins, w.losses)}</span>
                        {!flat && <span className="text-muted"> · {points(w.points)} pts</span>}
                      </span>
                    </div>
                    <div className="mb-1 text-xs text-muted">
                      {w.rank ? <>{ordinal(w.rank)} of {w.of} that week</> : "Not scored yet"}
                    </div>
                    {list.length ? (
                      <ul className="divide-y divide-line border-y border-line">
                        {list.map(({ p, g }) => (
                          <PickSummaryRow
                            key={p.game_id}
                            game={g}
                            side={p.picked_side === "home" ? "home" : "away"}
                            confidence={p.confidence}
                            result={p.result}
                            locked={w.status !== "open" || isGameLocked(g, now)}
                            now={now}
                            pickType={pickType}
                            timezone={ctx.displayTz}
                          />
                        ))}
                      </ul>
                    ) : (
                      <p className="border-y border-line py-3 text-sm text-muted">
                        {w.missed
                          ? "No picks this week."
                          : !me && w.status === "open"
                            ? "Picks show once their games kick off."
                            : "No picks to show."}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
