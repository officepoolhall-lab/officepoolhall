import type { ReactNode } from "react";
import { FitBox } from "./FitBox";
import { ShotCarousel } from "./ShotCarousel";
import { GridPanel } from "@/components/GridPanel";
import { GridView } from "@/components/GridView";
import { AdminRoster } from "@/components/AdminRoster";
import { GolferHistoryBody, GolferHistoryHeader } from "@/components/GolferHistoryDialog";
import { PickHistoryView } from "@/components/PickHistoryView";
import { TeamHistoryBody, TeamHistoryHeader } from "@/components/ProfileDialogs";
import { PickBoard } from "@/app/p/[slug]/picks/PickBoard";
import { Scoreboard } from "@/app/p/[slug]/scoreboard/Scoreboard";
import { formatInTimeZone } from "date-fns-tz";
import { getSlateGames } from "@/lib/pool";
import { getTeamRecords } from "@/lib/teamRecords";
import {
  landingGolferHistory,
  landingTeamHistory,
  getLandingPool,
  scoresSnapshot,
  slateFor,
  weekPicks,
  type LandingPool,
} from "@/lib/landingShots";

// The landing page's look inside: the real My Picks, Grid, Pool Summary, Scores, team and golfer
// history, Pick History and the Roster,
// each drawn by the app's own components from a real pool (lib/landingShots.ts),
// shown like screenshots: framed, all one size (a tall page is scaled down to fit), nothing to click.

/** A window around one page: `inert` (a picture, not a page) and its own containing block so
    the page's fixed bottom bar sits inside the frame. */
function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-bg ring-1 ring-line shadow-[0_24px_60px_-24px_rgba(0,0,0,0.35)]">
      <div className="flex items-center gap-2 border-b border-line bg-surface/60 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-line" />
        <span className="size-2.5 rounded-full bg-line" />
        <span className="size-2.5 rounded-full bg-line" />
        <span className="ml-2 truncate text-xs font-semibold text-muted">{title}</span>
      </div>
      {/* Every preview the same size; a page taller than this is scaled down to fit, not cut off. */}
      <FitBox className="h-[30rem] sm:h-[36rem]">
        <div inert className="relative px-4 py-4 [transform:translateZ(0)] sm:px-6">
          {children}
        </div>
      </FitBox>
    </div>
  );
}

/** Games in the My Picks and Scores previews: enough to show the page, few enough to fit whole. */
const SHOT_GAMES = 6;

async function MyPicksShot({ lp }: { lp: LandingPool }) {
  const { ctx } = lp;
  const slate = await slateFor(lp, lp.week);
  if (!slate) return null;
  const [games, { data: picks }, { data: score }] = await Promise.all([
    getSlateGames(ctx, slate.id),
    ctx.supabase.from("picks").select("*").eq("slate_id", slate.id).eq("user_id", ctx.entryUserId),
    ctx.supabase.from("slate_scores").select("points, wins, losses, pushes").eq("slate_id", slate.id).eq("user_id", ctx.entryUserId).maybeSingle(),
  ]);
  // Six games, so the card shows whole: the entry's picks, then the earliest games not picked.
  const picked = new Set((picks ?? []).map((p) => p.game_id));
  const keep = new Set([...games.filter((g) => picked.has(g.id)), ...games.filter((g) => !picked.has(g.id))].slice(0, SHOT_GAMES).map((g) => g.id));
  const shown = games.filter((g) => keep.has(g.id));
  const records = await getTeamRecords("nfl", shown.map((g) => g.startAt)).catch(() => ({}));
  return (
    // Bottom padding: the page's pick tracker bar sits over the frame's bottom edge.
    <div className="pb-14">
      <h2 className="mb-4 text-xl font-extrabold tracking-[-0.03em]">{slate.label ?? `Week ${slate.week}`}</h2>
      <PickBoard
        slug={lp.slug}
        slate={{ id: slate.id, week: slate.week, status: slate.status, lockAt: slate.lock_at, firstDayLockAt: slate.first_day_lock_at }}
        games={shown}
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
    </div>
  );
}

async function ScoresShot({ lp }: { lp: LandingPool }) {
  const slate = await slateFor(lp, lp.week);
  if (!slate) return null;
  const snap = await scoresSnapshot(lp, slate.id);
  if (!snap) return null;
  const today = formatInTimeZone(Date.now(), lp.ctx.displayTz, "yyyy-MM-dd");
  const day = snap.days.includes(today) ? today : snap.days[0];
  // Six games on that day, live ones first, so the board shows whole.
  const order = { in_progress: 0, final: 1, scheduled: 2 } as Record<string, number>;
  const onDay = snap.games
    .filter((g) => formatInTimeZone(g.startAt, lp.ctx.displayTz, "yyyy-MM-dd") === day)
    .sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3))
    .slice(0, SHOT_GAMES);
  const games = snap.games.filter((g) => onDay.includes(g)).sort((a, b) => a.startAt.localeCompare(b.startAt));
  return (
    <>
      <h2 className="mb-4 text-xl font-extrabold tracking-[-0.03em]">
        Scoreboard <span className="text-muted">· {slate.label ?? `Week ${slate.week}`}</span>
      </h2>
      <Scoreboard
        day={day}
        slug={lp.slug}
        week={slate.week}
        games={games}
        timezone={lp.ctx.displayTz}
        sport="nfl"
        records={{}}
        ats={lp.ctx.settings.pick_type === "ats"}
        inPool={[]}
        showFilters={false}
        weekDays={[day]}
      />
    </>
  );
}

