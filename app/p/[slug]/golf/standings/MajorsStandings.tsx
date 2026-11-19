import { FitText } from "@/components/FitText";
import Link from "next/link";
import { AutoRefresh } from "@/components/AutoRefresh";
import { GolfEventSelect } from "@/components/GolfEventSelect";
import { Empty, PageTitle, chipClass } from "@/components/ui";
import { type GolfContext, type GolfEvent, getGolfMembers, money } from "@/lib/golf";
import { formatShown, formatToPar, golferShown, isSingleTournament, type MajorsSettings } from "@/lib/golfMajors";
import { getMajorsScoreboard } from "@/lib/golfMajorsData";

type Sort = "score" | "name" | "toPar" | "money";
/** $1.2M, $85K, $900 (compact, for the lineup cards). */
const shortMoney = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2).replace(/\.?0+$/, "")}M` : n >= 1000 ? `$${Math.round(n / 1000)}K` : n > 0 ? `$${n}` : "$0";
const pts = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "");

/**
 * Standings for a Majors pool. Every entry's full lineup: cards across the screen on desktop
 * (as many columns as fit), a list to tap open on phones. Sort by the pool's own scoring, name,
 * total score to par, or prize money (projected from the leaderboard and the purse until the
 * major is final). Cumulative pools add the majors up; "each major" pools show one at a time.
 */
export async function MajorsStandings({
  slug,
  ctx,
  events,
  eventParam,
  sortParam,
}: {
  slug: string;
  ctx: GolfContext;
  events: GolfEvent[];
  eventParam?: string;
  sortParam?: string;
}) {
  const members = await getGolfMembers(ctx);
  const board = await getMajorsScoreboard(ctx, events, members);
  const { settings: s, started } = board;
  const names = new Map(members.map((m) => [m.user_id, m.display_name]));
  const live = started.some((e) => e.status !== "final");

  if (!started.length) {
    return (
      <>
        <PageTitle>Standings</PageTitle>
        <Empty>
          {isSingleTournament(ctx.pool.settings)
            ? "Standings are available once the tournament begins. Lineups will show then too."
            : "Standings start once the first major tees off. Lineups show then too."}
        </Empty>
      </>
    );
  }

  const each = s.standings === "each";
  const focus = each ? (started.find((e) => e.id === eventParam) ?? started.find((e) => e.status === "in_progress") ?? started[started.length - 1]) : null;
  const columns = focus ? [focus] : started;
  const ids = columns.map((e) => e.id);
  const anyLive = columns.some((e) => e.status !== "final");

  // Sort by cumulative score to par, prize money (projected until it's posted) or name; salary
  // cap pools also by fantasy points. The pool's own scoring comes first and is the default.
  const ownSort: Sort = s.contest === "salary" ? "score" : s.tiers.scoring === "earnings" ? "money" : "toPar";
  const sorts: { id: Sort; label: string }[] = [
    ...(s.contest === "salary" ? [{ id: "score" as Sort, label: "Points" }] : []),
    { id: "toPar" as Sort, label: "To Par" },
    { id: "money" as Sort, label: anyLive ? "Earnings (Projected)" : "Earnings" },
    { id: "name" as Sort, label: "A–Z" },
  ].sort((x, y) => Number(y.id === ownSort) - Number(x.id === ownSort));
  const sort: Sort = sorts.some((x) => x.id === sortParam) ? (sortParam as Sort) : ownSort;

  const standing = board.standingsFor(ids);
  const own = new Map(standing.map((r) => [r.user_id, r]));
  const value = (userId: string, by: Sort): number | null =>
    by === "toPar" ? board.totalFor("toPar", userId, ids) : by === "money" ? board.totalFor("money", userId, ids) : (own.get(userId)?.total ?? null);
  const lowWins = (by: Sort) => by === "toPar";

  const rows = members.map((m) => ({ user_id: m.user_id, name: names.get(m.user_id) ?? "Player", v: value(m.user_id, sort === "name" ? ownSort : sort) }));
  if (sort === "name") rows.sort((a, b) => a.name.localeCompare(b.name));
  else rows.sort((a, b) => (a.v === null ? 1 : b.v === null ? -1 : lowWins(sort) ? a.v - b.v : b.v - a.v) || a.name.localeCompare(b.name));
  // Places for the sort shown (the pool's standings place when sorted by name).
  const place = new Map<string, number>();
  if (sort === "name") for (const r of standing) place.set(r.user_id, r.rank);
  else
    rows.forEach((r, i) => {
      const prev = rows[i - 1];
      place.set(r.user_id, i > 0 && prev.v === r.v ? place.get(prev.user_id)! : i + 1);
    });

  const fmt = (by: Sort, v: number | null) => {
    if (v === null) return "–";
    const kind = by === "score" ? "points" : by === "money" ? "money" : "toPar";
    return kind === "points" ? pts(v) : kind === "money" ? money(v) : formatToPar(v);
  };
  const shownSort: Sort = sort === "name" ? ownSort : sort;
  const me = ctx.entryUserId;
  const href = (by: Sort) => `/p/${slug}/golf/standings?${new URLSearchParams({ ...(focus ? { event: focus.id } : {}), ...(by === ownSort ? {} : { sort: by }) })}`;

  // The narrowest card that shows everything: the fixed columns (tier, place, score, money, gaps
  // and padding: about 12rem) plus the longest golfer name at 13px (~0.45rem a letter), or the
  // entry's name and total along the top (14px semibold, ~0.52rem a letter, plus about 5.5rem).
  const longestGolfer = Math.max(0, ...[...board.lineups.entries()].filter(([k]) => ids.some((id) => k.endsWith(`|${id}`))).flatMap(([, ls]) => ls.map((l) => l.golfer_name.length)));
  const longestEntry = Math.max(0, ...rows.map((r) => r.name.length));
  const cardRem = Math.max(14, Math.ceil(Math.max(12 + longestGolfer * 0.45, 5.5 + longestEntry * 0.52) * 2) / 2);

  return (
    <div data-wide>
      <AutoRefresh active={live} seconds={60} />
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <PageTitle>Standings</PageTitle>
          <p className="-mt-4 text-xs text-muted">
            {each ? focus!.name : `${started.length === 1 ? started[0].name : `${started.length} majors`} · cumulative`}
            {live && <span className="font-semibold text-live"> · Live</span>}
          </p>
        </div>
        {each && started.length > 1 && <GolfEventSelect basePath={`/p/${slug}/golf/standings`} value={focus!.id} events={started.map((e) => ({ id: e.id, label: e.name }))} />}
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Sort">
        {sorts.map((x) => (
          <Link key={x.id} href={href(x.id)} aria-current={sort === x.id ? "true" : undefined} className={chipClass(sort === x.id, "", "sm")}>
            {x.label}
          </Link>
        ))}
      </div>

      {/* Desktop: every entry's lineup as a card, as many across as fit with nothing cut off: each
          card is at least as wide as its longest golfer or entry name needs, so a wide screen shows
          more cards per row and a narrower one fewer. */}
      <ol className="hidden gap-2 lg:grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${cardRem}rem), 1fr))` }}>
        {rows.map((r) => (
          <li key={r.user_id} className={`rounded-lg border px-2.5 py-2 ${r.user_id === me ? "border-accent bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]" : "border-line"}`}>
            <div className="flex items-baseline gap-1.5 border-b border-line pb-1 text-sm">
              <span className="w-5 shrink-0 tabular-nums text-muted">{r.v === null && sort !== "name" ? "" : place.get(r.user_id)}</span>
              <FitText min={11} className={`flex-1 font-semibold ${r.user_id === me ? "text-accent" : ""}`}>{r.name}</FitText>
              <span className="shrink-0 font-bold tabular-nums">{fmt(shownSort, r.v)}</span>
            </div>
            {columns.map((e) => (
              <Lineup key={e.id} event={e} userId={r.user_id} board={board} s={s} showName={columns.length > 1} />
            ))}
          </li>
        ))}
      </ol>

      {/* Phones and tablets: a list; tap an entry to see its golfers. */}
      <div className="border-t border-line lg:hidden">
        {rows.map((r) => (
          <details key={r.user_id} className={`group border-b border-line ${r.user_id === me ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : ""}`}>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-2 text-sm hover:bg-surface [&::-webkit-details-marker]:hidden">
              <span className="w-7 shrink-0 tabular-nums text-muted">{r.v === null && sort !== "name" ? "" : place.get(r.user_id)}</span>
              <span className={`min-w-0 flex-1 truncate font-medium ${r.user_id === me ? "text-accent" : ""}`}>{r.name}</span>
              <span className="shrink-0 font-semibold tabular-nums">{fmt(shownSort, r.v)}</span>
              {/* Tap to show the lineup: a small arrow that turns when it's open. */}
              <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
              </svg>
            </summary>
            <div className="space-y-3 px-2 pb-3 pl-11">
                {columns.map((e) => (
                <Lineup key={e.id} event={e} userId={r.user_id} board={board} s={s} showName={columns.length > 1} />
              ))}
            </div>
          </details>
        ))}
      </div>

      <p className="mt-2 text-[11px] text-muted">
        {s.contest === "tiers" && s.tiers.scoring === "to_par"
          ? "Lowest total wins. A golfer who misses the cut takes the worst score of anyone who made it. "
          : "Highest total wins. "}
        {s.contest === "tiers" && s.tiers.counting < s.tiers.picks.reduce((a, b) => a + b, 0) ? `The best ${s.tiers.counting} golfers count (in bold). ` : ""}
        {anyLive ? "Earnings (Proj. $) are projected from current standings and the purse (ties split), until the prize money is posted." : ""}
      </p>
    </div>
  );
}

