import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { StandingsTable } from "@/components/StandingsTable";
import { ChevronIcon, Empty, LinkButton, PageTitle, SectionLabel, StatusText } from "@/components/ui";
import { windowLabel } from "@/lib/format";
import { isGameLocked } from "@/lib/locks";
import { getCurrentSlate, getPoolContext, getSlateGames } from "@/lib/pool";
import { segmentForWeek, segmentRanges, segmentWeeksLabel } from "@/lib/poolSettings";
import { getStandings } from "@/lib/standings";

export default async function PoolHome({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const ctx = await getPoolContext(slug);
  const slate = await getCurrentSlate(ctx);
  // The current segment is the one holding the current week; none before a week is published.
  const segment = slate ? segmentForWeek(ctx.settings, slate.week) : null;
  const segmentIndex = segment ? segmentRanges(ctx.settings).findIndex((r) => r.first_week === segment.first_week) + 1 : 0;
  const [season, segmentRows] = await Promise.all([
    getStandings(ctx),
    segment ? getStandings(ctx, { fromWeek: segment.first_week, toWeek: segment.last_week }) : null,
  ]);
  const flat = !ctx.settings.confidence;

  let summary = null;
  if (slate) {
    const [games, { data: mine }] = await Promise.all([
      getSlateGames(ctx, slate.id),
      ctx.supabase.from("picks").select("game_id").eq("slate_id", slate.id).eq("user_id", ctx.user.id),
    ]);
    // Server render time is fine here; the countdown itself ticks client-side.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    // The next moment any game stops taking picks: a deadline, or a tip before its deadline.
    const nextLock = games
      .filter((g) => !g.voided && !isGameLocked(g, now))
      .map((g) => g.effectiveLockAt)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
    summary = {
      picked: mine?.length ?? 0,
      total: ctx.settings.picks_per_slate,
      nextLock: slate.status === "open" ? nextLock ?? null : null,
      games: games.length,
    };
  }

  return (
    <div className="space-y-8">
      <PageTitle
        sub={`${ctx.settings.confidence ? "Confidence pool" : ctx.settings.pick_type === "ats" ? "Against the spread" : "Straight up"} · ${ctx.settings.picks_per_slate} picks a week`}
      >
        {ctx.pool.name}
      </PageTitle>

      {slate && summary ? (
        <section className="border-b border-line pb-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-ink">{slate.label ?? `Week ${slate.week}`}</span>
            <span className="text-faint" aria-hidden>·</span>
            <StatusText status={slate.status} />
            <span className="ml-auto truncate text-muted">{windowLabel(slate.window_start, slate.window_end, ctx.settings.timezone)}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-muted">My picks</div>
              <div className="mt-0.5 text-4xl font-semibold tracking-tight tabular-nums">
                {summary.picked}<span className="text-muted">/{summary.total}</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">{summary.nextLock ? "Next lock" : "Status"}</div>
              <div className="mt-0.5 text-4xl font-semibold tracking-tight tabular-nums">
                {summary.nextLock ? <Countdown to={summary.nextLock} done="locked" /> : slate.status === "graded" ? "Final" : "Locked"}
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <LinkButton href={`/p/${slug}/picks`} kind="primary" className="flex-1 whitespace-nowrap !px-3">
              {slate.status === "open" ? (summary.picked < summary.total ? "Make picks" : "Review picks") : "My picks"}
            </LinkButton>
            <LinkButton href={`/p/${slug}/grid/${slate.week}`} kind="secondary" className="flex-1 whitespace-nowrap !px-3">Everyone&apos;s picks</LinkButton>
          </div>
        </section>
      ) : (
        <Empty>
          No week is published yet.
          {ctx.isCommissioner && (
            <> <Link className="text-accent" href={`/p/${slug}/admin/slate`}>Build the first slate</Link>.</>
          )}
        </Empty>
      )}

      <section>
        <div className="flex items-center justify-between">
          <SectionLabel>Season standings</SectionLabel>
          <Link href={`/p/${slug}/standings`} className="-mr-1 inline-flex h-11 items-center gap-0.5 px-1 text-sm font-medium text-accent">
            All <ChevronIcon className="size-4" />
          </Link>
        </div>
        <StandingsTable rows={season} me={ctx.user.id} limit={5} flat={flat} />
      </section>

      {segment && segmentRows && (
        <section>
          <div className="flex items-center justify-between">
            <SectionLabel>
              {segment.name} <span className="font-normal normal-case tracking-normal">· {segmentWeeksLabel(segment)}</span>
            </SectionLabel>
            <Link href={`/p/${slug}/standings?segment=${segmentIndex}`} className="-mr-1 inline-flex h-11 items-center gap-0.5 px-1 text-sm font-medium text-accent">
              All <ChevronIcon className="size-4" />
            </Link>
          </div>
          <StandingsTable rows={segmentRows} me={ctx.user.id} limit={5} flat={flat} />
        </section>
      )}
    </div>
  );
}
