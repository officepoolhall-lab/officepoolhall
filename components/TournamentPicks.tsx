"use client";

import { useState, useTransition } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { saveTournamentPick } from "@/app/p/[slug]/picks/actions";
import { LockIcon, TeamLogo } from "./ui";

type Team = { id: string; name: string; short_name: string | null; abbreviation: string | null; logo_url: string | null; placement: string | null };
export type TournamentCard = {
  id: string;
  name: string;
  lockAt: string;
  scoringLabel: string;
  teams: Team[];
  decided: boolean;
  /** This entry's pick: team id and, once decided, its points and finishing place. */
  pick: { teamId: string; points: number | null; place: string | null } | null;
};

const teamName = (t: Team) => t.short_name ?? t.name;
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/**
 * The week's tournament champion picks, above the games on My Picks: one card per tournament
 * with a team menu that saves as soon as it changes, until the tournament's first tip. After
 * that it shows the pick, and once results are in, where the team finished and the points.
 */
export function TournamentPicks({
  slug,
  cards,
  timezone,
  forUserId,
  canEditLocked = false,
}: {
  slug: string;
  cards: TournamentCard[];
  timezone: string;
  /** Saving for another entry (commissioner or co-manager). */
  forUserId?: string;
  /** The commissioner, editing for a player, isn't held to the lock. */
  canEditLocked?: boolean;
}) {
  if (!cards.length) return null;
  return (
    // A big week (conference tournaments) lays the cards out two or three across on desktop.
    <section className="mb-4 grid gap-2 lg:grid-cols-2 min-[1600px]:grid-cols-3" aria-label="Tournament champion picks">
      {cards.map((c) => (
        <Card key={c.id} slug={slug} card={c} timezone={timezone} forUserId={forUserId} canEditLocked={canEditLocked} />
      ))}
    </section>
  );
}

function Card({ slug, card: c, timezone, forUserId, canEditLocked }: { slug: string; card: TournamentCard; timezone: string; forUserId?: string; canEditLocked: boolean }) {
  const [teamId, setTeamId] = useState(c.pick?.teamId ?? "");
  const [state, setState] = useState<{ saving?: boolean; saved?: boolean; error?: string }>({});
  const [, start] = useTransition();
  // eslint-disable-next-line react-hooks/purity -- render-time snapshot; the server enforces the lock
  const locked = new Date(c.lockAt).getTime() <= Date.now();
  const editable = !locked || canEditLocked;
  const team = c.teams.find((t) => t.id === teamId);

  const choose = (id: string) => {
    const prev = teamId;
    setTeamId(id);
    setState({ saving: true });
    start(async () => {
      const res = await saveTournamentPick(slug, c.id, id || null, forUserId);
      if (res.error) {
        setTeamId(prev);
        setState({ error: res.error });
      } else setState({ saved: true });
    });
  };

  return (
    <div className="rounded-lg border border-line bg-surface/60 px-3 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[15px] font-bold text-ink">{c.name}</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-accent">Champion pick</span>
        <span className="ml-auto flex items-center gap-1 text-xs text-muted tabular-nums">
          {locked && <LockIcon className="size-3" />}
          {locked ? "Locked" : `Locks ${formatInTimeZone(c.lockAt, timezone, "EEE M/d, h:mm a")}`}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <TeamLogo src={team?.logo_url} abbr={team?.abbreviation} className="size-6 shrink-0" />
        {editable ? (
          <select
            value={teamId}
            onChange={(e) => choose(e.target.value)}
            aria-label={`${c.name} champion`}
            className="h-10 min-w-0 flex-1 rounded-[10px] bg-bg px-3 text-[15px] font-semibold text-ink outline-none ring-1 ring-line focus:ring-2 focus:ring-accent"
          >
            <option value="">Pick a champion…</option>
            {c.teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{team ? teamName(team) : <span className="text-muted">No pick</span>}</span>
        )}
        {/* Once results are in: where the pick finished and its points. */}
        {c.decided && c.pick && (
          <span className="shrink-0 text-right text-xs text-muted">
            {c.pick.place ?? "Didn't place"}{" "}
            <span className={`ml-1 text-sm font-semibold tabular-nums ${(c.pick.points ?? 0) > 0 ? "text-win" : "text-ink"}`}>{signed(c.pick.points ?? 0)}</span>
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2 text-xs text-muted">
        <span>{c.scoringLabel}</span>
        <span role="status" aria-live="polite" className={state.error ? "text-loss" : ""}>
          {state.saving ? "Saving…" : state.error ? state.error : state.saved ? "Saved" : ""}
        </span>
      </div>
    </div>
  );
}
