"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, LockIcon, TeamLogo } from "@/components/ui";
import { dayKey, dayLabel, formatDuration, formatSpread, timeOnly } from "@/lib/format";
import type { SlateGame } from "@/lib/pool";
import { savePicks, type PickInput } from "./actions";

type Side = "home" | "away";
type Draft = { side: Side | null; confidence: number | null };
type Settings = {
  pickType: "straight_up" | "ats";
  picksPerSlate: number;
  tiers: { points: number; count: number }[] | null;
  timezone: string;
  bookmaker: string;
  lockMode: "per_game" | "weekly";
};

const SAVE_DEBOUNCE_MS = 400;

export function PickBoard({
  slug,
  slate,
  games,
  initialPicks,
  settings,
  forUserId,
}: {
  slug: string;
  slate: { id: string; status: string; lockAt: string | null };
  games: SlateGame[];
  initialPicks: PickInput[];
  settings: Settings;
  forUserId?: string;
}) {
  const [picks, setPicks] = useState<Record<string, Draft>>(() => toDrafts(initialPicks));
  const [save, setSave] = useState<{ state: "idle" | "saving" | "saved" | "error"; message?: string }>({ state: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const now = useNow(games, slate.lockAt);

  const isLocked = useCallback(
    (g: SlateGame) =>
      slate.status !== "open" ||
      new Date(g.startAt).getTime() <= now ||
      (slate.lockAt !== null && new Date(slate.lockAt).getTime() <= now),
    [now, slate.status, slate.lockAt],
  );

  // ---------- derived ----------
  const gamesById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const isComplete = (d: Draft | undefined) => Boolean(d?.side && (!settings.tiers || d.confidence !== null));
  // What we send: complete picks, minus unstarted voided games (the server drops those).
  const payload = (state: Record<string, Draft>): PickInput[] =>
    Object.entries(state)
      .filter(([id, d]) => {
        const g = gamesById.get(id);
        return g && isComplete(d) && (!g.voided || new Date(g.startAt).getTime() <= Date.now());
      })
      .map(([game_id, d]) => ({ game_id, picked_side: d.side!, confidence: settings.tiers ? d.confidence : null }));

  const pickedCount = payload(picks).length;
  const used = new Map<number, number>();
  for (const d of Object.values(picks)) if (d.confidence !== null) used.set(d.confidence, (used.get(d.confidence) ?? 0) + 1);
  const remaining = (points: number) =>
    (settings.tiers?.filter((t) => t.points === points).reduce((n, t) => n + t.count, 0) ?? 0) - (used.get(points) ?? 0);
  const openSlots = settings.tiers ? settings.tiers.reduce((n, t) => n + Math.max(0, remaining(t.points)), 0) : settings.picksPerSlate - pickedCount;

  const nextLock = games.find((g) => !g.voided && new Date(g.startAt).getTime() > now);
  const msToNextLock = slate.lockAt ? new Date(slate.lockAt).getTime() - now : nextLock ? new Date(nextLock.startAt).getTime() - now : null;

  // ---------- saving ----------
  const latest = useRef(picks);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const queued = useRef(false);

  // One save at a time; changes made while a save is in flight trigger one more round.
  const flush = async () => {
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    inFlight.current = true;
    do {
      queued.current = false;
      setSave({ state: "saving" });
      const result = await savePicks(slug, slate.id, payload(latest.current), forUserId);
      if (result.ok) {
        setSave({ state: "saved" });
      } else {
        // Resync to what the database actually has, keeping half-made picks on unlocked games.
        const server = toDrafts(result.picks);
        const merged = { ...server };
        for (const [id, d] of Object.entries(latest.current)) {
          if (!isComplete(d) && !server[id]) merged[id] = d;
        }
        latest.current = merged;
        setPicks(merged);
        setSave({ state: "error", message: result.error });
      }
    } while (queued.current);
    inFlight.current = false;
  };

  const update = (gameId: string, next: Draft) => {
    const state = { ...latest.current };
    if (!next.side && next.confidence === null) delete state[gameId];
    else state[gameId] = next;
    latest.current = state;
    setPicks(state);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void flush();
    }, SAVE_DEBOUNCE_MS);
  };

  const tapTeam = (g: SlateGame, side: Side) => {
    if (isLocked(g) || g.voided) return;
    const cur = picks[g.id] ?? { side: null, confidence: null };
    if (cur.side === side) return update(g.id, { ...cur, side: null });
    if (!settings.tiers && !cur.side && pickedCount >= settings.picksPerSlate) {
      setNotice(`You've used all ${settings.picksPerSlate} picks. Clear one to pick this game.`);
      return;
    }
    setNotice(null);
    update(g.id, { ...cur, side });
  };

  const tapChip = (g: SlateGame, points: number) => {
    if (isLocked(g) || g.voided) return;
    const cur = picks[g.id] ?? { side: null, confidence: null };
    if (cur.confidence === points) return update(g.id, { ...cur, confidence: null });
    if (remaining(points) <= 0) {
      setNotice(`No ${points}s left. Free one up from another game first.`);
      return;
    }
    setNotice(null);
    update(g.id, { ...cur, confidence: points });
  };

  // Warn before leaving with an unsaved change.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (timer.current || inFlight.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // ---------- render ----------
  const days: { key: string; label: string; games: SlateGame[] }[] = [];
  for (const g of games) {
    const key = dayKey(g.startAt, settings.timezone);
    const last = days[days.length - 1];
    if (last?.key === key) last.games.push(g);
    else days.push({ key, label: dayLabel(g.startAt, settings.timezone), games: [g] });
  }

  const urgent = msToNextLock !== null && msToNextLock > 0 && msToNextLock < 3_600_000 && openSlots > 0;

  return (
    <div>
      <div className={`mb-3 rounded-lg px-3 py-2 text-sm ${urgent ? "bg-live/15 text-live" : "bg-raised"}`}>
        {slate.status !== "open" ? (
          <span className="flex items-center gap-1.5"><LockIcon /> All picks for this week are locked.</span>
        ) : msToNextLock !== null && msToNextLock > 0 ? (
          <>
            {settings.lockMode === "weekly" ? "Picks lock" : "Next game locks"} in{" "}
            <strong className="tabular-nums">{formatDuration(msToNextLock)}</strong>
            {urgent && <> · {openSlots} pick{openSlots === 1 ? "" : "s"} still open</>}
          </>
        ) : (
          "Every game has started."
        )}
      </div>
      <p className="mb-4 text-xs text-muted">
        {settings.pickType === "ats" ? `Lines: ${settings.bookmaker} · frozen at publish · ` : `Straight up · `}
        each game locks at {settings.lockMode === "weekly" ? "the weekly deadline" : "its start"}
        {settings.tiers ? ` · ${settings.tiers.map((t) => `${t.count}×${t.points}`).join(", ")}` : ` · ${settings.picksPerSlate} picks`}
      </p>

      {days.map((day) => (
        <section key={day.key} className="mb-4">
          <h2 className="sticky top-12 z-10 -mx-4 bg-bg/95 px-4 py-1.5 font-display text-sm font-semibold uppercase tracking-wider text-muted backdrop-blur">
            {day.label}
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {day.games.map((g) => (
              <GameRow
                key={g.id}
                game={g}
                draft={picks[g.id]}
                locked={isLocked(g)}
                now={now}
                settings={settings}
                remaining={remaining}
                onTeam={(side) => tapTeam(g, side)}
                onChip={(p) => tapChip(g, p)}
              />
            ))}
          </ul>
        </section>
      ))}

      {/* Bet-slip style tracker, above the phone tab bar */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-border bg-surface/95 backdrop-blur sm:bottom-0 sm:pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-3xl px-4 py-2">
          {(notice || save.state === "error") && (
            <p className="mb-1.5 text-sm text-loss" role="alert">{save.state === "error" ? save.message : notice}</p>
          )}
          <div className="flex items-center gap-2">
            {settings.tiers ? (
              <div className="flex flex-1 gap-1.5 overflow-x-auto">
                {settings.tiers.map((t) => {
                  const left = remaining(t.points);
                  return (
                    <span
                      key={t.points}
                      className={`flex shrink-0 items-baseline gap-1 rounded-full px-2.5 py-1 font-display text-sm font-semibold ${left === 0 ? "bg-raised text-muted" : "bg-brass/20"}`}
                    >
                      <span className="text-base">{t.points}s</span>
                      <span className="tabular-nums text-muted">{left === 0 ? "done" : `${left} left`}</span>
                    </span>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-1 gap-1.5">
                {Array.from({ length: settings.picksPerSlate }, (_, i) => (
                  <span key={i} className={`h-2 flex-1 rounded-full ${i < pickedCount ? "bg-brass" : "bg-raised"}`} />
                ))}
              </div>
            )}
            <span className="shrink-0 text-right font-display text-sm font-semibold tabular-nums">
              {pickedCount}/{settings.picksPerSlate}
              <span className="block text-xs font-normal text-muted">
                {save.state === "saving" ? "Saving…" : save.state === "saved" ? "Saved ✓" : save.state === "error" ? "Not saved" : "picked"}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function GameRow({
  game: g,
  draft,
  locked,
  now,
  settings,
  remaining,
  onTeam,
  onChip,
}: {
  game: SlateGame;
  draft: Draft | undefined;
  locked: boolean;
  now: number;
  settings: Settings;
  remaining: (points: number) => number;
  onTeam: (side: Side) => void;
  onChip: (points: number) => void;
}) {
  const started = new Date(g.startAt).getTime() <= now;
  const final = g.status === "final" || g.overridden;
  const live = started && !final && g.status !== "postponed" && g.status !== "cancelled";
  const msToStart = new Date(g.startAt).getTime() - now;
  const disabled = locked || g.voided;

  let result: "win" | "loss" | null = null;
  if (final && draft?.side && g.homeScore !== null && g.awayScore !== null && !g.voided) {
    const margin = g.homeScore - g.awayScore + (settings.pickType === "ats" ? (g.spread ?? 0) : 0);
    if (margin !== 0) result = (margin > 0) === (draft.side === "home") ? "win" : "loss";
  }

  return (
    <li className={`px-3 py-2.5 ${result === "win" ? "bg-win/5" : result === "loss" ? "bg-loss/5" : ""}`}>
      <div className="mb-1.5 flex items-center gap-2 text-xs text-muted">
        <span className="font-semibold tabular-nums text-ink">
          {g.timeTbd ? "TBD" : timeOnly(g.startAt, settings.timezone)}
        </span>
        {g.tv && <span>{g.tv}</span>}
        {g.neutral && <span>Neutral</span>}
        <span className="ml-auto flex items-center gap-1">
          {g.voided ? (
            <span className="font-semibold uppercase text-loss">Void</span>
          ) : final ? (
            <span className="font-semibold uppercase">Final</span>
          ) : live ? (
            <span className="flex items-center gap-1 font-semibold uppercase text-live">
              <span className="size-1.5 animate-pulse rounded-full bg-live" /> Live
            </span>
          ) : !locked && msToStart < 3 * 3_600_000 ? (
            <span className={`tabular-nums ${msToStart < 15 * 60_000 ? "font-semibold text-live" : ""}`}>
              locks in {formatDuration(msToStart)}
            </span>
          ) : null}
          {locked && <LockIcon className="size-3.5" />}
        </span>
      </div>

      <div className="space-y-1">
        {(["away", "home"] as const).map((side) => {
          const team = side === "home" ? g.home : g.away;
          const rank = side === "home" ? g.homeRank : g.awayRank;
          const score = side === "home" ? g.homeScore : g.awayScore;
          const selected = draft?.side === side;
          const spread = g.spread === null ? null : side === "home" ? g.spread : -g.spread;
          return (
            <button
              key={side}
              type="button"
              disabled={disabled}
              onClick={() => onTeam(side)}
              aria-pressed={selected}
              className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left transition ${
                selected ? "bg-brass text-[#1b1f1d] ring-2 ring-brass" : "hover:bg-raised"
              } ${disabled && !selected ? "opacity-60" : ""} disabled:cursor-not-allowed`}
            >
              <TeamLogo src={team.logo_url} abbr={team.abbreviation} />
              <span className="min-w-0 flex-1 truncate font-display text-lg font-semibold leading-tight">
                {rank && <span className={`mr-1 text-xs font-medium ${selected ? "" : "text-muted"}`}>{rank}</span>}
                {team.short_name ?? team.name}
                {side === "home" && !g.neutral && <span className={`ml-1 text-xs font-normal ${selected ? "" : "text-muted"}`}>home</span>}
              </span>
              {settings.pickType === "ats" && (
                <span className={`rounded-md px-2 py-0.5 font-display text-base font-bold tabular-nums ${selected ? "bg-black/10" : "bg-raised"}`}>
                  {formatSpread(spread)}
                </span>
              )}
              {started && score !== null && <span className="w-8 text-right font-display text-lg font-bold tabular-nums">{score}</span>}
              {selected && <CheckIcon className="size-5 shrink-0" />}
            </button>
          );
        })}
      </div>

      {settings.tiers && (
        <div className="mt-2 flex items-center gap-1.5 pl-2">
          {settings.tiers.map((t) => {
            const selected = draft?.confidence === t.points;
            const spent = !selected && remaining(t.points) <= 0;
            return (
              <button
                key={t.points}
                type="button"
                disabled={disabled}
                onClick={() => onChip(t.points)}
                aria-pressed={selected}
                aria-label={`${t.points} points`}
                className={`grid size-10 place-items-center rounded-full font-display text-lg font-bold tabular-nums transition ${
                  selected
                    ? "bg-brass text-[#1b1f1d] ring-2 ring-brass ring-offset-2 ring-offset-surface"
                    : spent
                      ? "border border-dashed border-border text-muted/50"
                      : "border border-border hover:border-brass"
                } ${disabled && !selected ? "opacity-50" : ""}`}
              >
                {t.points}
              </button>
            );
          })}
          {draft?.side && draft.confidence === null && !disabled && (
            <span className="ml-1 text-xs text-live">pick a value</span>
          )}
          {!draft?.side && draft?.confidence != null && !disabled && <span className="ml-1 text-xs text-live">pick a team</span>}
          {result && (
            <span className={`ml-auto font-display text-sm font-bold uppercase ${result === "win" ? "text-win" : "text-loss"}`}>
              {result === "win" ? `+${draft?.confidence ?? 0}` : "0"}
            </span>
          )}
        </div>
      )}
      {!settings.tiers && result && (
        <p className={`mt-1 pl-2 font-display text-sm font-bold uppercase ${result === "win" ? "text-win" : "text-loss"}`}>{result}</p>
      )}
    </li>
  );
}

function toDrafts(picks: PickInput[]): Record<string, Draft> {
  return Object.fromEntries(picks.map((p) => [p.game_id, { side: p.picked_side, confidence: p.confidence }]));
}

/**
 * Current time, re-rendering every 15s and exactly when the next game (or the weekly
 * deadline) starts, so rows lock without a reload. The server re-checks with its own clock.
 */
function useNow(games: SlateGame[], lockAt: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const boundaries = [...games.map((g) => g.startAt), ...(lockAt ? [lockAt] : [])]
      .map((t) => new Date(t).getTime())
      .filter((t) => t > now);
    const next = Math.min(...boundaries);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    const exact = Number.isFinite(next) ? setTimeout(() => setNow(Date.now()), next - now + 50) : undefined;
    return () => {
      clearInterval(tick);
      if (exact) clearTimeout(exact);
    };
  }, [games, lockAt, now]);
  return now;
}
