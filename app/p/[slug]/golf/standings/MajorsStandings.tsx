import Link from "next/link";
import { AutoRefresh } from "@/components/AutoRefresh";
import { GolfEventSelect } from "@/components/GolfEventSelect";
import { Empty, PageTitle, chipClass } from "@/components/ui";
import { type GolfContext, type GolfEvent, getGolfMembers, money } from "@/lib/golf";
import { formatShown, formatToPar, golferShown, type MajorsSettings } from "@/lib/golfMajors";
import { getMajorsScoreboard } from "@/lib/golfMajorsData";

type Sort = "score" | "name" | "toPar" | "money";
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
  const live = started.some((e) => e.status === "in_progress");

  if (!started.length) {
    return (
      <>
        <PageTitle>Standings</PageTitle>
        <Empty>Standings start once the first major tees off. Lineups show then too.</Empty>
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

      {/* Desktop: every entry's lineup as a card, as many across as fit, rows stacked. */}
      <ol className="hidden gap-3 lg:grid lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]">
        {rows.map((r) => (
          <li key={r.user_id} className={`rounded-lg border p-3 ${r.user_id === me ? "border-accent bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]" : "border-line"}`}>
            <div className="flex items-baseline gap-2 border-b border-line pb-1.5">
              <span className="w-6 shrink-0 tabular-nums text-muted">{r.v === null && sort !== "name" ? "" : place.get(r.user_id)}</span>
              <span className={`min-w-0 flex-1 truncate font-semibold ${r.user_id === me ? "text-accent" : ""}`}>{r.name}</span>
              <span className="shrink-0 font-bold tabular-nums">{fmt(shownSort, r.v)}</span>
            </div>
            <Totals userId={r.user_id} ids={ids} board={board} s={s} fmt={fmt} />
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
            </summary>
            <div className="space-y-3 px-2 pb-3 pl-11">
              <Totals userId={r.user_id} ids={ids} board={board} s={s} fmt={fmt} />
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
        {anyLive ? "Earnings are projected from where each golfer stands now and the purse, until the prize money is posted." : ""}
      </p>
    </div>
  );
}

/** The entry's total score to par and prize money (whatever the pool scores by). */
function Totals({
  userId,
  ids,
  board,
  s,
  fmt,
}: {
  userId: string;
  ids: string[];
  board: Awaited<ReturnType<typeof getMajorsScoreboard>>;
  s: MajorsSettings;
  fmt: (by: Sort, v: number | null) => string;
}) {
  const toPar = board.totalFor("toPar", userId, ids);
  const cash = board.totalFor("money", userId, ids);
  if (toPar === null && cash === null) return null;
  return (
    <div className="mt-1 flex gap-3 text-[11px] tabular-nums text-muted">
      {s.contest === "salary" && <span>Points {fmt("score", board.standingsFor(ids).find((r) => r.user_id === userId)?.total ?? null)}</span>}
      <span>To Par {fmt("toPar", toPar)}</span>
      <span>Earnings {fmt("money", cash)}</span>
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
  return (
    <div className="mt-1.5">
      {showName && <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{event.name}</div>}
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No lineup.</p>
      ) : (
        <ul className="text-sm">
          {[...rows]
            .sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0) || (b.salary ?? 0) - (a.salary ?? 0) || a.golfer_name.localeCompare(b.golfer_name))
            .map((l) => {
              const r = byId.get(l.espn_golfer_id);
              const counted = counts.get(l.espn_golfer_id)?.counts;
              return (
                <li key={l.espn_golfer_id} className={`flex items-center gap-2 py-0.5 ${counted ? "" : "text-muted"}`}>
                  <span className="w-9 shrink-0 text-[11px] tabular-nums text-muted">{s.contest === "salary" ? `$${((l.salary ?? 0) / 1000).toFixed(1)}K` : `T${l.tier}`}</span>
                  <span className={`min-w-0 flex-1 truncate ${counted ? "font-medium" : ""}`}>{l.golfer_name}</span>
                  <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted">{r?.out ? "MC" : (r?.pos ?? "")}</span>
                  {/* Score to par while it's played; prize money once final in money pools. */}
                  <span className={`w-16 shrink-0 text-right tabular-nums ${counted ? "font-semibold" : ""}`}>{formatShown(golferShown(l.espn_golfer_id, results, s, final))}</span>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
