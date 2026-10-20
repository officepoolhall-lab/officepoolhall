import "server-only";
import type { PoolContext } from "./pool";

// In-season tournament champion picks (see supabase/migrations/…_tournaments.sql).

export type Scoring = "third_place" | "semifinals";
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
    { id: "champion", label: "Champion", points: 5 },
    { id: "runner_up", label: "Runner-up", points: 3 },
    { id: "semifinal", label: "Lost in semifinal", points: 1.5 },
  ],
};

export const SCORING_LABEL: Record<Scoring, string> = {
  third_place: "Champion 5 · Runner-up 3 · 3rd-place game 2 / 1",
  semifinals: "Champion 5 · Runner-up 3 · Semifinal losers 1.5",
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
