import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
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
 * A Playoff Fantasy pool's player list, for the commissioner. The playoff teams and their
 * players load from ESPN by themselves once the field is set; this page shows what's loaded,
 * can refresh it, and lets the commissioner set a roster for a player. Choosing the teams by
 * hand is a fallback, folded away.
 */
export default async function PfPlayersAdminPage({ params }: PageProps<"/p/[slug]/admin/players">) {
  const { slug } = await params;
  const ctx = await requireCommissioner(slug);
  if (poolFormat(ctx.pool.settings) !== "playoff_fantasy") notFound();
  const [{ settings, teams, players, entries, locked }, { data: all }] = await Promise.all([
    getPf(ctx),
    ctx.supabase.from("teams").select("id, name, short_name, abbreviation, logo_url").eq("sport", "nfl").order("name"),
  ]);
  const chosen = new Set(teams.map((t) => t.id));
  const size = rosterSize(settings);
  const perPos = POSITIONS.map((p) => `${players.filter((x) => x.pos === p).length} ${p}`).join(" · ");

  return (
    <div className="space-y-4">
      <SettingsSection
        title="Playoff teams and players"
        description={
          players.length
            ? `${teams.length} teams and ${players.length} players are loaded (${perPos}).`
            : "Nothing to do here yet: when the regular season ends and the playoff field is set, the 14 teams and their players load by themselves, and rosters open."
        }
      >
        {teams.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 py-3">
            {teams.map((t) => (
              <li key={t.id} className="inline-flex items-center gap-1.5 rounded-full bg-bg px-2.5 py-1 text-sm font-medium ring-1 ring-line">
                <TeamLogo src={t.logo_url} abbr={t.abbreviation} className="size-5" />
                {t.name}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-3 py-3">
          {!locked && (
            <ActionButton action={loadPfPlayers.bind(null, slug, false)} kind={players.length ? "secondary" : "accent"} pendingLabel="Checking ESPN…">
              {players.length ? "Reload teams and players from ESPN" : "Check ESPN for the playoff field now"}
            </ActionButton>
          )}
          <span className="text-sm text-muted">
            {settings.lock_at
              ? `Rosters ${locked ? "locked" : "lock"} ${formatInTimeZone(settings.lock_at, ctx.settings.timezone, "EEE, MMM d · h:mm a")}.`
              : "Rosters will lock at the first Wild Card kickoff."}{" "}
            <Link href={`/p/${slug}/admin/settings`} className="font-semibold text-accent hover:underline">Change on Settings</Link>
          </span>
        </div>
        {players.length > 0 && !locked && <p className="pb-3 text-xs text-muted">Reload before the lock to pick up late roster moves. Rosters already built are kept.</p>}
      </SettingsSection>

      {entries.length > 0 && players.length > 0 && (
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
      )}

      {/* The fallback, for when ESPN's field can't be read or you want different teams. */}
      {!locked && (all ?? []).length > 0 && (
        <details className="rounded-2xl bg-surface p-4 sm:p-5">
          <summary className="cursor-pointer text-[15px] font-semibold text-accent">Choose the playoff teams by hand instead</summary>
          <ActionForm action={savePfTeams.bind(null, slug)} className="mt-3">
            <p className="text-sm text-muted">Tick the teams, and their players load when you save. Rosters have {size} spots with one player per team, so at least {size} teams are needed.</p>
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
              {(all ?? []).map((t) => (
                <li key={t.id}>
                  <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-bg px-2.5 text-sm ring-1 ring-line has-[:checked]:bg-accent/15 has-[:checked]:ring-2 has-[:checked]:ring-accent">
                    <input type="checkbox" name="team" value={t.id} defaultChecked={chosen.has(t.id)} className="size-4 accent-[var(--accent)]" />
                    <TeamLogo src={t.logo_url} abbr={t.abbreviation} className="size-5" />
                    <span className="min-w-0 flex-1 truncate font-medium">{t.short_name ?? t.name}</span>
                  </label>
                </li>
              ))}
            </ul>
            <SubmitButton kind="secondary" className="mt-3" pending="Saving and loading players…">Save these teams and load their players</SubmitButton>
          </ActionForm>
        </details>
      )}
    </div>
  );
}
