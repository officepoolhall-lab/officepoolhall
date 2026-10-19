import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "./auth";
import { createClient } from "./supabase/server";
import { effectiveLockAt } from "./locks";
import { poolSettingsSchema } from "./poolSettings";

export { effectiveLockAt } from "./locks";

/**
 * The pool for /p/[slug], the signed-in user, their role, and the entry they act for: their
 * own, or the one they co-manage (`managing`). 404s for anyone who is neither (RLS hides the
 * pool). Pages use `entryUserId` for "my picks / my row" so co-managers see the owner's entry.
 */
export const getPoolContext = cache(async (slug: string) => {
  const user = await requireUser(`/p/${slug}`);
  const supabase = await createClient();

  // The pool plus the caller's own membership row (RLS already hides pools the caller can't
  // see), and the entries they co-manage. If the co-manager migration isn't in the database
  // yet, that call fails and members carry on as before.
  const [{ data: row }, { data: managed }] = await Promise.all([
    supabase.from("pools").select("*, pool_members ( role, paid, user_id )").eq("slug", slug).eq("pool_members.user_id", user.id).maybeSingle(),
    supabase.rpc("my_comanaged_entries"),
  ]);
  if (!row) notFound();

  const { pool_members: members, ...pool } = row;
  const me = members?.[0];
  const co = me ? null : (managed ?? []).find((m: { pool_id: string }) => m.pool_id === pool.id) ?? null;
  if (!me && !co) notFound();
  const settings = poolSettingsSchema.parse(pool.settings);
  return {
    supabase,
    user,
    pool,
    settings,
    isCommissioner: me?.role === "commissioner",
    /** Whose picks, scores and standings row are "mine" here. */
    entryUserId: me ? user.id : co!.owner_id,
    /** Set when the viewer co-manages someone else's entry in this pool. */
    managing: co ? { ownerId: co.owner_id, ownerName: co.owner_name } : null,
  };
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

/** Every published (non-draft) slate, newest week first. */
// Cached per request: the pool layout and its page both ask for it.
export const getPublishedSlates = cache(async (ctx: PoolContext) => {
  const { data } = await ctx.supabase
    .from("slates")
    .select("*")
    .eq("pool_id", ctx.pool.id)
    .neq("status", "draft")
    .order("week", { ascending: false });
  return data ?? [];
});

/** The slate players should be looking at: the latest open/locked one, else the latest graded. */
export const getCurrentSlate = cache(async (ctx: PoolContext) => {
  const slates = await getPublishedSlates(ctx);
  return slates.find((s) => s.status === "open") ?? slates.find((s) => s.status === "locked") ?? slates[0] ?? null;
});