function Lineup({
  event,
  userId,
  board,
  s,
  showName,
}: {
  event: GolfEvent;
  userId: string;
  board: Awaited<ReturnType<typeof getMajorsScoreboard>>;
  s: MajorsSettings;
  showName: boolean;
}) {
  const rows = board.lineups.get(`${userId}|${event.id}`) ?? [];
  const score = board.scores.get(`${userId}|${event.id}`);
  const results = board.results.get(event.id) ?? [];
  const byId = new Map(results.map((r) => [r.espn_golfer_id, r]));
  const counts = new Map(score?.golfers.map((g) => [g.espn_golfer_id, g]) ?? []);
  const final = event.status === "final";
  // The score column is always score to par (points for salary cap); money has its own column.
  const asScore: MajorsSettings = s.contest === "salary" ? s : { ...s, tiers: { ...s.tiers, scoring: "to_par" } };
  return (
    <div className="mt-1.5">
      {showName && <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{event.name}</div>}
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No lineup.</p>
      ) : (
        <ul className="text-[13px]">
          <li className="flex items-center gap-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-faint" aria-hidden>
            <span className={`${s.contest === "salary" ? "w-9" : "w-7"} shrink-0`}>{s.contest === "salary" ? "Sal." : "Tier"}</span>
            <span className="min-w-0 flex-1">Golfer</span>
            <span className="w-8 shrink-0 text-right">Pos</span>
            <span className="w-9 shrink-0 text-right">{s.contest === "salary" ? "Pts" : "Score"}</span>
            <span className="w-12 shrink-0 text-right">{final ? "Earn." : "Proj. $"}</span>
          </li>
          {[...rows]
            .sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0) || (b.salary ?? 0) - (a.salary ?? 0) || a.golfer_name.localeCompare(b.golfer_name))
            .map((l) => {
              const r = byId.get(l.espn_golfer_id);
              const counted = counts.get(l.espn_golfer_id)?.counts;
              return (
                <li key={l.espn_golfer_id} className={`flex items-center gap-1.5 py-px ${counted ? "" : "text-muted"}`}>
                  <span className={`${s.contest === "salary" ? "w-9" : "w-7"} shrink-0 text-[11px] tabular-nums text-muted`}>{s.contest === "salary" ? `$${((l.salary ?? 0) / 1000).toFixed(1)}K` : `T${l.tier}`}</span>
                  {/* The card is sized to fit the longest name; the font steps down if one still doesn't. */}
                  <FitText min={10} className={`flex-1 ${counted ? "font-medium" : ""}`}>{l.golfer_name}</FitText>
                  <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted">{r?.out ? "MC" : (r?.pos ?? "")}</span>
                  <span className={`w-9 shrink-0 text-right tabular-nums ${counted ? "font-semibold" : ""}`}>{formatShown(golferShown(l.espn_golfer_id, results, asScore, final))}</span>
                  {/* Prize money: projected from current standings until it's posted. */}
                  <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-muted">{r ? shortMoney(r.earnings) : "–"}</span>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
