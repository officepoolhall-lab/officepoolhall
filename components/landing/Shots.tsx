import type { ReactNode } from "react";
import { GolfLeaderboard, type LeaderRow } from "@/components/GolfLeaderboard";
import { GridPanel } from "@/components/GridPanel";
import { GridView } from "@/components/GridView";
import { StandingsTable } from "@/components/StandingsTable";
import { PickBoard } from "@/app/p/[slug]/picks/PickBoard";
import { Scoreboard } from "@/app/p/[slug]/scoreboard/Scoreboard";
import { formatInTimeZone } from "date-fns-tz";
import { getSlateGames } from "@/lib/pool";
import { getTeamRecords } from "@/lib/teamRecords";
import {
  getLandingPool,
  landingGolf,
  landingStandings,
  scoresSnapshot,
  slateFor,
  weekPicks,
  type LandingPool,
} from "@/lib/landingShots";
import { ShotTabs } from "./ShotTabs";

// The landing page's look inside: the real My Picks, Grid, Scores, Pool Summary, Standings and
// golf Leaderboard, each drawn by the app's own components from a real pool (lib/landingShots.ts),
// shown like screenshots: framed, a fixed height, nothing to click.

/** A window around one page: `inert` (a picture, not a page) and its own containing block so
    the page's fixed bottom bar sits inside the frame. */
function Frame({ title, children, height = "h-[36rem]" }: { title: string; children: ReactNode; height?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-bg ring-1 ring-line shadow-[0_24px_60px_-24px_rgba(0,0,0,0.35)]">
      <div className="flex items-center gap-2 border-b border-line bg-surface/60 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-line" />
        <span className="size-2.5 rounded-full bg-line" />
        <span className="size-2.5 rounded-full bg-line" />
        <span className="ml-2 truncate text-xs font-semibold text-muted">{title}</span>
      </div>
      <div inert className={`relative ${height} overflow-hidden px-4 py-4 [transform:translateZ(0)] sm:px-6`}>
        {children}
      </div>
    </div>
  );
}

async function MyPicksShot({ lp }: { lp: LandingPool }) {
  const { ctx } = lp;
  const slate = await slateFor(lp, lp.picksWeek);
  if (!slate) return null;
  const [games, { data: picks }, { data: score }] = await Promise.all([
    getSlateGames(ctx, slate.id),
    ctx.supabase.from("picks").select("*").eq("slate_id", slate.id).eq("user_id", ctx.entryUserId),
    ctx.supabase.from("slate_scores").select("points, wins, losses, pushes").eq("slate_id", slate.id).eq("user_id", ctx.entryUserId).maybeSingle(),
  ]);
  const records = await getTeamRecords("nfl", games.map((g) => g.startAt)).catch(() => ({}));
  return (
    <>
      <h2 className="mb-4 text-xl font-extrabold tracking-[-0.03em]">{slate.label ?? `Week ${slate.week}`}</h2>
      <PickBoard
        slug={lp.slug}
        slate={{ id: slate.id, week: slate.week, status: slate.status, lockAt: slate.lock_at, firstDayLockAt: slate.first_day_lock_at }}
        games={games}
        initialPicks={(picks ?? []).map((p) => ({ game_id: p.game_id, picked_side: p.picked_side as "home" | "away", confidence: p.confidence }))}
        graded={Object.fromEntries(
          (picks ?? []).filter((p) => p.result !== null).map((p) => [p.game_id, { result: p.result!, points: Number(p.points ?? 0), bonus: Number(p.bonus ?? 0) }]),
        )}
        score={score ? { points: Number(score.points), wins: score.wins, losses: score.losses, pushes: score.pushes } : null}
        settings={{
          pickType: ctx.settings.pick_type,
          picksPerSlate: ctx.settings.picks_per_slate,
          tiers: ctx.settings.confidence?.tiers ?? null,
          minusPoints: ctx.settings.confidence?.wrong_pick === "minus_points",
          maxUpsetBonus: ctx.settings.upset_bonus ? Math.max(...ctx.settings.upset_bonus.tiers.map((t) => t.bonus)) : null,
          timezone: ctx.displayTz,
          poolTimezone: ctx.settings.timezone,
          bookmaker: ctx.settings.lines.bookmaker,
          lockMode: ctx.settings.lock.mode,
          fullCard: ctx.settings.full_card,
        }}
        viewOnly
        records={records}
        sport="nfl"
      />
    </>
  );
}

