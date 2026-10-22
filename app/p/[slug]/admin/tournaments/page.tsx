import type { Metadata } from "next";
import { formatInTimeZone } from "date-fns-tz";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { ChevronIcon, Panel, SectionLabel, TeamLogo, inputClass } from "@/components/ui";
import { windowLabel } from "@/lib/format";
import { requireCommissioner } from "@/lib/pool";
import { PLACES, SCORING_LABEL, getTournamentPicks, getTournaments, placeLabel } from "@/lib/tournaments";
import { deleteTournament, saveTournament, saveTournamentResults } from "../actions";
import { TournamentForm } from "./TournamentForm";

export const metadata: Metadata = { title: "Tournaments" };

const LOCAL_INPUT = "yyyy-MM-dd'T'HH:mm";
const panelInput = `${inputClass} !bg-bg`;

/**
 * In-season tournament champion picks: add each tournament with its field, week and lock time;
 * after it's played, enter where the field finished and every pick scores.
 */
export default async function TournamentsAdminPage({ params }: PageProps<"/p/[slug]/admin/tournaments">) {
  const { slug } = await params;
  const ctx = await requireCommissioner(slug);
  const tz = ctx.settings.timezone;
  const [tournaments, { data: teams }, { data: slates }] = await Promise.all([
    getTournaments(ctx),
    ctx.supabase.from("teams").select("id, name, short_name, abbreviation, logo_url, conference").eq("sport", ctx.pool.sport).order("name"),
    ctx.supabase.from("slates").select("week, label, window_start, window_end").eq("pool_id", ctx.pool.id).order("week"),
  ]);
  const picks = await getTournamentPicks(ctx, tournaments.map((t) => t.id));

  // Weeks to choose from: every slate so far, plus the next several (slates are built weekly).
  const known = new Map<number, string>((slates ?? []).map((s) => [s.week, `${s.label ?? `Week ${s.week}`} · ${windowLabel(s.window_start, s.window_end, tz)}`]));
  const lastWeek = Math.max(0, ...known.keys());
  const weeks: [number, string][] = Array.from({ length: lastWeek + 8 }, (_, i) => i + 1).map((w) => [w, known.get(w) ?? `Week ${w}`]);
  const weekName = (w: number) => known.get(w)?.split(" · ")[0] ?? `Week ${w}`;

  return (
    <div className="space-y-8 lg:max-w-5xl">
      <p className="text-sm text-muted">
        Every player picks one champion per tournament before its first tip. Points are a separate bonus line in the standings.
      </p>

      {tournaments.map((t) => {
        const count = picks.filter((p) => p.tournament_id === t.id).length;
        const locked = new Date(t.lockAt).getTime() <= Date.now();
        return (
          // Collapsed to one line each (there can be 20 in a season); open to enter results or edit.
          <Panel key={t.id} className="p-0">
            <details className="group">
            <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1 p-4 [&::-webkit-details-marker]:hidden">
              <ChevronIcon className="size-4 shrink-0 self-center text-muted transition group-open:rotate-90" />
              <h2 className="text-[17px] font-extrabold tracking-[-0.03em]">{t.name}</h2>
              <span className="text-sm text-muted">
                {weekName(t.week)} · {locked ? "Locked" : "Locks"} {formatInTimeZone(t.lockAt, tz, "EEE MMM d, h:mm a")} · {t.teams.length} teams
                {/* Picks stay private until the lock, even from the commissioner. */}
                {locked && <> · {count} pick{count === 1 ? "" : "s"}</>}
              </span>
              <span className="text-xs text-muted">{SCORING_LABEL[t.scoring]}</span>
              <span className="ml-auto text-sm">
                {t.decided ? (
                  <span className="text-muted">
                    Champion: <span className="font-semibold text-ink">{t.teams.find((x) => x.placement === "champion")?.short_name ?? "—"}</span>
                  </span>
                ) : locked ? (
                  <span className="font-semibold text-accent">Needs results</span>
                ) : null}
              </span>
            </summary>
            <div className="space-y-4 px-4 pb-4">
            <div className="flex justify-end">
              <ActionButton action={deleteTournament.bind(null, slug, t.id)} kind="danger" className="!px-3 !text-sm" pendingLabel="Deleting…">
                Delete tournament
              </ActionButton>
            </div>

            {/* Results: one place per team. Picks score as soon as a champion is set. */}
            <section>
              <SectionLabel className="mb-2">Results</SectionLabel>
              <ActionForm action={saveTournamentResults.bind(null, slug, t.id)} className="space-y-3">
                <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {t.teams.map((team) => {
                    const pickedBy = picks.filter((p) => p.tournament_id === t.id && p.team_id === team.id).length;
                    return (
                      <li key={team.id} className="flex items-center gap-2">
                        <TeamLogo src={team.logo_url} abbr={team.abbreviation} className="size-5" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {team.short_name ?? team.name}
                          {locked && <span className="ml-1.5 text-xs font-normal text-muted tabular-nums">{pickedBy} picked</span>}
                        </span>
                        <select
                          name={`place_${team.id}`}
                          defaultValue={team.placement ?? ""}
                          aria-label={`${team.short_name ?? team.name} finish`}
                          className={`${panelInput} !h-9 !w-44 !py-0 !text-sm`}
                        >
                          <option value="">—</option>
                          {PLACES[t.scoring].map((p) => (
                            <option key={p.id} value={p.id}>{p.label} ({p.points})</option>
                          ))}
                        </select>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex items-center gap-3">
                  <SubmitButton kind="secondary" pending="Saving…" className="!px-4 !text-sm">Save results</SubmitButton>
                  {t.decided && (
                    <span className="text-sm text-muted">
                      Champion: <span className="font-semibold text-ink">{t.teams.find((x) => x.placement === "champion")?.short_name ?? "—"}</span>
                    </span>
                  )}
                </div>
              </ActionForm>
            </section>

            {/* Edit name, week, lock, scoring or field. Taking a team out removes picks on it. */}
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium text-accent">Edit tournament</summary>
              <div className="mt-3">
                <TournamentForm
                  action={saveTournament.bind(null, slug, t.id)}
                  teams={teams ?? []}
                  weeks={weeks}
                  submitLabel="Save tournament"
                  initial={{
                    name: t.name,
                    week: t.week,
                    lockLocal: formatInTimeZone(t.lockAt, tz, LOCAL_INPUT),
                    scoring: t.scoring,
                    teamIds: t.teams.map((x) => x.id),
                  }}
                />
                <p className="mt-2 text-xs text-muted">Removing a team from the field also removes any picks on it.</p>
              </div>
            </details>
            {t.decided && (
              <p className="text-xs text-muted">
                {t.teams.filter((x) => x.placement).map((x) => `${x.short_name ?? x.name}: ${placeLabel(t.scoring, x.placement)}`).join(" · ")}
              </p>
            )}
            </div>
            </details>
          </Panel>
        );
      })}

      <Panel className="p-4">
        <h2 className="mb-3 text-[15px] font-semibold">Add a tournament</h2>
        <TournamentForm action={saveTournament.bind(null, slug, null)} teams={teams ?? []} weeks={weeks} submitLabel="Add tournament" />
      </Panel>
    </div>
  );
}
