import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ChevronIcon, Empty, LiveDot, TeamLogo } from "@/components/ui";
import { ViewTabs } from "@/components/ViewTabs";
import { getGameSummary, type GameSummary, type Play } from "@/lib/gameSummary";
import { getPoolContext } from "@/lib/pool";

export const metadata: Metadata = { title: "Game" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One live or final game: the score by period, play-by-play (football by drive) and the box
 * score, from ESPN. Opened from My Picks; "My Picks" at the top goes back (to the same week).
 * While the game is on, it refreshes every 15 seconds.
 */
export default async function GamePage({ params, searchParams }: PageProps<"/p/[slug]/game/[gameId]">) {
  const { slug, gameId } = await params;
  const { week } = await searchParams;
  if (!UUID.test(gameId)) notFound();
  const ctx = await getPoolContext(slug);
  const { data: game } = await ctx.supabase.from("games").select("id, espn_id, sport, status").eq("id", gameId).maybeSingle();
  if (!game) notFound();

  const backHref = `/p/${slug}/picks${typeof week === "string" && /^\d+$/.test(week) ? `?week=${week}` : ""}`;
  const back = (
    <Link href={backHref} className="-ml-1 mb-3 inline-flex h-9 items-center gap-0.5 px-1 text-sm font-medium text-accent">
      <ChevronIcon className="size-4 rotate-180" /> My Picks
    </Link>
  );

  const sport = game.sport === "ncaab" ? "ncaab" : "ncaaf";
  const summary = game.espn_id && !game.espn_id.startsWith("demo-") ? await getGameSummary(sport, game.espn_id, game.status !== "final") : null;
  if (!summary || !summary.away || !summary.home) {
    return (
      <>
        {back}
        <Empty>ESPN doesn&apos;t have play-by-play or a box score for this game yet.</Empty>
      </>
    );
  }
  const live = summary.status.state === "in";
  const { away, home } = summary;
  const periods = Math.max(away.linescores.length, home.linescores.length);

  return (
    <div data-wide className="lg:max-w-6xl">
      {back}
      <AutoRefresh active={live} seconds={15} />

      {/* Score: teams, total, then the line score by period. */}
      <section className="mb-5 rounded-xl border border-line bg-surface/50 p-4">
        <div className="mb-2 text-xs font-semibold text-muted">
          {live ? <LiveDot>{summary.status.detail ?? "Live"}</LiveDot> : <span>{summary.status.detail ?? ""}</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-xs text-muted">
                <th className="py-1 text-left font-medium" />
                {Array.from({ length: periods }, (_, i) => (
                  <th key={i} className="w-10 py-1 text-center font-medium">{summary.periodLabel(i + 1).replace(" Half", "")}</th>
                ))}
                <th className="w-12 py-1 text-right font-medium">T</th>
              </tr>
            </thead>
            <tbody>
              {[away, home].map((t) => (
                <tr key={t.homeAway}>
                  <td className="py-1.5">
                    <span className="flex items-center gap-2">
                      <TeamLogo src={t.logo} abbr={t.abbreviation} className="size-6" />
                      <span className="font-semibold">{t.name}</span>
                    </span>
                  </td>
                  {Array.from({ length: periods }, (_, i) => (
                    <td key={i} className="text-center text-muted">{t.linescores[i] ?? ""}</td>
                  ))}
                  <td className="text-right text-lg font-bold">{t.score ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ViewTabs
        param="view"
        ariaLabel="Show"
        views={[
          { id: "plays", label: "Play-by-Play", content: <PlayByPlay summary={summary} /> },
          { id: "box", label: "Box Score", content: <BoxScore summary={summary} /> },
        ]}
      />
    </div>
  );
}

function PlayRow({ p, summary }: { p: Play; summary: GameSummary }) {
  return (
    <li className={`flex gap-3 py-1.5 text-sm ${p.scoring ? "font-semibold" : ""}`}>
      <span className="w-14 shrink-0 text-xs tabular-nums text-muted">
        {p.period ? summary.periodLabel(p.period).replace(" Half", "") : ""} {p.clock ?? ""}
      </span>
      <span className="min-w-0 flex-1">
        {p.down && <span className="mr-1.5 text-xs font-semibold text-muted">{p.down}</span>}
        {p.text}
      </span>
      {p.scoring && p.awayScore !== null && p.homeScore !== null && (
        <span className="shrink-0 text-xs tabular-nums text-ink">
          {p.awayScore}–{p.homeScore}
        </span>
      )}
    </li>
  );
}

/** Football: drives, the one under way open; basketball: every play, newest first. */
function PlayByPlay({ summary }: { summary: GameSummary }) {
  const abbr = (id: string | null) => (id === summary.away?.id ? summary.away?.abbreviation : id === summary.home?.id ? summary.home?.abbreviation : "");
  const logo = (id: string | null) => (id === summary.away?.id ? summary.away : id === summary.home?.id ? summary.home : null);
  if (summary.drives.length) {
    return (
      <div className="divide-y divide-line border-y border-line">
        {summary.drives.map((d, i) => {
          const team = logo(d.teamId);
          return (
            <details key={d.id} open={i === 0} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 py-2 [&::-webkit-details-marker]:hidden">
                <ChevronIcon className="size-4 shrink-0 text-muted transition group-open:rotate-90" />
                {team && <TeamLogo src={team.logo} abbr={team.abbreviation} className="size-5" />}
                <span className="font-semibold">{d.result ?? abbr(d.teamId)}</span>
                {d.description && <span className="truncate text-xs text-muted">{d.description}</span>}
              </summary>
              <ul className="divide-y divide-line pb-2 pl-6">
                {d.plays.map((p) => (
                  <PlayRow key={p.id} p={p} summary={summary} />
                ))}
              </ul>
            </details>
          );
        })}
      </div>
    );
  }
  if (summary.plays.length) {
    return (
      <ul className="divide-y divide-line border-y border-line">
        {summary.plays.map((p) => (
          <PlayRow key={p.id} p={p} summary={summary} />
        ))}
      </ul>
    );
  }
  return <p className="border-y border-line py-3 text-sm text-muted">No plays yet.</p>;
}

/** Team stats side by side, then each team's player stats (every table scrolls sideways on phones). */
function BoxScore({ summary }: { summary: GameSummary }) {
  const { away, home } = summary;
  if (!summary.teamStats.length && !summary.players.length) {
    return <p className="border-y border-line py-3 text-sm text-muted">No box score yet.</p>;
  }
  return (
    <div className="space-y-6">
      {summary.teamStats.length > 0 && (
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="py-1.5 text-left font-medium">Team stats</th>
              <th className="w-20 py-1.5 text-right font-medium">{away?.abbreviation}</th>
              <th className="w-20 py-1.5 text-right font-medium">{home?.abbreviation}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {summary.teamStats.map((s) => (
              <tr key={s.label}>
                <td className="py-1.5 text-muted">{s.label}</td>
                <td className="py-1.5 text-right font-semibold">{s.away}</td>
                <td className="py-1.5 text-right font-semibold">{s.home}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {summary.players.map((t) => (
        <section key={t.teamId} className="space-y-3">
          <h3 className="text-[15px] font-semibold">{t.abbreviation}</h3>
          {t.groups.map((g) => (
            <div key={g.name} className="-mx-4 overflow-x-auto px-4">
              <table className="w-full min-w-max text-xs tabular-nums">
                <thead>
                  <tr className="border-b border-line text-muted">
                    <th className="sticky left-0 bg-bg py-1.5 pr-3 text-left font-semibold capitalize text-ink">{g.name}</th>
                    {g.labels.map((l) => (
                      <th key={l} className="px-1.5 py-1.5 text-right font-medium">{l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {g.rows.map((r) => (
                    <tr key={r.name}>
                      <td className="sticky left-0 bg-bg py-1 pr-3 text-sm">{r.name}</td>
                      {r.stats.map((v, i) => (
                        <td key={i} className="px-1.5 py-1 text-right">{v}</td>
                      ))}
                    </tr>
                  ))}
                  {g.totals && (
                    <tr className="font-semibold">
                      <td className="sticky left-0 bg-bg py-1 pr-3 text-sm">Team</td>
                      {g.totals.map((v, i) => (
                        <td key={i} className="px-1.5 py-1 text-right">{v}</td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
