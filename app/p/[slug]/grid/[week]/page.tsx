import type { Metadata } from "next";
import Link from "next/link";
import { chipClass, Empty, LockIcon, PageTitle, TeamLogo } from "@/components/ui";
import { formatSpread, points, shortGameTime, signedPoints } from "@/lib/format";
import { isGameLocked } from "@/lib/locks";
import { getPoolContext, getSlateGames } from "@/lib/pool";
import { getStandings } from "@/lib/standings";

export const metadata: Metadata = { title: "Selections grid" };

export default async function GridPage({ params }: PageProps<"/p/[slug]/grid/[week]">) {
  const { slug, week } = await params;
  const ctx = await getPoolContext(slug);
  const { data: slates } = await ctx.supabase
    .from("slates").select("id, week, label, status").eq("pool_id", ctx.pool.id).neq("status", "draft").order("week");
  const slate = slates?.find((s) => s.week === Number(week));
  if (!slate) return (<><PageTitle>Selections</PageTitle><Empty>That week isn&apos;t published.</Empty></>);

  const [games, standings, { data: picks }] = await Promise.all([
    getSlateGames(ctx, slate.id),
    getStandings(ctx, slate.id),
    // RLS only returns other players' picks on games that have locked (deadline or tip).
    ctx.supabase.from("picks").select("user_id, game_id, picked_side, confidence, result, points, bonus").eq("slate_id", slate.id),
  ]);
  const byCell = new Map((picks ?? []).map((p) => [`${p.user_id}:${p.game_id}`, p]));
  // eslint-disable-next-line react-hooks/purity -- render-time snapshot of which columns have locked
  const now = Date.now();

  const ats = ctx.settings.pick_type === "ats";
  const tz = ctx.settings.timezone;
  const isLocked = (g: (typeof games)[number]) => slate.status !== "open" || isGameLocked(g, now);
  // Picks per side, for the footer. Only meaningful once a game locks: before that RLS
  // returns just the viewer's own pick.
  const sides = new Map<string, { away: number; home: number }>();
  for (const p of picks ?? []) {
    const c = sides.get(p.game_id) ?? { away: 0, home: 0 };
    c[p.picked_side === "home" ? "home" : "away"]++;
    sides.set(p.game_id, c);
  }

  return (
    // Fills the viewport under the sticky header (and the phone tab row) so the grid's own
    // scrollbars sit on screen; the layout drops its tracker padding for this page.
    <div
      data-fill-viewport
      className="flex max-h-[max(24rem,calc(100dvh-7.75rem-2px-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] flex-col sm:max-h-[max(24rem,calc(100dvh-8rem-1px-env(safe-area-inset-top)-env(safe-area-inset-bottom)))]"
    >
      <PageTitle sub="Each game's column fills in once it locks.">Selections</PageTitle>
      <div className="-mx-4 mb-4 flex shrink-0 gap-1.5 overflow-x-auto px-4 pb-1">
        {slates?.map((s) => (
          <Link
            key={s.id}
            href={`/p/${slug}/grid/${s.week}`}
            aria-current={s.id === slate.id ? "page" : undefined}
            className={chipClass(s.id === slate.id, "min-h-11")}
          >
            {s.label ?? `Week ${s.week}`}
          </Link>
        ))}
      </div>
      {/* Scrolls both ways: header row pinned top, player column left, side counts bottom. */}
      <div className="-mx-4 min-h-0 flex-1 overflow-auto sm:mx-0">
        <table className="border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 min-w-28 border-b border-r border-line bg-bg px-4 py-2 text-left align-bottom text-xs font-medium text-muted">Player</th>
              <th className="sticky top-0 z-20 border-b border-line bg-bg px-2 py-2 align-bottom text-xs font-medium text-muted">Pts</th>
              {games.map((g) => {
                const locked = isLocked(g);
                const winner =
                  (g.status === "final" || g.overridden) && g.homeScore !== null && g.awayScore !== null
                    ? g.homeScore - g.awayScore + (ats ? (g.spread ?? 0) : 0)
                    : null;
                return (
                  <th
                    key={g.id}
                    className={`sticky top-0 z-20 min-w-14 border-b border-line bg-bg px-1 py-2 text-center align-bottom text-xs font-medium leading-tight text-muted ${g.voided ? "line-through opacity-50" : ""}`}
                  >
                    <div className="mb-1 whitespace-nowrap text-[10px] font-normal tabular-nums">
                      {shortGameTime(g.startAt, tz, g.timeTbd)}
                      {g.tv && <div className="mx-auto max-w-14 truncate">{g.tv}</div>}
                    </div>
                    <TeamLogo src={g.away.logo_url} abbr={g.away.abbreviation} className="mx-auto mb-0.5 size-5" />
                    <div className={winner !== null && winner < 0 ? "font-semibold text-ink" : ""}>{g.away.abbreviation}</div>
                    <div className="text-faint">{g.neutral ? "vs" : "@"}</div>
                    <div className={winner !== null && winner > 0 ? "font-semibold text-ink" : ""}>{g.home.abbreviation}</div>
                    <TeamLogo src={g.home.logo_url} abbr={g.home.abbreviation} className="mx-auto mt-0.5 size-5" />
                    {ats && <div className="mt-0.5 tabular-nums">{formatSpread(g.spread)}</div>}
                    {/* Picks in this column are still hidden. */}
                    {!locked && <LockIcon className="mx-auto mt-1 size-3 text-muted" />}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {standings.map((r) => {
              const mine = r.userId === ctx.user.id;
              return (
                <tr key={r.userId} className="[&:last-child>*]:border-b-0">
                  {/* "You" is the accent name plus a 2px edge, not a row fill. */}
                  <th
                    className={`sticky left-0 z-10 max-w-36 truncate border-b border-r border-line bg-bg px-4 py-1 text-left font-medium ${mine ? "text-accent shadow-[inset_2px_0_0_var(--accent)]" : ""}`}
                  >
                    {r.name}
                    {/* Their total is filled in per settings.missed_week. */}
                    {r.missed > 0 && <span className="ml-1.5 text-xs font-normal text-muted">No picks</span>}
                  </th>
                  <td className="border-b border-line px-2 text-center font-semibold tabular-nums">{points(r.points)}</td>
                  {games.map((g) => {
                    const p = byCell.get(`${r.userId}:${g.id}`);
                    const team = p ? (p.picked_side === "home" ? g.home : g.away) : null;
                    const tone = p?.result === "win" ? "text-win" : p?.result === "loss" ? "text-loss" : "text-ink";
                    const bonus = Number(p?.bonus ?? 0);
                    // Graded cells show what the pick scored before the bonus: a minus-points
                    // loss reads "−5"; a zero-points loss keeps its value, struck through.
                    const base = p?.result != null && p.points != null ? Number(p.points) - bonus : null;
                    return (
                      <td key={g.id} className={`h-11 min-w-14 border-b border-line px-1 text-center ${tone}`}>
                        {team && (
                          <div className="leading-tight">
                            <div className={`text-xs font-medium ${p?.result === "loss" ? "line-through" : ""}`}>
                              {team.abbreviation}
                              {/* Color isn't the only signal for the result. */}
                              {p?.result === "win" && <span className="sr-only">, won</span>}
                              {p?.result === "loss" && <span className="sr-only">, lost</span>}
                            </div>
                            {p?.confidence != null && (
                              <div className="text-sm font-semibold tabular-nums">
                                {base !== null && base < 0 ? (
                                  signedPoints(base)
                                ) : (
                                  <span className={p.result === "loss" ? "line-through" : ""}>{p.confidence}</span>
                                )}
                                {bonus > 0 && <sup className="ml-px text-[10px] font-semibold text-accent">+{points(bonus)}</sup>}
                              </div>
                            )}
                            {/* Flat pools have no value line, so the bonus sits on its own. */}
                            {p?.confidence == null && bonus > 0 && (
                              <div className="text-[10px] font-semibold tabular-nums text-accent">+{points(bonus)}</div>
                            )}
                            {bonus > 0 && <span className="sr-only">, upset bonus {points(bonus)}</span>}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th className="sticky bottom-0 left-0 z-30 border-r border-t border-line bg-bg px-4 py-1.5 text-left text-xs font-medium text-muted">
                {standings.length} {standings.length === 1 ? "player" : "players"}
              </th>
              <td className="sticky bottom-0 z-20 border-t border-line bg-bg" />
              {games.map((g) => {
                const c = sides.get(g.id) ?? { away: 0, home: 0 };
                return (
                  <td
                    key={g.id}
                    className={`sticky bottom-0 z-20 border-t border-line bg-bg px-1 py-1.5 text-center text-xs leading-tight ${g.voided ? "opacity-50" : ""}`}
                  >
                    {/* Before lock only the viewer's own pick is visible, so no partial counts. */}
                    {isLocked(g) ? (
                      <>
                        <div className="whitespace-nowrap"><span className="text-muted">{g.away.abbreviation}</span> <span className="font-semibold tabular-nums">{c.away}</span></div>
                        <div className="whitespace-nowrap"><span className="text-muted">{g.home.abbreviation}</span> <span className="font-semibold tabular-nums">{c.home}</span></div>
                      </>
                    ) : (
                      <LockIcon className="mx-auto size-3 text-muted" />
                    )}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
