import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Empty, PageTitle, chipClass } from "@/components/ui";
import { windowLabel } from "@/lib/format";
import { withLiveClocks, isLive } from "@/lib/liveClock";
import { getCurrentSlate, getPoolContext, getPublishedSlates, getSlateGames } from "@/lib/pool";
import { getTeamRecords } from "@/lib/teamRecords";
import { Scoreboard } from "./Scoreboard";

export const metadata: Metadata = { title: "Scoreboard" };

/** Every game on a week's slate (the current week unless ?week=), live like My Picks. */
export default async function ScoreboardPage({ params, searchParams }: PageProps<"/p/[slug]/scoreboard">) {
  const { slug } = await params;
  const { week: weekParam } = await searchParams;
  const ctx = await getPoolContext(slug);
  const [slates, current] = await Promise.all([getPublishedSlates(ctx), getCurrentSlate(ctx)]);
  const slate = typeof weekParam === "string" ? slates.find((s) => s.week === Number(weekParam)) ?? current : current;
  if (!slate) {
    return (
      <>
        <PageTitle>Scoreboard</PageTitle>
        <Empty>Games show up here once the first week is published.</Empty>
      </>
    );
  }

  const sport = ctx.pool.sport === "ncaab" ? "ncaab" : "ncaaf";
  const stored = await getSlateGames(ctx, slate.id);
  // eslint-disable-next-line react-hooks/purity -- render-time snapshot of which games are live
  const now = Date.now();
  const [games, records] = await Promise.all([withLiveClocks(sport, stored, now), getTeamRecords(sport, stored.map((g) => g.startAt))]);
  const anyLive = games.some((g) => isLive(g, now));

  return (
    <div data-wide>
      <PageTitle sub={windowLabel(slate.window_start, slate.window_end, ctx.settings.timezone)}>
        Scoreboard <span className="text-muted">· {slate.label ?? `Week ${slate.week}`}</span>
      </PageTitle>
      {slates.length > 1 && (
        <div className="-mx-4 mb-3 flex gap-1 overflow-x-auto px-4 py-1.5">
          {[...slates].reverse().map((s) => (
            <Link
              key={s.id}
              href={`/p/${slug}/scoreboard?week=${s.week}`}
              aria-current={s.id === slate.id ? "page" : undefined}
              className={chipClass(s.id === slate.id, "", "sm")}
            >
              {s.label ?? `Week ${s.week}`}
            </Link>
          ))}
        </div>
      )}
      {/* Finals and new tip times come from the server each minute; plays poll faster in the client. */}
      <AutoRefresh active={anyLive} />
      <Scoreboard
        slug={slug}
        week={slate.week}
        games={games}
        timezone={ctx.displayTz}
        sport={sport}
        records={records}
        ats={ctx.settings.pick_type === "ats"}
      />
    </div>
  );
}