async function SummaryShot({ lp }: { lp: LandingPool }) {
  const slate = await slateFor(lp, lp.week);
  if (!slate) return null;
  const [games, picks] = await Promise.all([getSlateGames(lp.ctx, slate.id), weekPicks(lp, slate.id)]);
  return (
    // The whole summary at once: its sections side by side instead of the narrow pop-out.
    <div>
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
        layout="wide"
      />
    </div>
  );
}

/** A pop-up as it looks open: the blue outline, the heading, then its contents. */
function Popup({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border-2 border-accent bg-bg p-5 shadow-xl">
      {header}
      {children}
    </div>
  );
}

async function HistoryShot({ lp }: { lp: LandingPool }) {
  // The two history pop-ups side by side: a team's (from My Picks, with its record against the
  // spread) and a golfer's (from a golf pool's picks).
  const [team, golfer] = await Promise.all([landingTeamHistory(lp), landingGolferHistory()]);
  if (!team && !golfer) return null;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      {team && (
        <Popup header={<TeamHistoryHeader t={team.t} name={team.team.short_name ?? team.team.name} logo={team.team.logo_url} ats={team.ats} />}>
          <TeamHistoryBody t={team.t} ats={team.ats} timezone={team.timezone} maxGames={8} />
        </Popup>
      )}
      {golfer && (
        <Popup header={<GolferHistoryHeader golfer={golfer.golfer} />}>
          <GolferHistoryBody golferId={golfer.golfer.id} data={golfer.data} recentEvents={6} />
        </Popup>
      )}
    </div>
  );
}

async function PickHistoryShot({ lp }: { lp: LandingPool }) {
  // The entry's Pick History: week by week and by team, side by side.
  return PickHistoryView({ ctx: lp.ctx, slug: lp.slug, userId: lp.ctx.entryUserId!, embed: { rename: lp.rename, maxTeams: 12 } });
}

async function RosterShot({ lp }: { lp: LandingPool }) {
  // The commissioner's Roster page: made-up names and emails, a sample invite link.
  return (
    <>
      <h2 className="mb-4 text-xl font-extrabold tracking-[-0.03em]">Roster</h2>
      <AdminRoster ctx={lp.ctx} slug={lp.slug} timezone={lp.ctx.settings.timezone} embed={{ rename: lp.rename, maxRows: 6 }} />
    </>
  );
}

/** The real pages as slides, one at a time, or nothing when the pool can't be read. */
export async function Shots() {
  const lp = await getLandingPool();
  if (!lp) return null;
  const [picks, grid, summary, scores, history, pickHistory, roster] = await Promise.all([
    MyPicksShot({ lp }).catch(() => null),
    GridView({ ctx: lp.ctx, slug: lp.slug, week: lp.week, embed: { maxRows: 12, rename: lp.rename } }).catch(() => null),
    SummaryShot({ lp }).catch(() => null),
    ScoresShot({ lp }).catch(() => null),
    HistoryShot({ lp }).catch(() => null),
    PickHistoryShot({ lp }).catch(() => null),
    RosterShot({ lp }).catch(() => null),
  ]);
  const stories = [
    {
      id: "picks",
      label: "My Picks",
      title: "Every game and every line on one clean card.",
      text: "Players see the week's games, spreads, lock times and team history, make their picks in a few taps, and watch it all update live once games start.",
      node: picks,
    },
    {
      id: "grid",
      label: "League Grid",
      title: "The whole pool's picks, revealed the moment each game starts.",
      text: "Wins and losses fill in as games finish, so everyone can see who's riding with whom and where the week turned.",
      node: grid,
    },
    {
      id: "summary",
      label: "Pool Summary",
      title: "Where the pool landed on every game.",
      text: "The most-picked sides and how each game split, so the trash talk has receipts.",
      node: summary,
    },
    {
      id: "scores",
      label: "Scores",
      title: "Live scores, right next to the picks.",
      text: "Clocks, scores, down and distance and the last play for every game, without opening another app.",
      node: scores,
    },
    {
      id: "history",
      label: "Team & Golfer History",
      title: "Every team's and golfer's record, a tap away.",
      text: "Tap a team for its recent games and record against the spread, or a golfer for past finishes at the event and this season's results.",
      node: history,
    },
    {
      id: "pick-history",
      label: "Pick History",
      title: "Every player's picks, week by week and team by team.",
      text: "Each week's record and picks, plus how a player has done with every team they've taken.",
      node: pickHistory,
    },
    {
      id: "roster",
      label: "Commissioner",
      title: "Your roster, payments and invites in one place.",
      text: "One invite link for the group, every player's email and account status, and a tap to mark who's paid.",
      node: roster,
    },
  ].filter((x) => x.node);
  if (!stories.length) return null;
  return (
    <ShotCarousel
      slides={stories.map((x) => ({
        id: x.id,
        label: x.label,
        title: x.title,
        text: x.text,
        node: <Frame title={x.label}>{x.node}</Frame>,
      }))}
    />
  );
}
