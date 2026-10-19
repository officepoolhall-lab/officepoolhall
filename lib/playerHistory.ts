import "server-only";
import { getPublishedSlates, type PoolContext } from "./pool";

export type HistoryWeek = {
  slateId: string;
  week: number;
  label: string;
  status: string;
  points: number;
  wins: number;
  losses: number;
  pushes: number;
  /** No picks that week (scored per settings.missed_week). */
  missed: boolean;
  /** Rank that week among the pool's members; ties share a rank. Null before anything is scored. */
  rank: number | null;
  of: number;
};

/**
 * One member's week-by-week results, oldest week first, with their rank each week. Null when
 * they aren't in the pool. Reads every member's slate_scores once (RLS: pool members only).
 */
export async function getPlayerHistory(ctx: PoolContext, userId: string) {
  const slates = await getPublishedSlates(ctx);
  const ids = slates.map((s) => s.id);
  const [{ data: members }, { data: scores }] = await Promise.all([
    ctx.supabase.from("pool_members").select("user_id, profile:profiles!inner ( display_name )").eq("pool_id", ctx.pool.id),
    ids.length
      ? ctx.supabase.from("slate_scores").select("slate_id, user_id, points, wins, losses, pushes, missed").in("slate_id", ids)
      : Promise.resolve({ data: [] as { slate_id: string; user_id: string; points: number; wins: number; losses: number; pushes: number; missed: boolean }[] }),
  ]);
  const member = members?.find((m) => m.user_id === userId);
  if (!member) return null;
  const memberIds = new Set((members ?? []).map((m) => m.user_id));

  const weeks: HistoryWeek[] = [...slates]
    .sort((a, b) => a.week - b.week)
    .map((s) => {
      const forSlate = (scores ?? []).filter((x) => x.slate_id === s.id && memberIds.has(x.user_id));
      const mine = forSlate.find((x) => x.user_id === userId);
      const points = Number(mine?.points ?? 0);
      const anyScored = forSlate.some((x) => x.wins + x.losses + x.pushes > 0 || x.missed);
      return {
        slateId: s.id,
        week: s.week,
        label: s.label ?? `Week ${s.week}`,
        status: s.status,
        points,
        wins: mine?.wins ?? 0,
        losses: mine?.losses ?? 0,
        pushes: mine?.pushes ?? 0,
        missed: Boolean(mine?.missed),
        rank: anyScored ? 1 + forSlate.filter((x) => Number(x.points) > points).length : null,
        of: memberIds.size,
      };
    });

  return { name: member.profile.display_name, weeks };
}