async function ScoresShot({ lp }: { lp: LandingPool }) {
  const slate = await slateFor(lp, lp.scoresWeek);
  if (!slate) return null;
  const snap = await scoresSnapshot(lp, slate.id);
  if (!snap) return null;
  const today = formatInTimeZone(Date.now(), lp.ctx.displayTz, "yyyy-MM-dd");
  return (
    <>
      <h2 className="mb-4 text-xl font-extrabold tracking-[-0.03em]">
        Scoreboard <span className="text-muted">· {slate.label ?? `Week ${slate.week}`}</span>
      </h2>
      <Scoreboard
        day={snap.days.includes(today) ? today : snap.days[0]}
        slug={lp.slug}
        week={slate.week}
        games={snap.games}
        timezone={lp.ctx.displayTz}
        sport="nfl"
        records={{}}
        ats={lp.ctx.settings.pick_type === "ats"}
        inPool={[]}
        showFilters={false}
        weekDays={snap.days}
      />
    </>
  );
}

async function SummaryShot({ lp }: { lp: LandingPool }) {
  const slate = await slateFor(lp, lp.scoresWeek);
  if (!slate) return null;
  const [games, picks] = await Promise.all([getSlateGames(lp.ctx, slate.id), weekPicks(lp, slate.id)]);
  return (
    <div className="mx-auto max-w-md">
      <h2 className="mb-4 text-xl font-extrabold tracking-[-0.03em]">
        Pool Summary <span className="text-muted">· {slate.label ?? `Week ${slate.week}`}</span>
      </h2>
      <GridPanel
        games={games}
        picks={picks as Parameters<typeof GridPanel>[0]["picks"]}
        revealed={() => true}
        me={lp.ctx.entryUserId}
        ats={lp.ctx.settings.pick_type === "ats"}
        confidence={Boolean(lp.ctx.settings.confidence)}
        layout="drawer"
      />
    </div>
  );
}

async function StandingsShot({ lp }: { lp: LandingPool }) {
  const rows = await landingStandings(lp);
  return (
    <>
      <h2 className="mb-4 text-xl font-extrabold tracking-[-0.03em]">Standings</h2>
      <StandingsTable rows={rows} me={lp.ctx.entryUserId} limit={14} />
    </>
  );
}

async function LeaderboardShot() {
  const golf = await landingGolf();
  if (!golf) return null;
  const rows: LeaderRow[] = golf.golfers.map((g) => ({
    id: g.id,
    name: g.name,
    country: g.country,
    flag: g.flag,
    pos: g.out ?? (g.pos === "-" ? "" : g.pos),
    toPar: g.toPar,
    thru: g.thru,
    rounds: g.rounds,
    today: null,
    earnings: g.earnings,
    pickedBy: 0,
    mine: golf.mine.has(g.id),
  }));
  return (
    <>
      <h2 className="mb-4 text-xl font-extrabold tracking-[-0.03em]">{golf.event}</h2>
      <GolfLeaderboard rows={rows} round={golf.round} state="live" eventName={golf.event} tournamentId={null} />
    </>
  );
}

/** The tabs of real pages, or nothing when the pool can't be read. */
export async function Shots() {
  const lp = await getLandingPool();
  if (!lp) return null;
  const [picks, grid, scores, summary, standings, leaderboard] = await Promise.all([
    MyPicksShot({ lp }).catch(() => null),
    GridView({ ctx: lp.ctx, slug: lp.slug, week: lp.picksWeek, embed: { maxRows: 18, rename: lp.rename } }).catch(() => null),
    ScoresShot({ lp }).catch(() => null),
    SummaryShot({ lp }).catch(() => null),
    StandingsShot({ lp }).catch(() => null),
    LeaderboardShot().catch(() => null),
  ]);
  const tabs = [
    { id: "picks", label: "My Picks", node: picks },
    { id: "grid", label: "League Grid", node: grid },
    { id: "scores", label: "Scores", node: scores },
    { id: "summary", label: "Pool Summary", node: summary },
    { id: "standings", label: "Standings", node: standings },
    { id: "leaderboard", label: "Golf Leaderboard", node: leaderboard },
  ]
    .filter((t) => t.node)
    .map((t) => ({ id: t.id, label: t.label, node: <Frame title={t.label}>{t.node}</Frame> }));
  if (!tabs.length) return null;
  return <ShotTabs tabs={tabs} />;
}
