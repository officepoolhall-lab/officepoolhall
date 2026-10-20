import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/AutoRefresh";
import { LiveTicker } from "@/components/LiveTicker";
import { chipClass, Empty, PageTitle } from "@/components/ui";
import { hasStarted } from "@/lib/locks";
import { windowLabel } from "@/lib/format";
import { getCurrentSlate, getPoolContext, getPublishedSlates, getSlateGames, getUpcomingSlate } from "@/lib/pool";
import { UpcomingWeekNote } from "@/components/UpcomingWeekNote";
import { TournamentPicks } from "@/components/TournamentPicks";
import { SCORING_LABEL, getTournamentPicks, getTournaments, placeLabel } from "@/lib/tournaments";
import { getTeamRecords } from "@/lib/teamRecords";
import { PickBoard } from "./PickBoard";

export const metadata: Metadata = { title: "My Picks" };

export default async function PicksPage({ params, searchParams }: PageProps<"/p/[slug]/picks">) {
  const { slug } = await params;
  const { for: forParam, week: weekParam } = await searchParams;
  const ctx = await getPoolContext(slug);
  const [slates, current, upcoming] = await Promise.all([getPublishedSlates(ctx), getCurrentSlate(ctx), getUpcomingSlate(ctx)]);

  if (!current) {
    return (
      <>
        <PageTitle>My Picks</PageTitle>
        <Empty>No week is open yet. The commissioner publishes each slate before the first game.</Empty>
      </>
    );
  }

  // Commissioner entering picks on behalf of a player: /picks?for=<user id>
  const forUserId = ctx.isCommissioner && typeof forParam === "string" && forParam !== ctx.user.id ? forParam : undefined;
  // Another week: /picks?week=<n>. Defaults to the current slate.
  const slate = typeof weekParam === "string" ? slates.find((s) => s.week === Number(weekParam)) : current;
  const weekHref = (week: number) => `/p/${slug}/picks?week=${week}${forUserId ? `&for=${forUserId}` : ""}`;

  const weekChips = slates.length > 1 && (
    <div className="-mx-4 mb-3 flex gap-1 overflow-x-auto px-4 py-1.5">
      {[...slates].reverse().map((s) => (
        <Link
          key={s.id}
          href={weekHref(s.week)}
          aria-current={s.id === slate?.id ? "page" : undefined}
          className={chipClass(s.id === slate?.id, "", "sm")}
        >
          {s.label ?? `Week ${s.week}`}
        </Link>
      ))}
    </div>
  );

  if (!slate) {
    return (
      <>
        <PageTitle>My Picks</PageTitle>
        {weekChips}
        <Empty>That week isn&apos;t published.</Empty>
      </>
    );
  }

  // The entry on screen: the commissioner's pick for a player, else the viewer's own entry
  // (for a co-manager, the owner's).
  const userId = forUserId ?? ctx.entryUserId;
  // Next week already open while this one runs: a note, unless that's the week on screen.
  const showUpcoming = upcoming && upcoming.id !== slate.id ? upcoming : null;
  const [{ data: picks }, forName, { data: score }, games, upcomingPicked] = await Promise.all([
    forUserId
      ? ctx.supabase.rpc("member_picks", { p_slate_id: slate.id, p_user_id: forUserId })
      : ctx.supabase.from("picks").select("*").eq("slate_id", slate.id).eq("user_id", ctx.entryUserId),
    forUserId
      ? ctx.supabase.from("profiles").select("display_name").eq("id", forUserId).maybeSingle().then(({ data }) => data?.display_name ?? "player")
      : null,
    // The week's official total (it includes a missed week's last-place score).
    ctx.supabase.from("slate_scores").select("points, wins, losses, pushes").eq("slate_id", slate.id).eq("user_id", userId).maybeSingle(),
    getSlateGames(ctx, slate.id),
    showUpcoming
      ? ctx.supabase
          .from("picks").select("id", { count: "exact", head: true }).eq("slate_id", showUpcoming.id).eq("user_id", userId)
          .then(({ count }) => count ?? 0)
      : 0,
  ]);

  // This week's tournament champion picks (basketball), with this entry's pick on each.
  const weekTournaments = (await getTournaments(ctx)).filter((t) => t.week === slate.week);
  const tournamentPicks = await getTournamentPicks(ctx, weekTournaments.map((t) => t.id), userId);
  const tournamentCards = weekTournaments.map((t) => {
    const p = tournamentPicks.find((x) => x.tournament_id === t.id);
    const team = p ? t.teams.find((x) => x.id === p.team_id) : undefined;
    return {
      id: t.id,
      name: t.name,
      lockAt: t.lockAt,
      scoringLabel: SCORING_LABEL[t.scoring],
      teams: t.teams,
      decided: t.decided,
      pick: p ? { teamId: p.team_id, points: p.points, place: team ? placeLabel(t.scoring, team.placement) : null } : null,
    };
  });

  // Teams' current records (ESPN), shown next to each team name.
  const records = await getTeamRecords(ctx.pool.sport === "ncaab" ? "ncaab" : "ncaaf", games.map((g) => g.startAt));

  // eslint-disable-next-line react-hooks/purity -- render-time snapshot of which games are live
  const now = Date.now();
  const anyLive = games.some(
    (g) => !g.voided && hasStarted(g, now) && g.status !== "final" && !g.overridden && g.status !== "postponed" && g.status !== "cancelled",
  );

  return (
    // Desktop: exactly one screen tall (viewport less the header, tabs, and the space the
    // layout keeps clear for the pick tracker), so only the games column scrolls.
    <div className="lg:flex lg:h-[calc(100dvh-13rem-1px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] lg:min-h-96 lg:flex-col">
      <div className="shrink-0">
        {/* Week and dates on the left; live scores fill the space to their right. */}
        <div className="sm:flex sm:items-start sm:gap-6">
          <div className="shrink-0">
            <PageTitle sub={windowLabel(slate.window_start, slate.window_end, ctx.settings.timezone)}>
              {slate.label ?? `Week ${slate.week}`}
              {forName && <span className="text-accent"> for {forName}</span>}
          {!forName && ctx.managing && <span className="text-accent"> · {ctx.managing.ownerName}&apos;s entry</span>}
            </PageTitle>
          </div>
          <LiveTicker games={games} now={now} timezone={ctx.displayTz} className="-mt-2 mb-4 sm:mt-1.5 sm:mb-0 sm:flex-1" />
        </div>
        {weekChips}
        {showUpcoming && (
          <UpcomingWeekNote
            href={weekHref(showUpcoming.week)}
            slate={showUpcoming}
            picked={upcomingPicked}
            picksPerSlate={ctx.settings.picks_per_slate}
            timezone={ctx.settings.timezone}
            className="mb-3"
          />
        )}
        <AutoRefresh active={anyLive} />
      </div>
      <PickBoard
        // A fresh board per week and player: its draft state belongs to one slate.
        key={`${slate.id}:${userId}`}
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
        edited={(picks ?? []).filter((p) => p.edited_by !== null).map((p) => p.game_id)}
        score={score ? { points: Number(score.points), wins: score.wins, losses: score.losses, pushes: score.pushes } : null}
        settings={{
          pickType: ctx.settings.pick_type,
          picksPerSlate: ctx.settings.picks_per_slate,
          tiers: ctx.settings.confidence?.tiers ?? null,
          minusPoints: ctx.settings.confidence?.wrong_pick === "minus_points",
          maxUpsetBonus: ctx.settings.upset_bonus ? Math.max(...ctx.settings.upset_bonus.tiers.map((t) => t.bonus)) : null,
          // Times and day headings in the viewer's zone; deadline labels in the pool's.
          timezone: ctx.displayTz,
          poolTimezone: ctx.settings.timezone,
          bookmaker: ctx.settings.lines.bookmaker,
          lockMode: ctx.settings.lock.mode,
          fullCard: ctx.settings.full_card,
        }}
        forUserId={forUserId}
        records={records}
        // The entry's Pick History: the same page as their name on Standings.
        historyHref={`/p/${slug}/standings/${userId}`}
        // A co-manager saves the owner's entry, with the player's own rules (not the commissioner's).
        saveAs={ctx.managing ? ctx.entryUserId : undefined}
        top={
          tournamentCards.length > 0 ? (
            <TournamentPicks
              slug={slug}
              cards={tournamentCards}
              timezone={ctx.displayTz}
              forUserId={forUserId ?? (ctx.managing ? ctx.entryUserId : undefined)}
              canEditLocked={Boolean(forUserId)}
            />
          ) : undefined
        }
      />
    </div>
  );
}
