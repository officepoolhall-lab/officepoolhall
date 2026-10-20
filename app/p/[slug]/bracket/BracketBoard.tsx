"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { LockIcon, TeamLogo, chipClass } from "@/components/ui";
import { ROUNDS, TOTAL_GAMES, choose, eliminatedTeams, gameKey, gameTeams, gamesIn, pickCount, roundPoints, scoreBracket, seedOf, type Picks } from "@/lib/bracket";
import { saveBracketPicks } from "./actions";

type Team = { id: string; name: string; short_name: string | null; abbreviation: string | null; logo_url: string | null };

const SAVE_DEBOUNCE_MS = 700;
const teamName = (t: Team) => t.short_name ?? t.name;

/**
 * A player's NCAA Tournament bracket. One region at a time (First Round → Elite 8 left to
 * right), plus the Final Four. Tap a team to pick it to win that game; changing an early pick
 * clears the later picks that depended on it. Saves as you go until the lock. After that it's
 * read-only and shows results: green for a pick that won (with its points), red for one that lost.
 */
export function BracketBoard({
  slug,
  bracketId,
  regions,
  field,
  results,
  initialPicks,
  editable,
  lockAt,
  timezone,
  forUserId,
  title,
}: {
  slug: string;
  bracketId: string;
  regions: string[];
  field: (Team | null)[];
  results: Picks;
  initialPicks: Picks;
  editable: boolean;
  lockAt: string;
  timezone: string;
  /** Saving for another entry (co-manager or commissioner). */
  forUserId?: string;
  title: string;
}) {
  const [picks, setPicks] = useState<Picks>(initialPicks);
  const [view, setView] = useState(0); // 0–3 regions, 4 Final Four
  const [save, setSave] = useState<{ state: "idle" | "saving" | "saved" | "error"; message?: string }>({ state: "idle" });
  const latest = useRef(picks);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ids = useMemo(() => field.map((t) => t?.id ?? null), [field]);
  const byId = useMemo(() => new Map(field.flatMap((t, slot) => (t ? [[t.id, { team: t, seed: seedOf(slot), slot }] as const] : []))), [field]);
  const out = useMemo(() => eliminatedTeams(ids, results), [ids, results]);
  const score = scoreBracket(picks, results, ids);
  const decided = Object.keys(results).length > 0;

  const flush = async () => {
    setSave({ state: "saving" });
    const res = await saveBracketPicks(slug, bracketId, latest.current, forUserId);
    setSave(res.error ? { state: "error", message: res.error } : { state: "saved" });
  };
  const update = (next: Picks) => {
    latest.current = next;
    setPicks(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void flush();
    }, SAVE_DEBOUNCE_MS);
  };
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (timer.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const pick = (round: number, game: number, team: string | null) => {
    if (!editable || !team) return;
    update(choose(latest.current, round, game, team));
  };

  // Fill every empty game with the better seed (the top line on a tie), round by round.
  const fillFavorites = () => {
    const next = { ...latest.current };
    for (let r = 1; r <= 6; r++) {
      for (let g = 0; g < gamesIn(r); g++) {
        const key = gameKey(r, g);
        if (next[key]) continue;
        const [a, b] = gameTeams(r, g, ids, next);
        if (!a || !b) continue;
        next[key] = (byId.get(b)?.seed ?? 99) < (byId.get(a)?.seed ?? 99) ? b : a;
      }
    }
    update(next);
  };

  const made = pickCount(picks);
  const champion = picks[gameKey(6, 0)];
  const locked = !editable;

  // ---------- one game ----------
  // Plain render helpers (not components), so the bracket isn't remounted on every pick.
  const renderGame = (round: number, game: number, label?: string) => {
    const key = gameKey(round, game);
    const teams = gameTeams(round, game, ids, picks);
    const result = results[key];
    return (
      <div className="w-full">
        {label && <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>}
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          {teams.map((id, i) => {
            const info = id ? byId.get(id) : undefined;
            const selected = Boolean(id) && picks[key] === id;
            const won = selected && result === id;
            const lost = selected && ((result && result !== id) || (!result && id !== null && out.has(id)));
            const value = info ? roundPoints(round, info.seed) : 0;
            return (
              <button
                key={i}
                type="button"
                disabled={!editable || !id}
                onClick={() => pick(round, game, id)}
                aria-pressed={selected}
                className={`flex h-8 w-full items-center gap-1.5 px-2 text-left text-[13px] transition ${i === 0 ? "border-b border-line" : ""} ${
                  won ? "bg-win/15" : lost ? "bg-loss/10" : selected ? "bg-accent/15" : editable && id ? "hover:bg-hover" : ""
                } disabled:cursor-default`}
              >
                {info ? (
                  <>
                    <span className="w-4 shrink-0 text-right text-[10px] tabular-nums text-muted">{info.seed}</span>
                    <TeamLogo src={info.team.logo_url} abbr={info.team.abbreviation} className="size-4 shrink-0" />
                    <span className={`min-w-0 flex-1 truncate ${selected ? "font-semibold" : ""} ${lost ? "text-loss line-through" : selected ? "text-accent" : "text-ink"} ${won ? "!text-win" : ""}`}>
                      {teamName(info.team)}
                    </span>
                    {selected && (
                      <span className={`shrink-0 text-[10px] font-semibold tabular-nums ${won ? "text-win" : lost ? "text-loss" : "text-muted"}`}>+{value}</span>
                    )}
                    {/* The actual winner, when the pick was someone else. */}
                    {!selected && result === id && <span className="shrink-0 text-[10px] font-semibold text-muted">W</span>}
                  </>
                ) : (
                  <span className="text-muted">{round === 1 ? "TBD" : "—"}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // ---------- a region: four rounds side by side ----------
  const renderRegion = (r: number) => (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="grid min-w-[44rem] grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((round) => {
          const per = 8 >> (round - 1);
          return (
            <div key={round} className="flex flex-col">
              <div className="mb-1 text-center text-[11px] font-semibold text-muted">{ROUNDS[round - 1].name}</div>
              <div className="flex flex-1 flex-col justify-around gap-2">
                {Array.from({ length: per }, (_, i) => (
                  <div key={i}>{renderGame(round, r * per + i)}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const regionPicks = (r: number) =>
    [1, 2, 3, 4].reduce((n, round) => {
      const per = 8 >> (round - 1);
      return n + Array.from({ length: per }, (_, i) => picks[gameKey(round, r * per + i)]).filter(Boolean).length;
    }, 0);

  return (
    <div data-wide>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <span className="text-sm text-muted tabular-nums">
          {locked ? (
            <span className="inline-flex items-center gap-1"><LockIcon className="size-3.5" /> Locked</span>
          ) : (
            <>Locks {formatInTimeZone(lockAt, timezone, "EEE MMM d, h:mm a")}</>
          )}
          {" · "}
          <span className={made === TOTAL_GAMES ? "font-semibold text-ink" : "font-semibold text-accent"}>{made}/{TOTAL_GAMES}</span> picked
        </span>
        {decided && (
          <span className="text-sm tabular-nums">
            <span className="font-semibold text-ink">{score.points}</span> <span className="text-muted">pts · {score.correct} right · max {score.possible}</span>
          </span>
        )}
        {champion && byId.get(champion) && (
          <span className="flex items-center gap-1.5 text-sm">
            <span className="text-muted">Champion:</span>
            <TeamLogo src={byId.get(champion)!.team.logo_url} abbr={byId.get(champion)!.team.abbreviation} className="size-5" />
            <span className={`font-semibold ${out.has(champion) ? "text-loss line-through" : "text-ink"}`}>{teamName(byId.get(champion)!.team)}</span>
          </span>
        )}
        {editable && (
          <span role="status" aria-live="polite" className={`text-xs ${save.state === "error" ? "text-loss" : "text-muted"}`}>
            {save.state === "saving" ? "Saving…" : save.state === "error" ? save.message : save.state === "saved" ? "Saved" : ""}
          </span>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {regions.map((name, r) => (
          <button key={r} type="button" onClick={() => setView(r)} aria-pressed={view === r} className={chipClass(view === r, "", "sm")}>
            {name} <span className="opacity-70 tabular-nums">{regionPicks(r)}/15</span>
          </button>
        ))}
        <button type="button" onClick={() => setView(4)} aria-pressed={view === 4} className={chipClass(view === 4, "", "sm")}>
          Final Four <span className="opacity-70 tabular-nums">{[gameKey(5, 0), gameKey(5, 1), gameKey(6, 0)].filter((k) => picks[k]).length}/3</span>
        </button>
        {editable && (
          <span className="ml-auto flex gap-2">
            <button type="button" onClick={fillFavorites} className="text-sm font-medium text-accent">Pick favorites for the rest</button>
            {made > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Clear your whole bracket?")) update({});
                }}
                className="text-sm font-medium text-muted hover:text-loss"
              >
                Clear
              </button>
            )}
          </span>
        )}
      </div>

      {view < 4 ? (
        renderRegion(view)
      ) : (
        <div className="grid max-w-3xl gap-6 sm:grid-cols-3 sm:items-center">
          {renderGame(5, 0, `${regions[0]} vs ${regions[1]}`)}
          {renderGame(6, 0, "Championship")}
          {renderGame(5, 1, `${regions[2]} vs ${regions[3]}`)}
        </div>
      )}

      <p className="mt-4 text-xs text-muted">
        Points for each correct pick grow by round and by seed, so upsets pay more: e.g. a 12 seed winning in the First Round is +3, a 1 seed
        winning the title +12, a 13–16 seed +24. The small number beside a pick is what it&apos;s worth.
      </p>
    </div>
  );
}
