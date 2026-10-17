import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "./auth";
import { createClient } from "./supabase/server";
import { effectiveLockAt } from "./locks";
import { poolSettingsSchema } from "./poolSettings";

export { effectiveLockAt } from "./locks";

/** The pool for /p/[slug], the signed-in user, and their role. 404s for non-members (RLS hides the pool). */
export const getPoolContext = cache(async (slug: string) => {
  const user = await requireUser(`/p/${slug}`);
  const supabase = await createClient();

  const { data: pool } = await supabase.from("pools").select("*").eq("slug", slug).maybeSingle();
  if (!pool) notFound();

  const { data: me } = await supabase
    .from("pool_members")
    .select("role, paid")
    .eq("pool_id", pool.id)
    .eq("user_id", user.id)
    .maybeSingle();

  const settings = poolSettingsSchema.parse(pool.settings);
  return { supabase, user, pool, settings, isCommissioner: me?.role === "commissioner" };
});

export async function requireCommissioner(slug: string) {
  const ctx = await getPoolContext(slug);
  if (!ctx.isCommissioner) notFound();
  return ctx;
}

export type PoolContext = Awaited<ReturnType<typeof getPoolContext>>;

const GAME_SELECT = `
  game_id, sort_order, locked_home_spread, voided, override_home_score, override_away_score, lock_at,
  slate:slates!inner ( lock_at ),
  game:games!inner (
    id, start_at, time_tbd, manual_time, status, home_score, away_score, neutral_site, venue, tv_network, home_rank, away_rank,
    home:teams!games_home_team_id_fkey ( id, name, short_name, abbreviation, logo_url, conference ),
    away:teams!games_away_team_id_fkey ( id, name, short_name, abbreviation, logo_url, conference )
  )
`;

/**
 * Slate games with teams, sorted by start time. Scores reflect commissioner overrides.
 * `lockAt` is the game's pick deadline (null in per_game mode) and `effectiveLockAt` is
 * when it actually stops taking picks: the same rule the database enforces.
 */
export async function getSlateGames(ctx: PoolContext, slateId: string) {
  const { data, error } = await ctx.supabase.from("slate_games").select(GAME_SELECT).eq("slate_id", slateId);
  if (error) throw error;
  return (data ?? [])
    .map((sg) => {
      // Slates published before per-game deadlines existed only have the slate's lock_at.
      const lockAt = sg.lock_at ?? sg.slate.lock_at;
      return {
        id: sg.game_id,
        startAt: sg.game.start_at,
        timeTbd: sg.game.time_tbd,
        manualTime: sg.game.manual_time,
        lockAt,
        effectiveLockAt: effectiveLockAt(sg.game.start_at, sg.game.time_tbd, lockAt),
        status: sg.game.status,
        homeScore: sg.override_home_score ?? sg.game.home_score,
        awayScore: sg.override_away_score ?? sg.game.away_score,
        overridden: sg.override_home_score !== null,
        neutral: sg.game.neutral_site,
        venue: sg.game.venue,
        tv: sg.game.tv_network,
        homeRank: sg.game.home_rank,
        awayRank: sg.game.away_rank,
        spread: sg.locked_home_spread === null ? null : Number(sg.locked_home_spread),
        voided: sg.voided,
        home: sg.game.home,
        away: sg.game.away,
      };
    })
    .sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id));
}

export type SlateGame = Awaited<ReturnType<typeof getSlateGames>>[number];

/** The slate players should be looking at: the latest open/locked one, else the latest graded. */
export async function getCurrentSlate(ctx: PoolContext) {
  const { data } = await ctx.supabase
    .from("slates")
    .select("*")
    .eq("pool_id", ctx.pool.id)
    .neq("status", "draft")
    .order("week", { ascending: false });
  const slates = data ?? [];
  return slates.find((s) => s.status === "open") ?? slates.find((s) => s.status === "locked") ?? slates[0] ?? null;
}
