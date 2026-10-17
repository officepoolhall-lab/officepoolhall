import type { Metadata } from "next";
import { Empty, PageTitle } from "@/components/ui";
import { windowLabel } from "@/lib/format";
import { getCurrentSlate, getPoolContext, getSlateGames } from "@/lib/pool";
import { PickBoard } from "./PickBoard";

export const metadata: Metadata = { title: "My picks" };

export default async function PicksPage({ params, searchParams }: PageProps<"/p/[slug]/picks">) {
  const { slug } = await params;
  const { for: forParam } = await searchParams;
  const ctx = await getPoolContext(slug);
  const slate = await getCurrentSlate(ctx);

  if (!slate) {
    return (
      <>
        <PageTitle>My picks</PageTitle>
        <Empty>No week is open yet. The commissioner publishes each slate before the first game.</Empty>
      </>
    );
  }

  // Commissioner entering picks on behalf of a player: /picks?for=<user id>
  const forUserId = ctx.isCommissioner && typeof forParam === "string" && forParam !== ctx.user.id ? forParam : undefined;
  let forName: string | null = null;
  let picks;
  if (forUserId) {
    const [{ data }, { data: profile }] = await Promise.all([
      ctx.supabase.rpc("member_picks", { p_slate_id: slate.id, p_user_id: forUserId }),
      ctx.supabase.from("profiles").select("display_name").eq("id", forUserId).maybeSingle(),
    ]);
    picks = data;
    forName = profile?.display_name ?? "player";
  } else {
    ({ data: picks } = await ctx.supabase.from("picks").select("*").eq("slate_id", slate.id).eq("user_id", ctx.user.id));
  }
  const games = await getSlateGames(ctx, slate.id);

  return (
    <>
      <PageTitle sub={windowLabel(slate.window_start, slate.window_end, ctx.settings.timezone)}>
        {slate.label ?? `Week ${slate.week}`}
        {forName && <span className="text-accent"> for {forName}</span>}
      </PageTitle>
      <PickBoard
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
