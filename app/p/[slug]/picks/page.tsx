import type { Metadata } from "next";
import Link from "next/link";
import { chipClass, Empty, PageTitle } from "@/components/ui";
import { windowLabel } from "@/lib/format";
import { getCurrentSlate, getPoolContext, getPublishedSlates, getSlateGames } from "@/lib/pool";
import { PickBoard } from "./PickBoard";

export const metadata: Metadata = { title: "My picks" };

export default async function PicksPage({ params, searchParams }: PageProps<"/p/[slug]/picks">) {
  const { slug } = await params;
  const { for: forParam, week: weekParam } = await searchParams;
  const ctx = await getPoolContext(slug);
  const [slates, current] = await Promise.all([getPublishedSlates(ctx), getCurrentSlate(ctx)]);

  if (!current) {
    return (
      <>
        <PageTitle>My picks</PageTitle>
        <Empty>No week is open yet. The commissioner publishes each slate before the first game.</Empty>
      </>
    );
  }

  // Commissioner entering picks on behalf of a player: /picks?for=<user id>
  const forUserId = ctx.isCommissioner && typeof forParam === "string" && forParam !== ctx.user.id ? forParam : undefined;
  // Another week: /picks?week=<n>. Defaults to the current slate.
  const slate = typeof weekParam === "string" ? slates.find((s) => s.week === Number(weekParam)) : current;
  const weekHref = (week: number) => `/p/${slug}/picks?week=${week}${forUserId ? `&for=${forUserId}` : ""}`;

  const weekChips = slates.length > 1 && (
    <div className="-mx-4 mb-3 flex gap-1 overflow-x-auto px-4 py-1.5">
      {[...slates].reverse().map((s) => (
        <Link
          key={s.id}
          href={weekHref(s.week)}
          aria-current={s.id === slate?.id ? "page" : undefined}
          className={chipClass(s.id === slate?.id, "", "sm")}
        >
          {s.label ?? `Week ${s.week}`}
        </Link>
      ))}
    </div>
  );

  if (!slate) {
    return (
      <>
        <PageTitle>My picks</PageTitle>
        {weekChips}
        <Empty>That week isn&apos;t published.</Empty>
      </>
    );
  }

  const userId = forUserId ?? ctx.user.id;
  const [{ data: picks }, forName, { data: score }, games] = await Promise.all([
    forUserId
      ? ctx.supabase.rpc("member_picks", { p_slate_id: slate.id, p_user_id: forUserId })
      : ctx.supabase.from("picks").select("*").eq("slate_id", slate.id).eq("user_id", ctx.user.id),
    forUserId
      ? ctx.supabase.from("profiles").select("display_name").eq("id", forUserId).maybeSingle().then(({ data }) => data?.display_name ?? "player")
      : null,
    // The week's official total (it includes a missed week's last-place score).
    ctx.supabase.from("slate_scores").select("points, wins, losses, pushes").eq("slate_id", slate.id).eq("user_id", userId).maybeSingle(),
    getSlateGames(ctx, slate.id),
  ]);

  return (
    <>
      <PageTitle sub={windowLabel(slate.window_start, slate.window_end, ctx.settings.timezone)}>
        {slate.label ?? `Week ${slate.week}`}
        {forName && <span className="text-accent"> for {forName}</span>}
      </PageTitle>
      {weekChips}
      <PickBoard
        // A fresh board per week and player: its draft state belongs to one slate.
        key={`${slate.id}:${userId}`}
        slug={slug}
        slate={{ id: slate.id, status: slate.status, lockAt: slate.lock_at, firstDayLockAt: slate.first_day_lock_at }}
        games={games}
        initialPicks={(picks ?? []).map((p) => ({ game_id: p.game_id, picked_side: p.picked_side as "home" | "away", confidence: p.confidence }))}
        // What grade_slate actually scored, which the board prefers over its own estimate.
        graded={Object.fromEntries(
          (picks ?? [])
            .filter((p) => p.result !== null)
            .map((p) => [p.game_id, { result: p.result!, points: Number(p.points ?? 0), bonus: Number(p.bonus ?? 0) }]),
        )}
        edited={(picks ?? []).filter((p) => p.edited_by !== null).map((p) => p.game_id)}
        score={score ? { points: Number(score.points), wins: score.wins, losses: score.losses, pushes: score.pushes } : null}
        settings={{
          pickType: ctx.settings.pick_type,
          picksPerSlate: ctx.settings.picks_per_slate,
          tiers: ctx.settings.confidence?.tiers ?? null,
          minusPoints: ctx.settings.confidence?.wrong_pick === "minus_points",
          maxUpsetBonus: ctx.settings.upset_bonus ? Math.max(...ctx.settings.upset_bonus.tiers.map((t) => t.bonus)) : null,
          timezone: ctx.settings.timezone,
          bookmaker: ctx.settings.lines.bookmaker,
          lockMode: ctx.settings.lock.mode,
        }}
        forUserId={forUserId}
      />
    </>
  );
}
