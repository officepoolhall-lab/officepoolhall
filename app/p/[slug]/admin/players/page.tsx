import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { SettingsSection } from "@/components/SettingsUI";
import { TeamLogo } from "@/components/ui";
import { poolFormat } from "@/lib/formats";
import { POSITIONS, rosterSize } from "@/lib/playoffFantasy";
import { getPf } from "@/lib/playoffFantasyData";
import { requireCommissioner } from "@/lib/pool";
import { loadPfPlayers, savePfTeams } from "../../formats/actions";

export const metadata: Metadata = { title: "Players" };

/**
 * A Playoff Fantasy pool's setup, for the commissioner: which teams made the playoffs, then
 * their players (loaded from ESPN's rosters), and setting a roster for a player.
 */
export default async function PfPlayersAdminPage({ params }: PageProps<"/p/[slug]/admin/players">) {
  const { slug } = await params;
  const ctx = await requireCommissioner(slug);
  if (poolFormat(ctx.pool.settings) !== "playoff_fantasy") notFound();
  const [{ settings, teams, players, entries, locked }, { data: all }] = await Promise.all([
    getPf(ctx),
    ctx.supabase.from("teams").select("id, name, short_name, abbreviation, logo_url, conference").eq("sport", "nfl").order("name"),
  ]);
  const chosen = new Set(teams.map((t) => t.id));
  const size = rosterSize(settings);
  const perPos = POSITIONS.map((p) => `${players.filter((x) => x.pos === p).length} ${p}`).join(" · ");

  return (
    <div className="space-y-4">
      <ActionForm action={savePfTeams.bind(null, slug)}>
        <SettingsSection
          title="1. Playoff teams"
          description={`Tick the teams that made the playoffs. Rosters have ${size} spots with one player per team, so ${size} or more teams are needed (all 14 in a normal year).`}
        >
          {(all ?? []).length === 0 ? (
            <p className="py-3 text-sm text-muted">No NFL teams are in the site&apos;s schedule yet. They&apos;re added when the NFL schedule is synced.</p>
          ) : (
            <ul className="grid gap-1.5 py-3 sm:grid-cols-2 lg:grid-cols-4">
              {(all ?? []).map((t) => (
                <li key={t.id}>
                  <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-bg px-2.5 text-sm ring-1 ring-line has-[:checked]:bg-accent/15 has-[:checked]:ring-2 has-[:checked]:ring-accent">
                    <input type="checkbox" name="team" value={t.id} defaultChecked={chosen.has(t.id)} disabled={locked} className="size-4 accent-[var(--accent)]" />
                    <TeamLogo src={t.logo_url} abbr={t.abbreviation} className="size-5" />
                    <span className="min-w-0 flex-1 truncate font-medium">{t.short_name ?? t.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </SettingsSection>
        {locked ? (
          <p className="mt-2 text-sm text-muted">Rosters have locked, so the playoff teams can&apos;t change.</p>
        ) : (
          <SubmitButton kind="accent" className="mt-3">Save playoff teams</SubmitButton>
        )}
      </ActionForm>

      <SettingsSection
        title="2. Players"
        description={
          players.length
            ? `${players.length} players loaded: ${perPos}. Load again any time before the lock to pick up roster moves; rosters already built are kept.`
            : "Load each playoff team's quarterbacks, running backs, receivers, tight ends and kickers from ESPN, plus its defense."
        }
      >
        <div className="flex flex-wrap items-center gap-3 py-3">
          <ActionButton action={loadPfPlayers.bind(null, slug)} kind="accent" pendingLabel="Loading from ESPN…">
            {players.length ? "Reload players from ESPN" : "Load players from ESPN"}
          </ActionButton>
          {teams.length === 0 && <span className="text-sm text-muted">Save the playoff teams first.</span>}
        </div>
      </SettingsSection>

      <SettingsSection title="3. Lock time and scoring" description="Set when rosters lock, the roster spots and the scoring on the Settings tab.">
        <p className="py-3 text-sm">
          {settings.lock_at ? <span className="text-muted">A lock time is set.</span> : <span className="font-semibold text-loss">No lock time is set yet: rosters stay open and hidden until it is.</span>}{" "}
          <Link href={`/p/${slug}/admin/settings`} className="font-semibold text-accent hover:underline">Open Settings</Link>
        </p>
      </SettingsSection>

      <SettingsSection title="Set a roster for a player" description="Opens the roster builder acting as that player. You can also fix a roster after the lock.">
        <ul className="divide-y divide-line">
          {entries.map((e) => (
            <li key={e.userId} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{e.name}</span>
              <span className={`tabular-nums ${e.playerIds.length >= size ? "text-win" : "text-muted"}`}>{e.playerIds.length}/{size}</span>
              <Link href={`/p/${slug}/picks?for=${e.userId}`} className="rounded-full px-3 py-1.5 font-semibold text-accent hover:bg-hover">
                Open roster
              </Link>
            </li>
          ))}
        </ul>
      </SettingsSection>
    </div>
  );
}
