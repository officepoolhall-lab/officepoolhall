"use client";

import { useMemo, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, TeamLogo, buttonClass, chipClass } from "@/components/ui";
import { PlayerDialog, TeamHistoryDialog } from "@/components/ProfileDialogs";
import { FitText } from "@/components/FitText";
import { POSITIONS, type Position } from "@/lib/playoffFantasy";

type Player = { id: string; name: string; pos: Position; teamId: string; depth?: number | null };
type Team = { id: string; espnId?: string | null; name: string; abbreviation: string | null; logo_url: string | null };

/** How deep each position's list goes before "Show backups": the players who'd usually start. */
const STARTERS: Record<Position, number> = { QB: 1, RB: 1, WR: 3, TE: 1, K: 1, DEF: 1 };

/**
 * Build the lineup, laid out like the other pools' My Picks: the lineup on the left (a spot for
 * every position), the playoff teams on the right as cards of their players, starters first.
 * One player per team (a used team's card dims) and no more at a position than it has spots.
 * Filter by position or team, or search; tap a name for his game log and season stats (a
 * defense: the team's recent games). Saves the whole lineup at once; it can be part-filled.
 */
export function PfLineupBuilder({
  players,
  teams,
  roster,
  initial,
  save,
  forName,
  lockText,
  timezone = "America/Chicago",
  stats = {},
  injuries = {},
}: {
  players: Player[];
  teams: Team[];
  roster: Record<Position, number>;
  initial: string[];
  save: (ids: string[]) => Promise<{ error?: string }>;
  forName?: string;
  /** "Locks Sat, Jan 16 · 3:30 PM". */
  lockText?: string | null;
  timezone?: string;
  /** Regular-season line in each skill player's main category ("812 yds · 7 TD"), shown on desktop, and his yards (for ranking). */
  stats?: Record<string, { line: string; vol: number }>;
  /** Injury designations: Q, D or O. */
  injuries?: Record<string, "Q" | "D" | "O">;
}) {
  const router = useRouter();
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const teamOf = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const [picked, setPicked] = useState<string[]>(initial.filter((id) => byId.has(id)));
  const [pos, setPos] = useState<Position | "ALL">("ALL");
  const [teamId, setTeamId] = useState<string>("ALL");
  const [query, setQuery] = useState("");
  const [backups, setBackups] = useState(false);
  const [info, setInfo] = useState<Player | null>(null);
  // Phones: the lineup folds away so the players are in reach; desktop always shows it.
  const [lineupOpen, setLineupOpen] = useState(false);
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();

  const open = POSITIONS.filter((p) => roster[p] > 0);
  const total = open.reduce((t, p) => t + roster[p], 0);
  const mine: Player[] = picked.flatMap((id) => (byId.has(id) ? [byId.get(id) as Player] : []));
  const countAt = (p: Position) => mine.filter((x) => x.pos === p).length;
  const usedTeams = new Map(mine.map((p) => [p.teamId, p]));
  const dirty = picked.join() !== initial.join();

  const toggle = (p: Player) => {
    setMessage(null);
    setPicked((cur) => (cur.includes(p.id) ? cur.filter((id) => id !== p.id) : [...cur, p.id]));
  };
  const onSave = () =>
    start(async () => {
      const r = await save(picked).catch(() => ({ error: "That didn't save. Try again." }));
      setMessage(r.error ? { error: r.error } : { ok: "Lineup saved." });
      if (!r.error) router.refresh();
    });

  // Which players each team card lists.
  const q = query.trim().toLowerCase();
  // The players each team shows by default: exactly its top QB, RB, 3 WRs, TE, K and DEF.
  // Ranked by this season's yards (the leaders), then the depth chart, then name. A player
  // you've picked from deeper down takes the last spot at his position, so the count stays.
  const top = useMemo(() => {
    const keep = new Set<string>();
    const groups = new Map<string, Player[]>();
    for (const p of players) groups.set(`${p.teamId}:${p.pos}`, [...(groups.get(`${p.teamId}:${p.pos}`) ?? []), p]);
    for (const g of groups.values()) {
      const n = STARTERS[g[0].pos];
      const ranked = [...g].sort((a, b) => (stats[b.id]?.vol ?? -1) - (stats[a.id]?.vol ?? -1) || (a.depth ?? 99) - (b.depth ?? 99) || a.name.localeCompare(b.name));
      const mineHere = ranked.filter((p) => picked.includes(p.id));
      const rest = ranked.filter((p) => !picked.includes(p.id));
      for (const p of [...mineHere, ...rest].slice(0, Math.max(n, mineHere.length))) keep.add(p.id);
    }
    return keep;
  }, [players, stats, picked]);
  const shown = (p: Player) => {
    if (pos !== "ALL" && p.pos !== pos) return false;
    if (picked.includes(p.id)) return true;
    if (q) return p.name.toLowerCase().includes(q) || (teamOf.get(p.teamId)?.name ?? "").toLowerCase().includes(q);
    // One team chosen, or Show backups: everyone.
    if (backups || teamId !== "ALL") return true;
    return top.has(p.id);
  };
  const cards = teams
    .filter((t) => teamId === "ALL" || t.id === teamId)
    .map((t) => ({
      t,
      list: players
        .filter((p) => p.teamId === t.id && shown(p))
        .sort((a, b) => POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) || (stats[b.id]?.vol ?? -1) - (stats[a.id]?.vol ?? -1) || (a.depth ?? 99) - (b.depth ?? 99) || a.name.localeCompare(b.name)),
    }))
    .filter((c) => c.list.length > 0)
    // Teams still open first, then the ones already used.
    .sort((a, b) => Number(usedTeams.has(a.t.id)) - Number(usedTeams.has(b.t.id)) || a.t.name.localeCompare(b.t.name));

  // Q (questionable) in amber; D (doubtful) and O (out) in red.
  const INJURY_NAME = { Q: "Questionable", D: "Doubtful", O: "Out" } as const;
  const injuryTag = (p: Player) => {
    const tag = injuries[p.id];
    if (!tag) return null;
    return (
      <span title={INJURY_NAME[tag]} className={`shrink-0 self-center rounded px-1 text-[10px] font-bold leading-4 ${tag === "Q" ? "bg-[color-mix(in_srgb,#d97706_15%,transparent)] text-[#b45309]" : "bg-[var(--loss-fill)] text-loss"}`}>
        {tag}
        <span className="sr-only"> ({INJURY_NAME[tag]})</span>
      </span>
    );
  };


  return (
    // Desktop: sized to the screen above the Save bar, so the page itself never scrolls. The
    // lineup stays put on the left; only the players scroll, inside their own column.
    <div
      data-wide
      data-fill-viewport
      className="pb-24 lg:h-[max(18rem,calc(100dvh-8rem-3px-4.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] lg:pb-0"
    >
      <div className="lg:grid lg:h-full lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-6 min-[1600px]:grid-cols-[22rem_minmax(0,1fr)]">
        {/* The lineup: a spot for every position. Tap × to drop a player, an open spot to see that position. */}
        {/* Desktop: the lineup shrinks its rows to fit the screen's height (down to a floor). */}
        <aside className="mb-5 lg:mb-0 lg:flex lg:min-h-0 lg:flex-col">
          <div className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
            <h2 className="mb-1 flex shrink-0 items-baseline justify-between gap-3 text-lg font-extrabold tracking-[-0.03em]">
              {forName ? "Their lineup" : "My Lineup"}
              <button type="button" onClick={() => setLineupOpen(!lineupOpen)} aria-expanded={lineupOpen} className="rounded-md px-1.5 py-0.5 text-sm font-semibold tracking-normal text-accent transition hover:bg-hover lg:hidden">
                {lineupOpen ? "Hide" : `Show (${mine.length}/${total})`}
              </button>
            </h2>
            <ul
              style={{ "--rows": open.reduce((n, p) => n + Math.max(roster[p], countAt(p)), 0) } as CSSProperties}
              className={`divide-y divide-line border-y border-line lg:grid lg:min-h-0 lg:shrink lg:grid-rows-[repeat(var(--rows),minmax(1.25rem,2.25rem))] lg:overflow-y-auto ${lineupOpen ? "" : "max-lg:hidden"}`}
            >
              {open.flatMap((p) => {
                const at = mine.filter((x) => x.pos === p);
                return Array.from({ length: Math.max(roster[p], at.length) }, (_, i) => {
                  const pl = at[i];
                  const team = pl ? teamOf.get(pl.teamId) : null;
                  return (
                    <li key={`${p}${i}`} className="flex min-h-9 items-center gap-2 py-0.5 lg:min-h-0 lg:py-0">
                      <span className="w-8 shrink-0 text-xs font-bold text-muted">{p}</span>
                      {pl ? (
                        <>
                          <TeamLogo src={team?.logo_url} abbr={team?.abbreviation} className="size-5 shrink-0" />
                          <button
                            type="button"
                            onClick={() => setInfo(pl)}
                            title={pl.pos === "DEF" ? "Recent games" : "Game log and season stats"}
                            className="-mx-1 flex min-w-0 flex-1 items-center gap-1.5 self-stretch rounded-md px-1 text-left transition hover:bg-hover"
                          >
                            <span className="min-w-0 truncate text-sm font-semibold text-ink">{pl.name}</span>
                            {injuryTag(pl)}
                            <span className="shrink-0 text-xs text-muted">{team?.abbreviation}</span>
                          </button>
                          <button type="button" onClick={() => toggle(pl)} aria-label={`Remove ${pl.name}`} className="grid size-7 shrink-0 place-items-center rounded-full text-lg leading-none text-muted transition hover:bg-hover hover:text-loss lg:size-6">
                            ×
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => { setPos(p); setLineupOpen(false); }} className="-mx-1.5 flex-1 rounded-md px-1.5 py-1 text-left text-sm text-faint transition hover:bg-hover hover:text-accent">
                          Open
                        </button>
                      )}
                    </li>
                  );
                });
              })}
            </ul>
          </div>
        </aside>

        {/* Desktop: the progress bar and filters stay put; the team cards scroll under them. */}
        <div className="min-w-0 lg:flex lg:min-h-0 lg:flex-col">
          {/* Above the players: how far along, when it locks, and which teams are still free (beside the lineup, so the whole lineup fits on screen). */}
          <section className="mb-5 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border-2 border-accent bg-surface px-4 py-2.5 lg:[@media(max-height:800px)]:mb-3 lg:[@media(max-height:800px)]:py-1.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-xl font-extrabold tabular-nums tracking-[-0.02em] sm:text-2xl lg:[@media(max-height:800px)]:text-xl">
                  {mine.length} <span className="text-muted">of {total} picked</span>
                </span>
                {lockText && <span className="text-sm text-muted">{lockText}</span>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1" aria-label="Teams still free">
              <span className="mr-1 text-xs font-medium text-muted tabular-nums">{teams.length - usedTeams.size} teams left</span>
              {teams.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTeamId(teamId === t.id ? "ALL" : t.id)}
                  title={usedTeams.has(t.id) ? `${t.name}: ${usedTeams.get(t.id)!.name}` : `${t.name}: free`}
                  className={`rounded-full p-0.5 transition hover:bg-hover ${usedTeams.has(t.id) ? "opacity-25 grayscale" : ""} ${teamId === t.id ? "ring-2 ring-accent" : ""}`}
                >
                  <TeamLogo src={t.logo_url} abbr={t.abbreviation} className="size-6" />
                </button>
              ))}
            </div>
          </section>
          {/* Filters: position (one line that wraps, never scrolls), then team, search, backups. */}
          <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2 lg:[@media(max-height:800px)]:mb-2">
            <div className="grid w-full grid-cols-7 gap-1 sm:flex sm:w-auto sm:gap-1.5">
              <button type="button" onClick={() => setPos("ALL")} className={chipClass(pos === "ALL", "justify-center !px-1 sm:!px-3", "sm")}>All</button>
              {open.map((p) => (
                <button key={p} type="button" onClick={() => setPos(pos === p ? "ALL" : p)} className={chipClass(pos === p, "flex-col justify-center !gap-0 !px-1 leading-tight max-sm:!h-auto max-sm:py-1 sm:flex-row sm:!px-3", "sm")}>
                  <span>{p}</span>
                  <span className={`text-[10px] tabular-nums sm:ml-1 sm:text-xs ${countAt(p) >= roster[p] ? "" : "opacity-70"}`}>{countAt(p)}/{roster[p]}</span>
                </button>
              ))}
            </div>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              aria-label="Team"
              className="h-9 rounded-full bg-surface px-3 text-sm font-semibold text-ink outline-none ring-1 ring-line focus:ring-2 focus:ring-accent"
            >
              <option value="ALL">All teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {usedTeams.has(t.id) ? " (used)" : ""}
                </option>
              ))}
            </select>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search players"
              aria-label="Search players"
              className="h-9 min-w-0 flex-1 rounded-full bg-surface px-3.5 text-sm outline-none ring-1 ring-line placeholder:text-faint focus:ring-2 focus:ring-accent sm:max-w-56"
            />
            <label className="flex items-center gap-1.5 whitespace-nowrap text-sm text-muted">
              <input type="checkbox" checked={backups} onChange={(e) => setBackups(e.target.checked)} className="size-4 accent-[var(--accent)]" />
              Show backups
            </label>
          </div>

          <p className="mb-2 shrink-0 text-sm text-muted">Tap a player&apos;s name to see his game log and season stats.</p>
          {/* One card per team, its players starters first. */}
          {cards.length === 0 ? (
            <p className="py-6 text-sm text-muted">No players match.</p>
          ) : (
            <div className="grid content-start gap-x-4 gap-y-3 md:grid-cols-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pb-4 lg:pr-1 2xl:grid-cols-3">
              {cards.map(({ t, list }) => {
                const used = usedTeams.get(t.id);
                return (
                  <section key={t.id} className="min-w-0">
                    <h3 className="mb-0.5 flex items-center gap-2 border-l-4 border-accent bg-surface px-3 py-1 text-sm font-bold text-ink lg:rounded-r-md">
                      <TeamLogo src={t.logo_url} abbr={t.abbreviation} className="size-5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{t.name}</span>
                      {used && <span className="shrink-0 truncate text-xs font-semibold text-loss">Used · {used.name}</span>}
                    </h3>
                    <ul className="divide-y divide-line">
                      {list.map((p) => {
                        const on = picked.includes(p.id);
                        const blocked = on ? null : used ? "Team used" : countAt(p.pos) >= roster[p.pos] ? `${p.pos} full` : null;
                        return (
                          <li key={p.id} className="flex min-h-8 items-center gap-2 py-0.5">
                            <span className="w-7 shrink-0 text-[11px] font-bold text-muted">{p.pos}</span>
                            {/* The whole stretch from the name to the pick button opens his stats. */}
                            <button
                              type="button"
                              onClick={() => setInfo(p)}
                              title={p.pos === "DEF" ? "Recent games" : "Game log and season stats"}
                              className={`-my-0.5 flex min-h-8 min-w-0 flex-1 items-center gap-2 self-stretch rounded-md px-1.5 text-left transition hover:bg-hover ${blocked ? "opacity-50" : ""}`}
                            >
                              <span className={`shrink-0 whitespace-nowrap text-[13px] ${on ? "font-bold text-accent" : "font-semibold text-ink"}`}>{p.name}</span>
                              {injuryTag(p)}
                              {/* Desktop: his season so far in his main category. */}
                              {/* The whole line always shows: it shrinks to fit rather than being cut off. */}
                              {stats[p.id] && (
                                <span className="hidden min-w-0 flex-1 lg:block">
                                  <FitText min={7} className="block text-[11px] tabular-nums text-muted">{stats[p.id].line}</FitText>
                                </span>
                              )}
                              {blocked && <span className="ml-auto shrink-0 text-[10px] font-medium text-muted">{blocked}</span>}
                            </button>
                            <button
                              type="button"
                              onClick={() => toggle(p)}
                              disabled={Boolean(blocked)}
                              aria-pressed={on}
                              aria-label={on ? `Remove ${p.name}` : `Pick ${p.name}`}
                              className={`grid h-7 w-12 shrink-0 place-items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-30 ${
                                on ? "bg-accent/15 text-accent ring-2 ring-accent" : "bg-surface text-muted ring-1 ring-line hover:ring-accent/60"
                              }`}
                            >
                              {on ? <CheckIcon className="size-4" /> : <span aria-hidden className="size-3.5 rounded-full border-2 border-current" />}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Count and Save, always in reach. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 py-2.5 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] lg:max-w-none">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-ink tabular-nums">
              {mine.length} of {total} players{forName ? ` for ${forName}` : ""}
              <span className="ml-2 text-sm font-normal text-muted">{teams.length - usedTeams.size} teams left</span>
            </div>
            {message?.error && <div className="text-xs font-semibold text-loss">{message.error}</div>}
            {message?.ok && !dirty && <div className="text-xs font-semibold text-win">{message.ok}</div>}
            {dirty && !message?.error && <div className="text-xs text-muted">Not saved yet</div>}
          </div>
          <button type="button" onClick={onSave} disabled={pending || !dirty} className={buttonClass("accent", "disabled:opacity-40")}>
            {pending ? "Saving…" : "Save lineup"}
          </button>
        </div>
      </div>

      {info &&
        (info.pos === "DEF" ? (
          teamOf.get(info.teamId)?.espnId ? (
            <TeamHistoryDialog
              sport="nfl"
              espnId={teamOf.get(info.teamId)!.espnId!}
              name={teamOf.get(info.teamId)!.name}
              logo={teamOf.get(info.teamId)!.logo_url}
              ats={false}
              timezone={timezone}
              onClose={() => setInfo(null)}
            />
          ) : null
        ) : (
          <PlayerDialog sport="nfl" id={info.id} name={info.name} onClose={() => setInfo(null)} />
        ))}
    </div>
  );
}
