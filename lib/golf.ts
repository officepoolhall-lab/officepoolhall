import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getPoolBase, type PoolBase } from "./pool";
import { getViewerTimeZone } from "./viewerTime";

/** Golf times show in Central unless the viewer's browser reports another zone. */
export const GOLF_TZ = "America/Chicago";

export const getGolfContext = cache(async (slug: string) => {
  const base = await getPoolBase(slug);
  if (base.pool.sport !== "pga") notFound();
  const displayTz = await getViewerTimeZone(GOLF_TZ);
  return { ...base, displayTz };
});
export type GolfContext = Awaited<ReturnType<typeof getGolfContext>>;

export type GolfEvent = {
  id: string;
  espn_id: string;
  name: string;
  sort_order: number;
  start_at: string | null;
  status: "scheduled" | "in_progress" | "final" | "canceled";
};

export type GolfResult = {
  espn_golfer_id: string;
  golfer_name: string;
  pos: string | null;
  earnings: number;
};

export type GolfPick = {
  user_id: string;
  event_id: string;
  espn_golfer_id: string;
  golfer_name: string;
};

export type GolfStanding = {
  user_id: string;
  display_name: string;
  season_earnings: number;
  events_picked: number;
};

/** An event takes picks until its first tee time, and only while it's still scheduled. */
export function isOpenForPicks(ev: GolfEvent, now = Date.now()) {
  return ev.status === "scheduled" && !!ev.start_at && Date.parse(ev.start_at) > now;
}

/** Events in calendar order for this pool. */
export const getGolfEvents = cache(async (ctx: PoolBase): Promise<GolfEvent[]> => {
  const { data } = await ctx.supabase
    .from("golf_events")
    .select("id, espn_id, name, sort_order, start_at, status")
    .eq("pool_id", ctx.pool.id)
    .order("sort_order");
  return (data ?? []) as GolfEvent[];
});

/** The field and finishes for one event, best earnings first. */
export const getGolfResults = cache(async (ctx: PoolBase, eventId: string): Promise<GolfResult[]> => {
  const { data } = await ctx.supabase
    .from("golf_results")
    .select("espn_golfer_id, golfer_name, pos, earnings")
    .eq("event_id", eventId)
    .order("earnings", { ascending: false })
    .order("golfer_name");
  return (data ?? []) as GolfResult[];
});

/** Picks for the entry this viewer acts for (their own, or the one they co-manage). */
export const getGolfMyPicks = cache(async (ctx: GolfContext): Promise<GolfPick[]> => {
  const { data } = await ctx.supabase
    .from("golf_picks")
    .select("user_id, event_id, espn_golfer_id, golfer_name")
    .eq("pool_id", ctx.pool.id)
    .eq("user_id", ctx.entryUserId);
  return (data ?? []) as GolfPick[];
});

/** Every pick the viewer can see: their own, plus everyone's for events that have started. */
export const getGolfVisiblePicks = cache(async (ctx: PoolBase): Promise<GolfPick[]> => {
  const { data } = await ctx.supabase
    .from("golf_picks")
    .select("user_id, event_id, espn_golfer_id, golfer_name")
    .eq("pool_id", ctx.pool.id);
  return (data ?? []) as GolfPick[];
});

/** Season prize money per entry, from the database's golf_standings. */
export const getGolfStandings = cache(async (ctx: PoolBase): Promise<GolfStanding[]> => {
  const { data } = await ctx.supabase.rpc("golf_standings", { p_pool_id: ctx.pool.id });
  return ((data ?? []) as GolfStanding[]).map((s) => ({ ...s, season_earnings: Number(s.season_earnings) }));
});

/** Members of the pool, for the grid's columns. */
export const getGolfMembers = cache(async (ctx: PoolBase): Promise<{ user_id: string; display_name: string }[]> => {
  const { data } = await ctx.supabase
    .from("pool_members")
    .select("user_id, profile:profiles ( display_name )")
    .eq("pool_id", ctx.pool.id);
  return (data ?? []).map((m) => ({
    user_id: m.user_id,
    display_name: (m.profile as { display_name: string } | null)?.display_name ?? "Player",
  }));
});

export function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
