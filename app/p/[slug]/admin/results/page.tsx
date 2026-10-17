import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Empty, StatusText, buttonClass, chipClass } from "@/components/ui";
import { gameTime } from "@/lib/format";
import { getSlateGames, requireCommissioner, type PoolContext, type SlateGame } from "@/lib/pool";
import { overrideResult, setVoided } from "../actions";
import { Matchup } from "@/components/Matchup";

export const metadata: Metadata = { title: "Results" };

export default async function ResultsPage({ params, searchParams }: PageProps<"/p/[slug]/admin/results">) {
  const { slug } = await params;
  const { week } = await searchParams;
  const ctx = await requireCommissioner(slug);
  const { data: slates } = await ctx.supabase
    .from("slates").select("id, week, label, status").eq("pool_id", ctx.pool.id).neq("status", "draft").order("week", { ascending: false });
  const slate = slates?.find((s) => s.week === Number(week)) ?? slates?.[0];
  if (!slate) return <Empty>Results show up here once a week is published.</Empty>;
  const [games, splits] = await Promise.all([getSlateGames(ctx, slate.id), pickSplits(ctx, slate.id)]);
  const tz = ctx.settings.timezone;
  const upsetTiers = ctx.settings.upset_bonus?.tiers ?? [];

  return (
    <>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {slates?.map((s) => (
          <Link
            key={s.id}
            href={`/p/${slug}/admin/results?week=${s.week}`}
            aria-current={s.id === slate.id ? "page" : undefined}
            className={chipClass(s.id === slate.id, "min-h-11")}
          >
            {s.label ?? `Week ${s.week}`}{" "}
            {/* Status colors fail contrast on the ink-filled active chip, so it inherits there. */}
            {s.id === slate.id ? <span className="text-xs font-semibold opacity-70">{STATUS_LABEL[s.status] ?? s.status}</span> : <StatusText status={s.status} />}
          </Link>
        ))}
      </div>
      <p className="mb-4 text-sm text-muted">
        Scores come from ESPN every few minutes. Override one here if it&apos;s wrong — your score wins over the feed and
        standings recompute right away. Void a game (postponed, cancelled) to score it 0 for everyone.
      </p>
      <ul className="divide-y divide-line border-t border-line">
        {games.map((g) => (
          <li key={g.id} className={`py-3 ${g.voided ? "opacity-60" : ""}`}>
            <div className="mb-2 min-w-0">
              <Matchup away={g.away} home={g.home} neutral={g.neutral} />
              <div className="text-xs text-muted tabular-nums">
                {gameTime(g.startAt, tz)} ·{" "}
                {g.voided ? (
                  <span className="font-semibold text-loss">Void</span>
                ) : g.overridden ? (
                  <span className="font-semibold text-ink">Overridden</span>
                ) : (
                  sentence(g.status)
                )}
              </div>
              {!g.voided && (g.status === "final" || g.overridden) && (
                <SplitLine
                  split={splits.get(g.id)} home={g.home.abbreviation ?? "Home"} away={g.away.abbreviation ?? "Away"}
                  tiers={upsetTiers} weighted={Boolean(ctx.settings.confidence)} winner={winnerOf(g, ctx.settings.pick_type === "ats")}
                />
              )}
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <ActionForm action={overrideResult.bind(null, slug, slate.id, g.id)} className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  {g.away.abbreviation}
                  <input name="away" type="number" min={0} defaultValue={g.awayScore ?? ""} aria-label={`${g.away.short_name ?? g.away.name} score`} className={scoreInput} />
                </label>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  {g.home.abbreviation}
                  <input name="home" type="number" min={0} defaultValue={g.homeScore ?? ""} aria-label={`${g.home.short_name ?? g.home.name} score`} className={scoreInput} />
                </label>
                <SubmitButton kind="secondary" pending="…" className="!px-4 !text-sm">Save</SubmitButton>
                {g.overridden && (
                  <button name="clear" value="1" className={buttonClass("ghost", "!px-2 !text-sm")}>Use feed</button>
                )}
              </ActionForm>
              <span className="ml-auto">
                <ActionButton action={setVoided.bind(null, slug, slate.id, g.id, !g.voided)} kind={g.voided ? "secondary" : "danger"} className="!px-4 !text-sm">
                  {g.voided ? "Un-void" : "Void"}
                </ActionButton>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

type Split = { home: number; away: number; bonusPicks: number };

/**
 * Per game: the pool's points on each side (confidence, or 1 per pick in a flat pool) and how
 * many picks earned an upset bonus. RLS shows the commissioner everyone's picks once a game
 * locks, which every final game has. Paged because a slate can pass PostgREST's row cap.
 */
async function pickSplits(ctx: PoolContext, slateId: string) {
  const out = new Map<string, Split>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await ctx.supabase
      .from("picks").select("id, game_id, picked_side, confidence, bonus").eq("slate_id", slateId)
      .order("id").range(from, from + PAGE - 1);
    for (const p of data ?? []) {
      const sp = out.get(p.game_id) ?? { home: 0, away: 0, bonusPicks: 0 };
      const w = ctx.settings.confidence ? (p.confidence ?? 0) : 1;
      if (p.picked_side === "home") sp.home += w;
      else sp.away += w;
      if (Number(p.bonus ?? 0) > 0) sp.bonusPicks += 1;
      out.set(p.game_id, sp);
    }
    if (!data || data.length < PAGE) return out;
  }
}

type Winner = "home" | "away" | "push" | null;

/** The side that won (against the frozen spread in ATS pools), or null until the game is final. */
function winnerOf(g: SlateGame, ats: boolean): Winner {
  if (g.voided || !(g.status === "final" || g.overridden) || g.homeScore === null || g.awayScore === null) return null;
  const margin = g.homeScore - g.awayScore + (ats ? (g.spread ?? 0) : 0);
  return margin === 0 ? "push" : margin > 0 ? "home" : "away";
}

/** "DUKE 78% / UNC 22% of points · +1 upset bonus, 2 picks". Mirrors grade_slate's strict tiers. */
function SplitLine({
  split,
  home,
  away,
  tiers,
  weighted,
  winner,
}: {
  split?: Split;
  home: string;
  away: string;
  tiers: { min_share: number; bonus: number }[];
  weighted: boolean;
  winner: Winner;
}) {
  const total = (split?.home ?? 0) + (split?.away ?? 0);
  if (!split || total === 0) return null;
  const majorSide = split.home >= split.away ? "home" : "away";
  const [major, minor] = majorSide === "home" ? [[home, split.home], [away, split.away]] as const : [[away, split.away], [home, split.home]] as const;
  const share = major[1] / total;
  const tier = split.home !== split.away && minor[1] > 0 ? [...tiers].reverse().find((t) => share > t.min_share) : undefined;
  const pctOf = (n: number) => `${Math.round((n / total) * 100)}%`;
  return (
    <div className="text-xs text-muted tabular-nums">
      {major[0]} {pctOf(major[1])} / {minor[0]} {pctOf(minor[1])} of {weighted ? "points" : "picks"}
      {tier &&
        (split.bonusPicks > 0 ? (
          <span className="font-semibold text-win"> · +{tier.bonus} upset bonus, {split.bonusPicks} pick{split.bonusPicks === 1 ? "" : "s"}</span>
        ) : winner === majorSide ? (
          ` · +${tier.bonus} tier, favorite won`
        ) : winner === "push" ? (
          ` · +${tier.bonus} tier, push`
        ) : winner ? (
          // The minority won but no pick carries a bonus yet: grading hasn't caught up.
          ` · +${tier.bonus} tier, not graded yet`
        ) : (
          ` · +${tier.bonus} tier`
        ))}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = { draft: "Draft", open: "Open", locked: "Locked", graded: "Final" };

const scoreInput =
  "h-11 w-16 rounded-[10px] bg-surface px-2 text-right text-[15px] font-semibold tabular-nums text-ink outline-none focus:ring-2 focus:ring-accent";

// Feed statuses arrive as snake_case ("in_progress"); show them in sentence case.
function sentence(status: string) {
  const s = status.replaceAll("_", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
