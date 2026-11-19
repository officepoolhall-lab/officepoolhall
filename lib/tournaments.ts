import "server-only";
import type { PoolContext } from "./pool";

// In-season tournament champion picks (see supabase/migrations/…_tournaments.sql).

export type Scoring = "third_place" | "semifinals" | "champion_only";
export type Placement = "champion" | "runner_up" | "third" | "fourth" | "semifinal";

export type TournamentTeam = {
  id: string;
  name: string;
  short_name: string | null;
  abbreviation: string | null;
  logo_url: string | null;
  placement: Placement | null;
};

export type Tournament = {
  id: string;
  name: string;
  week: number;
  lockAt: string;
  scoring: Scoring;
  /** Alphabetical. */
  teams: TournamentTeam[];
  /** Results are in once a champion is set. */
  decided: boolean;
};

/** Places each scoring style uses, best first, with their labels and points. */
export const PLACES: Record<Scoring, { id: Placement; label: string; points: number }[]> = {
  third_place: [
    { id: "champion", label: "Champion", points: 5 },
    { id: "runner_up", label: "Runner-up", points: 3 },
    { id: "third", label: "Won 3rd-place game", points: 2 },
    { id: "fourth", label: "Lost 3rd-place game", points: 1 },
  ],
  semifinals: [
    { id: "champion", label: "Champion", points: 7 },
    { id: "runner_up", label: "Runner-up", points: 5 },
    { id: "semifinal", label: "Lost in semifinal", points: 2 },
  ],
  // Conference tournaments.
  champion_only: [{ id: "champion", label: "Champion", points: 5 }],
};

export const SCORING_LABEL: Record<Scoring, string> = {
  third_place: "Champion 5 · Runner-up 3 · 3rd-place game 2 / 1",
  semifinals: "Champion 7 · Runner-up 5 · Semifinal losers 2",
  champion_only: "Champion 5",
};

export function placeLabel(scoring: Scoring, placement: Placement | null) {
  return PLACES[scoring].find((p) => p.id === placement)?.label ?? null;
}

/** Every tournament in the pool, by lock time, with its field. */
export async function getTournaments(ctx: PoolContext): Promise<Tournament[]> {
  const { data } = await ctx.supabase
    .from("tournaments")
    .select("id, name, week, lock_at, scoring, tournament_teams ( placement, team:teams ( id, name, short_name, abbreviation, logo_url ) )")
    .eq("pool_id", ctx.pool.id)
    .order("lock_at");
  return (data ?? []).map((t) => {
    const teams = (t.tournament_teams ?? [])
      .map((tt) => ({ ...tt.team, placement: (tt.placement as Placement | null) ?? null }))
      .sort((a, b) => (a.short_name ?? a.name).localeCompare(b.short_name ?? b.name));
    return {
      id: t.id,
      name: t.name,
      week: t.week,
      lockAt: t.lock_at,
      scoring: t.scoring as Scoring,
      teams,
      decided: teams.some((x) => x.placement === "champion"),
    };
  });
}

export type TournamentPick = { tournament_id: string; user_id: string; team_id: string; points: number | null };

/**
 * Picks the viewer can see: their own (and the entry they co-manage) always, everyone's once a
 * tournament locks (RLS). Optionally just one player's.
 */
export async function getTournamentPicks(ctx: PoolContext, ids: string[], userId?: string): Promise<TournamentPick[]> {
  if (!ids.length) return [];
  let q = ctx.supabase.from("tournament_picks").select("tournament_id, user_id, team_id, points").in("tournament_id", ids);
  if (userId) q = q.eq("user_id", userId);
  const { data } = await q;
  return (data ?? []).map((p) => ({ ...p, points: p.points === null ? null : Number(p.points) }));
}

/** The commissioner's view of one player's champion picks, even before a tournament locks. */
export async function getMemberTournamentPicks(ctx: PoolContext, userId: string): Promise<TournamentPick[]> {
  const { data, error } = await ctx.supabase.rpc("member_tournament_picks", { p_pool_id: ctx.pool.id, p_user_id: userId });
  if (error) throw error;
  return (data ?? []).map((p) => ({ ...p, points: p.points === null ? null : Number(p.points) }));
}

/** A champion's points: the most one in-season tournament pick can add to a week (by its scoring). */
export const championPoints = (scoring: Scoring) => PLACES[scoring][0].points;

/**
 * What a week's in-season tournaments (MTEs; not conference tournaments) can still add to an
 * entry's week score: a champion's points for each one not yet decided. Before one locks
 * anyone can still pick (and others' picks aren't visible yet), so every entry has it; after,
 * only entries with a pick in it. Used for "possible" points on Home and the Grid.
 */
export function tournamentUpside(weekTournaments: Tournament[], picks: TournamentPick[], userId: string, now: number) {
  return weekTournaments
    .filter(
      (t) =>
        t.scoring !== "champion_only" &&
        !t.decided &&
        (Date.parse(t.lockAt) > now || picks.some((p) => p.tournament_id === t.id && p.user_id === userId)),
    )
    .reduce((sum, t) => sum + championPoints(t.scoring), 0);
}
