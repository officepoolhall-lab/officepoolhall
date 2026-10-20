import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PickSummaryRow } from "@/components/PickSummaryRow";
import { ChevronIcon, PageTitle, TeamLogo } from "@/components/ui";
import { ViewTabs } from "@/components/ViewTabs";
import { points, signedPoints } from "@/lib/format";
import { isGameLocked } from "@/lib/locks";
import { type HistoryWeek, getPlayerHistory } from "@/lib/playerHistory";
import { getPoolContext, getSlateGames, type SlateGame } from "@/lib/pool";
import { winPct } from "@/lib/record";
import { getStandings } from "@/lib/standings";

export const metadata: Metadata = { title: "Pick History" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const n = (x: number) => x.toLocaleString("en-US");
const recordText = (r: { wins: number; losses: number; pushes: number }) => `${n(r.wins)}–${n(r.losses)}${r.pushes ? `–${n(r.pushes)}` : ""}`;
const ordinal = (x: number) => `${x}${x % 100 >= 11 && x % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][x % 10] ?? "th"}`;

type Pick = { slate_id: string; game_id: string; picked_side: string; confidence: number | null; result: string | null; points: number | null };

/**
 * Pick History: one player's season summary, then two views. By Week: every week in order
 * (Week 1 first), each a row with its record that opens to show that week's picks. By Team:
 * the player's record and points on each team they've picked, all season. ?view=team opens on it.
 * Another player's picks show from each game's kickoff (RLS), so an open week can be partial.
 */
export default async function PickHistoryPage({ params, searchParams }: PageProps<"/p/[slug]/standings/[userId]">) {
  const { slug, userId } = await params;
  const { view } = await searchParams;
  if (!UUID.test(userId)) notFound();
  const ctx = await getPoolContext(slug);
  const [history, season] = await Promise.all([getPlayerHistory(ctx, userId), getStandings(ctx)]);
  if (!history) notFound();

  const ids = history.weeks.map((w) => w.slateId);
  const { data: pickRows } = ids.length
    ? await ctx.supabase.from("picks").select("slate_id, game_id, picked_side, confidence, result, points").eq("user_id", userId).in("slate_id", ids)
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

  // Every week in order, Week 1 first (history.weeks is oldest first).
  const weeks = history.weeks;
  // Football pools list every week's picks at once; basketball weeks (25 picks each) fold up.
  const allOpen = ctx.pool.sport === "ncaaf";
  // The newest week with something to show starts open; the rest open on a tap.
  const openWeek = [...weeks].reverse().find((w) => w.wins + w.losses + w.pushes > 0 || weekPicks(w).length > 0)?.slateId;

  // Highest confidence first (game time within a value), like My Picks.
  function weekPicks(w: HistoryWeek) {
    const games = gamesBySlate.get(w.slateId);
    if (!games) return [];
    return picks
      .filter((p) => p.slate_id === w.slateId && games.has(p.game_id))
      .map((p) => ({ p, g: games.get(p.game_id)! }))
      .sort((a, b) => (b.p.confidence ?? 0) - (a.p.confidence ?? 0) || a.g.startAt.localeCompare(b.g.startAt));
  }

  // ---------- By Team: every visible pick, grouped by the team taken ----------
  type TeamRow = { team: SlateGame["home"]; picks: number; wins: number; losses: number; pushes: number; points: number };
  const byTeam = new Map<string, TeamRow>();
  for (const w of weeks) {
    for (const { p, g } of weekPicks(w)) {
      if (g.voided) continue;
      const team = p.picked_side === "home" ? g.home : g.away;
      const row = byTeam.get(team.id) ?? { team, picks: 0, wins: 0, losses: 0, pushes: 0, points: 0 };
      row.picks++;
      if (p.result === "win") row.wins++;
      else if (p.result === "loss") row.losses++;
      else if (p.result === "push") row.pushes++;
      row.points += Number(p.points ?? 0);
      byTeam.set(team.id, row);
    }
  }
  // Most points first (confidence), else most wins; then most picks, then name.
  const teamRows = [...byTeam.values()].sort(
    (a, b) =>
      (flat ? b.wins - a.wins : b.points - a.points) ||
      b.picks - a.picks ||
      (a.team.short_name ?? a.team.name).localeCompare(b.team.short_name ?? b.team.name),
  );

  const byWeekView = (
    <div className="divide-y divide-line border-y border-line">
      {weeks.map((w) => {
        const list = weekPicks(w);
        const summary = (
          <>
            <span className="text-[15px] font-bold text-ink">{w.label}</span>
            {w.status !== "graded" && <span className="text-xs font-medium text-accent">In progress</span>}
            <span className="hidden text-xs text-muted sm:inline">{w.rank ? `${ordinal(w.rank)} of ${w.of}` : ""}</span>
            <span className="ml-auto whitespace-nowrap text-sm tabular-nums">
              <span className="font-semibold text-ink">{recordText(w)}</span>
              <span className="text-muted"> · {winPct(w.wins, w.losses)}</span>
              {!flat && <span className="text-muted"> · {points(w.points)} pts</span>}
            </span>
          </>
        );
        const body = (
          <div className={allOpen ? "pb-3" : "pb-3 pl-6"}>
            <div className="mb-1 flex items-baseline justify-between text-xs text-muted">
              <span>{w.rank ? <>{ordinal(w.rank)} of {w.of} that week</> : "Not scored yet"}</span>
              {/* Everyone's picks that week. */}
              <Link href={`/p/${slug}/grid/${w.week}`} className="font-medium text-accent hover:underline">League Grid</Link>
            </div>
            {list.length ? (
              <ul className="divide-y divide-line border-t border-line">
                {list.map(({ p, g }) => (
                  <PickSummaryRow
                    key={p.game_id}
                    game={g}
                    side={p.picked_side === "home" ? "home" : "away"}
                    confidence={p.confidence}
                    result={p.result}
                    // Confidence pools: what each decided pick won or lost.
                    points={!flat && (p.result === "win" || p.result === "loss") ? Number(p.points ?? 0) : null}
                    locked={w.status !== "open" || isGameLocked(g, now)}
                    now={now}
                    pickType={pickType}
                    timezone={ctx.displayTz}
                    dense
                  />
                ))}
              </ul>
            ) : (
              <p className="border-t border-line py-3 text-sm text-muted">
                {w.missed ? "No picks this week." : !me && w.status === "open" ? "Picks show once their games kick off." : "No picks to show."}
              </p>
            )}
          </div>
        );
        // Football: every week open at once, nothing to tap. Basketball: weeks open on a tap.
        if (allOpen) {
          return (
            <section key={w.slateId} aria-label={w.label}>
              <div className="flex min-h-11 items-center gap-2 py-2">{summary}</div>
              {body}
            </section>
          );
        }
        return (
          <details key={w.slateId} open={w.slateId === openWeek} className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 [&::-webkit-details-marker]:hidden">
              <ChevronIcon className="size-4 shrink-0 text-muted transition group-open:rotate-90" />
              {summary}
            </summary>
            {body}
          </details>
        );
      })}
    </div>
  );

  const byTeamView = teamRows.length ? (
    <table className="w-full text-[13px] tabular-nums sm:text-sm">
      <thead>
        <tr className="border-b border-line text-left text-xs text-muted">
          <th className="py-2 font-medium">Team</th>
          <th className="py-2 pl-2 text-right font-medium sm:pl-3">Picks</th>
          <th className="py-2 pl-2 text-right font-medium sm:pl-3">Record</th>
          <th className="py-2 pl-2 text-right font-medium sm:pl-3">Win %</th>
          {!flat && <th className="py-2 pl-2 text-right font-medium sm:pl-3">Pts</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {teamRows.map((r) => (
          <tr key={r.team.id}>
            {/* The name gets whatever the numbers leave and wraps rather than being cut off. */}
            <td className="py-1.5">
              <span className="flex items-center gap-1.5 sm:gap-2">
                <TeamLogo src={r.team.logo_url} abbr={r.team.abbreviation} className="size-4 shrink-0 sm:size-5" />
                <span className="font-semibold leading-tight text-ink">{r.team.short_name ?? r.team.name}</span>
              </span>
            </td>
            <td className="w-px py-1.5 pl-2 text-right sm:pl-3">{r.picks}</td>
            <td className="w-px whitespace-nowrap py-1.5 pl-2 text-right font-semibold text-ink sm:pl-3">{recordText(r)}</td>
            <td className="w-px py-1.5 pl-2 text-right text-muted sm:pl-3">{winPct(r.wins, r.losses)}</td>
            {!flat && (
              <td className={`w-px whitespace-nowrap py-1.5 pl-2 text-right font-semibold sm:pl-3 ${r.points > 0 ? "text-win" : r.points < 0 ? "text-loss" : "text-ink"}`}>
                {signedPoints(r.points)}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <p className="border-y border-line py-3 text-sm text-muted">No picks to show yet.</p>
  );

  return (
    <div data-wide>
      <Link href={`/p/${slug}/standings`} className="-ml-1 mb-2 inline-flex h-9 items-center gap-0.5 px-1 text-sm font-medium text-accent">
        <ChevronIcon className="size-4 rotate-180" /> Standings
      </Link>
      <PageTitle sub={`${history.name}${me ? " · You" : ""}`}>Pick History</PageTitle>

      {row && (
        <dl className="mb-5 grid grid-cols-2 gap-4 border-b border-line pb-4 sm:grid-cols-4 lg:max-w-3xl">
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

      <ViewTabs
        param="view"
        initial={typeof view === "string" ? view : undefined}
        ariaLabel="Show pick history by"
        views={[
          { id: "week", label: "By Week", content: byWeekView },
          { id: "team", label: "By Team", content: byTeamView },
        ]}
      />
    </div>
  );
}
