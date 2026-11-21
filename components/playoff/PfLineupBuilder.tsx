"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TeamLogo, buttonClass, chipClass } from "@/components/ui";
import { POSITIONS, POSITION_NAME, type Position } from "@/lib/playoffFantasy";

type Player = { id: string; name: string; pos: Position; teamId: string };
type Team = { id: string; name: string; abbreviation: string | null; logo_url: string | null };

/**
 * Build the roster: a tab per position, each listing that position's players by team. A team
 * that's already on the roster is used up (one player per team), and a position stops taking
 * players once its spots are full. Saves the whole roster at once; it can be part-filled.
 */
export function PfLineupBuilder({
  players,
  teams,
  roster,
  initial,
  save,
  forName,
}: {
  players: Player[];
  teams: Team[];
  roster: Record<Position, number>;
  initial: string[];
  save: (ids: string[]) => Promise<{ error?: string }>;
  forName?: string;
}) {
  const router = useRouter();
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const teamOf = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const [picked, setPicked] = useState<string[]>(initial.filter((id) => byId.has(id)));
  const [tab, setTab] = useState<Position>(POSITIONS.find((p) => roster[p] > 0) ?? "QB");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();

  const total = POSITIONS.reduce((t, p) => t + roster[p], 0);
  const mine: Player[] = picked.flatMap((id) => (byId.has(id) ? [byId.get(id) as Player] : []));
  const countAt = (pos: Position) => mine.filter((p) => p.pos === pos).length;
  const usedTeams = new Map(mine.map((p) => [p.teamId, p]));
  const dirty = picked.join() !== initial.join();

  const toggle = (p: Player) => {
    setMessage(null);
    setPicked((cur) => (cur.includes(p.id) ? cur.filter((id) => id !== p.id) : [...cur, p.id]));
  };
  const onSave = () =>
    start(async () => {
      const r = await save(picked).catch(() => ({ error: "That didn't save. Try again." }));
      setMessage(r.error ? { error: r.error } : { ok: "Roster saved." });
      if (!r.error) router.refresh();
    });

  const q = query.trim().toLowerCase();
  const list = players
    .filter((p) => p.pos === tab && (!q || p.name.toLowerCase().includes(q) || (teamOf.get(p.teamId)?.name ?? "").toLowerCase().includes(q)))
    .sort((a, b) => (teamOf.get(a.teamId)?.name ?? "").localeCompare(teamOf.get(b.teamId)?.name ?? "") || a.name.localeCompare(b.name));

  return (
    <div className="pb-24">
      {/* The roster so far: a spot for every position; tap a filled one to drop the player. */}
      <section className="rounded-2xl bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold">Your roster</h2>
          <span className="text-sm text-muted tabular-nums">{mine.length} of {total}</span>
        </div>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {POSITIONS.flatMap((pos) => {
            const at = mine.filter((p) => p.pos === pos);
            return Array.from({ length: Math.max(roster[pos], at.length) }, (_, i) => {
              const p = at[i];
              const team = p ? teamOf.get(p.teamId) : null;
              return p ? (
                <button key={`${pos}${i}`} type="button" onClick={() => toggle(p)} title="Remove" className="flex h-11 items-center gap-2 rounded-xl bg-accent/15 px-2 text-left ring-1 ring-accent">
                  <span className="w-8 shrink-0 text-center text-[11px] font-bold text-accent">{pos}</span>
                  <TeamLogo src={team?.logo_url} abbr={team?.abbreviation} className="size-5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
                  <span aria-hidden className="text-muted">×</span>
                </button>
              ) : (
                <button key={`${pos}${i}`} type="button" onClick={() => setTab(pos)} className="flex h-11 items-center gap-2 rounded-xl bg-bg px-2 text-left ring-1 ring-dashed ring-line hover:ring-accent/50">
                  <span className="w-8 shrink-0 text-center text-[11px] font-bold text-muted">{pos}</span>
                  <span className="text-sm text-faint">Open: pick a {POSITION_NAME[pos].toLowerCase()}</span>
                </button>
              );
            });
          })}
        </div>
        {/* One player per team: which teams are still free. */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted">Teams left:</span>
          {teams.map((t) => (
            <span key={t.id} title={usedTeams.has(t.id) ? `${t.name}: ${usedTeams.get(t.id)!.name}` : `${t.name}: free`} className={usedTeams.has(t.id) ? "opacity-25 grayscale" : ""}>
              <TeamLogo src={t.logo_url} abbr={t.abbreviation} className="size-6" />
            </span>
          ))}
        </div>
      </section>

      <div className="-mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {POSITIONS.filter((p) => roster[p] > 0).map((p) => (
          <button key={p} type="button" onClick={() => setTab(p)} className={chipClass(p === tab, "shrink-0")}>
            {p} <span className="ml-1 tabular-nums opacity-70">{countAt(p)}/{roster[p]}</span>
          </button>
        ))}
      </div>
      <input
        type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${POSITION_NAME[tab].toLowerCase()}s or teams`} aria-label="Search players"
        className="mt-2 h-10 w-full rounded-[10px] bg-surface px-3 text-sm outline-none ring-1 ring-line placeholder:text-faint focus:ring-2 focus:ring-accent sm:max-w-xs"
      />

      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => {
          const on = picked.includes(p.id);
          const team = teamOf.get(p.teamId);
          const teamTaken = usedTeams.get(p.teamId);
          const blocked = on ? null : teamTaken ? `${team?.abbreviation ?? "Team"} used: ${teamTaken.name}` : countAt(p.pos) >= roster[p.pos] ? `${p.pos} spots are full` : null;
          return (
            <li key={p.id}>
              <button
                type="button" onClick={() => toggle(p)} disabled={Boolean(blocked)} aria-pressed={on} title={blocked ?? undefined}
                className={`flex h-12 w-full items-center gap-2 rounded-xl px-2.5 text-left transition disabled:cursor-not-allowed ${
                  on ? "bg-accent/15 ring-2 ring-accent" : blocked ? "opacity-40" : "bg-surface ring-1 ring-line hover:ring-accent/50"
                }`}
              >
                <TeamLogo src={team?.logo_url} abbr={team?.abbreviation} className="size-6 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-semibold ${on ? "text-accent" : "text-ink"}`}>{p.name}</span>
                  <span className="block truncate text-[11px] text-muted">{blocked ?? team?.name}</span>
                </span>
                {on && (
                  <svg aria-hidden viewBox="0 0 20 20" className="size-4 shrink-0 text-accent">
                    <path d="M5 10.5l3.2 3.2L15 6.8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="py-6 text-sm text-muted">No players match.</li>}
      </ul>

      {/* Count and Save, always in reach. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-ink tabular-nums">
              {mine.length} of {total} players{forName ? ` for ${forName}` : ""}
              <span className="ml-2 text-sm font-normal text-muted">{teams.length - usedTeams.size} teams left</span>
            </div>
            {message?.error && <div className="text-xs font-semibold text-loss">{message.error}</div>}
            {message?.ok && !dirty && <div className="text-xs font-semibold text-win">{message.ok}</div>}
          </div>
          <button type="button" onClick={onSave} disabled={pending || !dirty} className={buttonClass("accent", "disabled:opacity-40")}>
            {pending ? "Saving…" : "Save roster"}
          </button>
        </div>
      </div>
    </div>
  );
}
