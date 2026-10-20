import Link from "next/link";
import { points as fmt } from "@/lib/format";
import { TeamLogo } from "./ui";

type Team = { id: string; abbreviation: string | null; short_name: string | null; name: string; logo_url: string | null };
export type TournamentColumn = { id: string; name: string; locked: boolean; teams: Map<string, Team> };
export type TournamentRow = {
  userId: string;
  name: string;
  /** Points from decided tournaments. */
  points: number;
  /** Tournaments where they picked the champion. */
  champs: number;
  /** tournament id → the visible pick (team id and points, null until decided). */
  picks: Map<string, { teamId: string; points: number | null }>;
};

/** Up to this many tournaments get a column of their own (each pick's logo); past it, a count. */
export const MAX_PICK_COLUMNS = 4;

/**
 * The tournament champion bonus line: every player's points from tournament picks, best
 * first (ties share a rank), with each tournament's pick once it has locked. With more
 * tournaments than fit (conference tournaments), it shows how many champions they picked instead.
 */
export function TournamentStandings({
  rows,
  tournaments,
  me,
  playerHref,
}: {
  rows: TournamentRow[];
  tournaments: TournamentColumn[];
  me: string;
  playerHref: (userId: string) => string;
}) {
  const sorted = [...rows].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  const ranked = sorted.map((r) => ({ ...r, rank: 1 + sorted.findIndex((x) => x.points === r.points) }));
  return (
    <ul className="divide-y divide-line border-b border-line">
      {ranked.map((r) => {
        const mine = r.userId === me;
        return (
          <li key={r.userId} className="flex min-h-9 items-center gap-2 py-1.5 text-sm">
            <span className="w-6 text-right tabular-nums text-muted">{r.rank}</span>
            <span className="min-w-0 flex-1 truncate font-medium">
              <Link href={playerHref(r.userId)} className={`hover:underline ${mine ? "text-accent" : ""}`}>{r.name}</Link>
              {mine && <span className="ml-1.5 text-xs font-normal text-muted">You</span>}
            </span>
            {tournaments.length > MAX_PICK_COLUMNS && (
              <span className="w-14 text-right tabular-nums text-muted">{r.champs}</span>
            )}
            {/* Each tournament's pick, once it locks (logo, green when it scored). */}
            {tournaments.length <= MAX_PICK_COLUMNS && tournaments.map((t) => {
              const p = r.picks.get(t.id);
              const team = p ? t.teams.get(p.teamId) : undefined;
              return (
                <span key={t.id} className="flex w-9 shrink-0 justify-center" title={team ? `${t.name}: ${team.short_name ?? team.name}${p?.points != null ? ` (${fmt(p.points)})` : ""}` : t.name}>
                  {team ? (
                    <span className={`rounded-full p-0.5 ${p?.points != null && p.points > 0 ? "ring-2 ring-win" : ""}`}>
                      <TeamLogo src={team.logo_url} abbr={team.abbreviation} className="size-5" />
                    </span>
                  ) : (
                    <span className="text-faint">{t.locked ? "—" : ""}</span>
                  )}
                </span>
              );
            })}
            <span className="w-12 text-right font-semibold tabular-nums">{fmt(r.points)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Column labels matching TournamentStandings: Player · one short label per tournament · Pts. */
export function TournamentHeaderRow({ tournaments }: { tournaments: { id: string; name: string }[] }) {
  const head = "text-[11px] font-medium text-muted";
  // "Players Era 8" → "PE8" (a numbered event: initials and number); "Maui Invitational" → "MAUI".
  const short = (name: string) => {
    const words = name.split(/\s+/).filter(Boolean);
    return words.some((w) => /^\d+$/.test(w))
      ? words.map((w) => (/^\d+$/.test(w) ? w : w[0])).join("").toUpperCase().slice(0, 4)
      : words[0].slice(0, 4).toUpperCase();
  };
  return (
    <div className="flex items-end gap-2 border-b border-line pb-1.5 pt-2" aria-hidden>
      <span className="w-6" />
      <span className={`min-w-0 flex-1 ${head}`}>Player</span>
      {tournaments.length > MAX_PICK_COLUMNS ? (
        <span className={`w-14 text-right ${head}`} title="Tournaments where they picked the champion">Champs</span>
      ) : (
        tournaments.map((t) => (
          <span key={t.id} className={`w-9 shrink-0 text-center ${head}`} title={t.name}>{short(t.name)}</span>
        ))
      )}
      <span className={`w-12 text-right ${head}`}>Pts</span>
    </div>
  );
}
