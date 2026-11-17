import type { CSSProperties } from "react";
import { AutoRefresh } from "@/components/AutoRefresh";
import { GolfEventSelect } from "@/components/GolfEventSelect";
import { Empty, PageTitle } from "@/components/ui";
import { type GolfContext, type GolfEvent, getGolfMembers, money, shortEventName } from "@/lib/golf";
import { fantasyPoints, formatToPar, toParScores, type MajorsSettings } from "@/lib/golfMajors";
import { getMajorsScoreboard } from "@/lib/golfMajorsData";

const pts = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "");

/**
 * Standings for a Majors pool. Cumulative pools: every major's score and the total. Each major
 * on its own: one major at a time (dropdown). Tap an entry to see its golfers; the ones that
 * count are in bold. Lineups show once each major has started.
 */
export async function MajorsStandings({ slug, ctx, events, eventParam }: { slug: string; ctx: GolfContext; events: GolfEvent[]; eventParam?: string }) {
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
  const rows = board.standingsFor(columns.map((e) => e.id));
  const fmt = (v: number | null | undefined) =>
    v === null || v === undefined ? "–" : s.contest === "salary" ? pts(v) : s.tiers.scoring === "earnings" ? money(v) : formatToPar(v);
  const me = ctx.entryUserId;

  return (
    <div data-wide className="mx-auto max-w-5xl">
      <AutoRefresh active={live} seconds={60} />
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <PageTitle>Standings</PageTitle>
          <p className="-mt-4 text-xs text-muted">
            {each ? focus!.name : `${started.length === 1 ? started[0].name : `${started.length} majors`} · cumulative`}
            {live && <span className="font-semibold text-live"> · Live</span>}
          </p>
        </div>
        {each && started.length > 1 && (
          <GolfEventSelect basePath={`/p/${slug}/golf/standings`} value={focus!.id} events={started.map((e) => ({ id: e.id, label: e.name }))} />
        )}
      </div>

      <div className="border-t border-line">
        <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_repeat(var(--n),4.5rem)] items-center gap-x-2 border-b-2 border-ink/25 bg-surface px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted" style={{ "--n": columns.length > 1 ? columns.length + 1 : 1 } as CSSProperties}>
          <span>Pos</span>
          <span>Entry</span>
          {columns.length > 1 && columns.map((e) => <span key={e.id} className="text-right">{shortEventName(e.name)}</span>)}
          <span className="text-right">{columns.length > 1 ? "Total" : s.contest === "salary" ? "Points" : s.tiers.scoring === "earnings" ? "Money" : "To Par"}</span>
        </div>
        {rows.map((r) => (
          <details key={r.user_id} className={`group border-b border-line ${r.user_id === me ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : ""}`}>
            <summary
              className="grid cursor-pointer list-none grid-cols-[2.5rem_minmax(0,1fr)_repeat(var(--n),4.5rem)] items-center gap-x-2 px-2 py-2 text-sm hover:bg-surface [&::-webkit-details-marker]:hidden"
              style={{ "--n": columns.length > 1 ? columns.length + 1 : 1 } as CSSProperties}
            >
              <span className="tabular-nums text-muted">{r.total === null ? "" : r.rank}</span>
              <span className={`truncate font-medium ${r.user_id === me ? "text-accent" : ""}`}>{names.get(r.user_id) ?? "Player"}</span>
              {columns.length > 1 &&
                columns.map((e) => (
                  <span key={e.id} className="text-right tabular-nums text-muted">
                    {fmt(r.byEvent.get(e.id))}
                  </span>
                ))}
              <span className="text-right font-semibold tabular-nums">{fmt(r.total)}</span>
            </summary>
            <div className="grid gap-3 px-2 pb-3 pl-12 sm:grid-cols-2">
              {columns.map((e) => (
                <Lineup key={e.id} event={e} userId={r.user_id} board={board} s={s} showName={columns.length > 1} />
              ))}
            </div>
          </details>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        {s.contest === "tiers" && s.tiers.scoring === "to_par"
          ? "Lowest total wins. A golfer who misses the cut takes the worst score of anyone who made it. An entry with no lineup takes the worst entry's score."
          : "Highest total wins."}{" "}
        Tap an entry to see its golfers.
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
  const tp = toParScores(results);
  const counts = new Map(score?.golfers.map((g) => [g.espn_golfer_id, g]) ?? []);
  const value = (id: string) => {
    const r = byId.get(id);
    if (!r) return "–";
    if (s.contest === "salary") return pts(fantasyPoints(r, event.status === "final").total);
    if (s.tiers.scoring === "earnings") return money(r.earnings);
    return formatToPar(tp.get(id) ?? null);
  };
  return (
    <div>
      {showName && <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{event.name}</div>}
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No lineup.</p>
      ) : (
        <ul className="text-sm">
          {[...rows]
            .sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0) || (b.salary ?? 0) - (a.salary ?? 0))
            .map((l) => {
              const r = byId.get(l.espn_golfer_id);
              const counted = counts.get(l.espn_golfer_id)?.counts;
              return (
                <li key={l.espn_golfer_id} className={`flex items-center gap-2 py-0.5 ${counted ? "" : "text-muted"}`}>
                  <span className="w-12 shrink-0 text-[11px] tabular-nums text-muted">{s.contest === "salary" ? `$${((l.salary ?? 0) / 1000).toFixed(1)}K` : `T${l.tier}`}</span>
                  <span className={`min-w-0 flex-1 truncate ${counted ? "font-medium" : ""}`}>{l.golfer_name}</span>
                  <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted">{r?.out ? "MC" : (r?.pos ?? "")}</span>
                  <span className={`w-16 shrink-0 text-right tabular-nums ${counted ? "font-semibold" : ""}`}>{value(l.espn_golfer_id)}</span>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
