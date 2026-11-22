import "server-only";
import { getBenchedIds } from "./bench";
import { hasStarted } from "./locks";
import { getPublishedSlates, type PoolBase } from "./pool";
import { survivorSettings, type SvGame, type SvMember, type SvPick, type SvWeek } from "./survivor";

// A Survivor pool's season in one load: its published weeks with their games, the picks the
// viewer can see (their own always; everyone's once each game kicks off) and the entries.

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TEAM = "id, name, short_name, abbreviation, logo_url";

/**
 * `revealFor`: the entry the commissioner is picking for. The commissioner can read every pick
 * (to make or fix one), but the pages only show them another entry's pick before kickoff when
 * they've opened that entry on purpose, the same as any player sees.
 */
export async function getSurvivor(ctx: PoolBase, revealFor?: string) {
  const settings = survivorSettings(ctx.pool.settings);
  const slates = (await getPublishedSlates(ctx)) as Row[];
  const ids = slates.map((s) => s.id as string);
  const db = ctx.supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [{ data: gameRows }, { data: pickRows }, { data: memberRows }, benched] = await Promise.all([
    ids.length
      ? db
          .from("slate_games")
          .select(
            `slate_id, voided, override_home_score, override_away_score,
             game:games!inner ( id, start_at, time_tbd, status, home_score, away_score,
               home:teams!games_home_team_id_fkey ( ${TEAM} ), away:teams!games_away_team_id_fkey ( ${TEAM} ) )`,
          )
          .in("slate_id", ids)
      : Promise.resolve({ data: [] }),
    db.from("survivor_picks").select("slate_id, user_id, game_id, team_id").eq("pool_id", ctx.pool.id),
    db.from("pool_members").select("user_id, joined_at, profile:profiles!inner ( display_name )").eq("pool_id", ctx.pool.id),
    getBenchedIds(ctx.supabase, ctx.pool.id),
  ]);
  // eslint-disable-next-line react-hooks/purity -- render-time snapshot of which games have started
  const now = Date.now();
  const bySlate = new Map<string, SvGame[]>();
  for (const r of (gameRows ?? []) as Row[]) {
    const g = r.game;
    const game: SvGame = {
      id: g.id,
      startAt: g.start_at,
      started: hasStarted({ startAt: g.start_at, timeTbd: g.time_tbd, status: g.status }, now),
      final: g.status === "final",
      voided: r.voided,
      homeScore: r.override_home_score ?? g.home_score,
      awayScore: r.override_away_score ?? g.away_score,
      home: g.home,
      away: g.away,
    };
    bySlate.set(r.slate_id, [...(bySlate.get(r.slate_id) ?? []), game]);
  }
  const weeks: SvWeek[] = slates
    .map((s) => ({
      slateId: s.id as string,
      week: s.week as number,
      label: (s.label as string | null) ?? `Week ${s.week}`,
      games: (bySlate.get(s.id) ?? []).sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id)),
    }))
    .sort((a, b) => a.week - b.week);
  const started = new Set([...bySlate.values()].flat().filter((g) => g.started).map((g) => g.id));
  const picks: SvPick[] = ((pickRows ?? []) as Row[])
    .map((p) => ({ slateId: p.slate_id, userId: p.user_id, gameId: p.game_id, teamId: p.team_id }))
    .filter((p) => p.userId === ctx.entryUserId || p.userId === revealFor || started.has(p.gameId));
  const members: SvMember[] = ((memberRows ?? []) as Row[])
    .filter((m) => !benched.has(m.user_id))
    .map((m) => ({ userId: m.user_id, name: m.profile.display_name, joinedAt: m.joined_at }));
  return { settings, weeks, picks, members };
}
