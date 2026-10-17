"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Cell, CheckIcon, LiveDot, LockIcon, SectionLabel, TeamLogo } from "@/components/ui";
import { formatInTimeZone } from "date-fns-tz";
import { dayKey, dayLabel, formatDuration, formatSpread, points as formatPoints, signedPoints, timeOnly } from "@/lib/format";
import { gameDateZone, hasStarted, isGameLocked } from "@/lib/locks";
import type { SlateGame } from "@/lib/pool";
import { savePicks, type PickInput } from "./actions";
import { PointsSheet } from "./PointsSheet";

type Side = "home" | "away";
type Draft = { side: Side | null; confidence: number | null };
/** Server-graded result for one of the player's picks (picks.result / points / bonus). */
type Graded = { result: string; points: number; bonus: number };
type Settings = {
  pickType: "straight_up" | "ats";
  picksPerSlate: number;
  tiers: { points: number; count: number }[] | null;
  /** confidence.wrong_pick = "minus_points": a wrong pick loses its value. */
  minusPoints: boolean;
  /** Largest upset bonus tier, or null when the pool has no upset bonus. */
  maxUpsetBonus: number | null;
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
  graded = {},
  settings,
  forUserId,
}: {
  slug: string;
  slate: { id: string; status: string; lockAt: string | null; firstDayLockAt: string | null };
  games: SlateGame[];
  initialPicks: PickInput[];
  graded?: Record<string, Graded>;
  settings: Settings;
  forUserId?: string;
}) {
  const [picks, setPicks] = useState<Record<string, Draft>>(() => toDrafts(initialPicks));
  const [save, setSave] = useState<{ state: "idle" | "saving" | "saved" | "error"; message?: string }>({ state: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const [sheetGameId, setSheetGameId] = useState<string | null>(null);
  const now = useNow(games, slate.lockAt);

  // A game locks at its effective lock (deadline, or tip if earlier), not its start, or
  // as soon as ESPN has it under way (a TBD game never gets a real time).
  const isLocked = useCallback(
    (g: SlateGame) =>
      slate.status !== "open" ||
      isGameLocked(g, now) ||
      (slate.lockAt !== null && new Date(slate.lockAt).getTime() <= now),
    [now, slate.status, slate.lockAt],
  );

  // ---------- derived ----------
  const gamesById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const isComplete = (d: Draft | undefined) => Boolean(d?.side && (!settings.tiers || d.confidence !== null));
  // What we send: complete picks, minus unlocked voided games (the server drops those).
  const payload = (state: Record<string, Draft>): PickInput[] =>
    Object.entries(state)
      .filter(([id, d]) => {
        const g = gamesById.get(id);
        return g && isComplete(d) && (!g.voided || isGameLocked(g, Date.now()));
      })
      .map(([game_id, d]) => ({ game_id, picked_side: d.side!, confidence: settings.tiers ? d.confidence : null }));

  const pickedCount = payload(picks).length;
  const used = new Map<number, number>();
  for (const d of Object.values(picks)) if (d.confidence !== null) used.set(d.confidence, (used.get(d.confidence) ?? 0) + 1);
  const remaining = (points: number) =>
    (settings.tiers?.filter((t) => t.points === points).reduce((n, t) => n + t.count, 0) ?? 0) - (used.get(points) ?? 0);
  const openSlots = settings.tiers ? settings.tiers.reduce((n, t) => n + Math.max(0, remaining(t.points)), 0) : settings.picksPerSlate - pickedCount;

  const nextLock = nextLockInfo(games, now, slate, settings);
  const msToNextLock = nextLock ? nextLock.at - now : null;

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
    // Side tap, value tap: go straight to the points sheet when this game still needs a value.
    if (settings.tiers && cur.confidence === null) setSheetGameId(g.id);
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

  const clearPoints = (g: SlateGame) => {
    if (isLocked(g) || g.voided) return;
    const cur = picks[g.id];
    if (cur && cur.confidence !== null) update(g.id, { ...cur, confidence: null });
  };

  const openSheet = (g: SlateGame) => {
    if (isLocked(g) || g.voided) return;
    setSheetGameId(g.id);
  };
  const closeSheet = useCallback(() => setSheetGameId(null), []);

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
    // A TBD game's placeholder is midnight Eastern: read its date there so it stays on its day.
    const zone = gameDateZone(g.timeTbd, settings.timezone);
    const key = dayKey(g.startAt, zone);
    const day = days.find((d) => d.key === key);
    if (day) day.games.push(g);
    else days.push({ key, label: dayLabel(g.startAt, zone), games: [g] });
  }

  const urgent = msToNextLock !== null && msToNextLock > 0 && msToNextLock < 3_600_000 && openSlots > 0;
  // The sheet closes itself if its game locks while it's open.
  const sheetGame = sheetGameId ? gamesById.get(sheetGameId) : undefined;
  const showSheet = settings.tiers && sheetGame && !isLocked(sheetGame) && !sheetGame.voided;

  return (
    <div>
      {/* Urgency is plain ink weight: the live token is reserved for games in progress. */}
      <p className={`mb-1 text-sm ${urgent ? "font-semibold text-ink" : "text-muted"}`}>
        {slate.status !== "open" ? (
          <span className="flex items-center gap-1.5"><LockIcon /> All picks for this week are locked.</span>
        ) : nextLock && msToNextLock !== null && msToNextLock > 0 ? (
          <>
            {nextLock.label} in{" "}
            <strong className={`font-semibold tabular-nums ${urgent ? "" : "text-ink"}`}>{formatDuration(msToNextLock)}</strong>
            {urgent && <> · {openSlots} pick{openSlots === 1 ? "" : "s"} still open</>}
          </>
        ) : settings.lockMode === "weekly" ? (
          "Every game is locked."
        ) : (
          "Every game has started."
        )}
      </p>
      <p className="mb-4 text-xs text-muted">
        {settings.pickType === "ats" ? `Lines: ${settings.bookmaker} · frozen at publish · ` : `Straight up · `}
        each game locks at {settings.lockMode === "weekly" ? "its deadline, or tip-off if earlier" : "its start"}
        {settings.tiers ? ` · ${settings.tiers.map((t) => `${t.count}×${t.points}`).join(", ")}` : ` · ${settings.picksPerSlate} picks`}
        {settings.minusPoints && " · wrong picks lose their points"}
        {settings.maxUpsetBonus !== null && ` · upset bonus up to +${settings.maxUpsetBonus}`}
      </p>

      {days.map((day) => (
        <section key={day.key} className="mb-2">
          <SectionLabel className="sticky top-[calc(5.75rem+2px+env(safe-area-inset-top))] sm:top-[calc(3rem+1px+env(safe-area-inset-top))] z-10 -mx-4 bg-bg/90 px-4 py-2 backdrop-blur">{day.label}</SectionLabel>
          <ul>
            {day.games.map((g) => (
              <GameRow
                key={g.id}
                game={g}
                draft={picks[g.id]}
                graded={graded[g.id]}
                locked={isLocked(g)}
                now={now}
                settings={settings}
                onTeam={(side) => tapTeam(g, side)}
                onPoints={() => openSheet(g)}
              />
            ))}
          </ul>
        </section>
      ))}

      {showSheet && (
        <PointsSheet
          key={sheetGame.id}
          title={`Points · ${teamName(sheetGame.away)} ${sheetGame.neutral ? "vs" : "@"} ${teamName(sheetGame.home)}`}
          tiers={settings.tiers!.map((t) => ({ points: t.points, left: Math.max(0, remaining(t.points)) }))}
          current={picks[sheetGame.id]?.confidence ?? null}
          onChoose={(p) => {
            tapChip(sheetGame, p);
            closeSheet();
          }}
          onClear={() => {
            clearPoints(sheetGame);
            closeSheet();
          }}
          onClose={closeSheet}
        />
      )}

      {/* The tracker grows by a line when a message shows; keep the last row clear of it. */}
      {(notice || save.state === "error") && <div aria-hidden className="h-12" />}

      {/* Bet-slip style tracker */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto max-w-3xl py-2.5 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
          {(notice || save.state === "error") && (
            <p className="mb-1.5 text-sm text-loss" role="alert">{save.state === "error" ? save.message : notice}</p>
          )}
          <div className="flex items-center gap-3">
            {settings.tiers ? (
              <div className="flex min-w-0 flex-1 gap-x-4 overflow-x-auto text-sm">
                {settings.tiers.map((t) => {
                  const left = Math.max(0, remaining(t.points));
                  return (
                    <span key={t.points} className="shrink-0 tabular-nums" aria-label={`${left} ${t.points}-point picks left`}>
                      <span className="text-muted">{t.points}s</span>{" "}
                      <span className={`font-semibold ${left === 0 ? "text-muted line-through" : "text-ink"}`}>{left}</span>
                    </span>
                  );
                })}
              </div>
            ) : (
              // The picked count sits on the right; the left says what's still open.
              <p className="min-w-0 flex-1 text-sm text-muted tabular-nums">
                <span className="font-semibold text-ink">{Math.max(0, openSlots)}</span> pick{openSlots === 1 ? "" : "s"} left
              </p>
            )}
            <span className="shrink-0 text-right text-[15px] font-semibold tabular-nums">
              {pickedCount}/{settings.picksPerSlate}
              <span
                role="status"
                aria-live="polite"
                className={`block text-xs font-normal ${save.state === "error" ? "text-loss" : "text-muted"}`}
              >
                {save.state === "saving" ? "Saving…" : save.state === "saved" ? "Saved" : save.state === "error" ? "Not saved" : "picked"}
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
  graded,
  locked,
  now,
  settings,
  onTeam,
  onPoints,
}: {
  game: SlateGame;
  draft: Draft | undefined;
  graded: Graded | undefined;
  locked: boolean;
  now: number;
  settings: Settings;
  onTeam: (side: Side) => void;
  onPoints: () => void;
}) {
  // A TBD game's start is ESPN's placeholder; it stays pickable past it until its deadline.
  const started = hasStarted(g, now);
  const final = g.status === "final" || g.overridden;
  const live = started && !final && g.status !== "postponed" && g.status !== "cancelled";
  const msToLock = new Date(g.effectiveLockAt).getTime() - now;
  const disabled = locked || g.voided;
  const confidence = Boolean(settings.tiers);

  // Prefer what grade_slate scored (it knows the upset bonus); until then, estimate from
  // the final score and the frozen spread.
  let result: "win" | "loss" | null = null;
  let base: number | null = null;
  let bonus = 0;
  if (graded && draft?.side) {
    if (graded.result === "win" || graded.result === "loss") {
      result = graded.result;
      bonus = graded.bonus;
      base = graded.points - graded.bonus;
    }
  } else if (final && draft?.side && g.homeScore !== null && g.awayScore !== null && !g.voided) {
    const margin = g.homeScore - g.awayScore + (settings.pickType === "ats" ? (g.spread ?? 0) : 0);
    if (margin !== 0) result = (margin > 0) === (draft.side === "home") ? "win" : "loss";
    const value = draft.confidence ?? 0;
    base = result === "win" ? value : settings.minusPoints ? -value : 0;
  }

  const pickHeader = settings.pickType === "ats" ? "Spread" : confidence ? "Pick" : "Winner";
  const conf = conferenceLabel(g.away.conference, g.home.conference);
  // Neutral site: the away team is listed first and the city stands in for "Home".
  const meta = [conf, g.neutral ? (g.venue ?? "Neutral site") : null].filter(Boolean).join(" · ");

  // A half-made pick doesn't count, so its warning shows alongside the countdown, not instead of it.
  let footerRight: ReactNode = null;
  if (result) {
    footerRight = (
      <span className="tabular-nums">
        <span className={`font-semibold ${result === "win" ? "text-win" : "text-loss"}`}>
          {confidence ? signedPoints(base) : result === "win" ? "Win" : "Loss"}
        </span>
        {bonus > 0 && <span className="font-semibold text-accent"> · +{formatPoints(bonus)} upset</span>}
      </span>
    );
  } else {
    const missing =
      disabled || !confidence || !draft ? null : draft.confidence != null && !draft.side ? "Pick a team" : draft.side && draft.confidence === null ? "Pick a value" : null;
    const countdown = !disabled && msToLock < 3 * 3_600_000;
    if (missing || countdown) {
      footerRight = (
        <span className="tabular-nums">
          {missing && <span className="font-semibold text-accent">{missing}</span>}
          {missing && countdown && " · "}
          {countdown && <span className={msToLock < 15 * 60_000 ? "font-semibold text-live" : ""}>Locks in {formatDuration(msToLock)}</span>}
        </span>
      );
    }
  }

  return (
    <li
      className={`grid gap-x-2 gap-y-1.5 border-b border-line py-3 ${
        confidence ? "grid-cols-[minmax(0,1fr)_auto_4.5rem_4rem]" : "grid-cols-[minmax(0,1fr)_auto_4.5rem]"
      } ${g.voided ? "opacity-50" : ""}`}
    >
      {/* Status line + column headers */}
      <div className="col-span-2 flex min-w-0 items-center gap-1.5 text-xs font-semibold text-muted">
        {g.voided ? (
          <span className="text-loss">Void</span>
        ) : final ? (
          <span>Final</span>
        ) : live ? (
          <LiveDot>Live</LiveDot>
        ) : g.status === "postponed" || g.status === "cancelled" ? (
          <span>{g.status === "postponed" ? "Postponed" : "Cancelled"}</span>
        ) : (
          <span className={`tabular-nums ${g.timeTbd ? "text-ink" : ""}`}>{g.timeTbd ? "TBD" : timeOnly(g.startAt, settings.timezone)}</span>
        )}
        {/* Where to watch stays visible through the whole game. */}
        {g.tv && <span className="truncate font-normal">· {g.tv}</span>}
        {locked && <LockIcon className="size-3 shrink-0 text-muted" />}
      </div>
      <span className="self-end text-center text-xs text-muted">{pickHeader}</span>
      {confidence && <span className="self-end text-center text-xs text-muted">Pts</span>}

      {/* Team rows: the whole row (name, score and pick cell) is one button per side */}
      {(["away", "home"] as const).map((side, i) => {
        const team = side === "home" ? g.home : g.away;
        const rank = side === "home" ? g.homeRank : g.awayRank;
        const score = side === "home" ? g.homeScore : g.awayScore;
        const selected = draft?.side === side;
        const spread = g.spread === null ? null : side === "home" ? g.spread : -g.spread;
        const sub = [rank ? `#${rank}` : null, team.conference, side === "home" && !g.neutral ? "Home" : null].filter(Boolean).join(" · ");
        return (
          <button
            key={side}
            type="button"
            disabled={disabled}
            onClick={() => onTeam(side)}
            aria-pressed={selected}
            className={`group col-span-3 grid grid-cols-subgrid items-center rounded-[10px] text-left outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed ${
              i === 0 ? "row-start-2" : "row-start-3"
            }`}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <TeamLogo src={team.logo_url} abbr={team.abbreviation} className="size-8" />
              <span className="min-w-0">
                <span className={`block truncate text-[15px] font-semibold leading-tight ${g.voided ? "text-muted" : "text-ink"}`}>
                  {team.short_name ?? team.name}
                </span>
                {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
              </span>
            </span>
            <span className="min-w-6 text-right text-[15px] font-semibold tabular-nums">{started && score !== null ? score : ""}</span>
            <Cell
              value={
                settings.pickType === "ats" ? (
                  formatSpread(spread)
                ) : selected ? (
                  <CheckIcon className="size-5" />
                ) : (
                  <span className="block size-4 rounded-full border-2 border-faint" />
                )
              }
              selected={selected}
              disabled={disabled}
              className={!disabled && !selected ? "group-hover:bg-hover group-active:scale-[0.98]" : ""}
            />
          </button>
        );
      })}

      {/* One points cell spanning both team rows */}
      {confidence && (
        <Cell
          className="col-start-4 row-span-2 row-start-2 h-full"
          value={
            draft?.confidence != null ? (
              draft.confidence
            ) : draft?.side && !disabled ? (
              <span className="font-semibold text-accent">Set</span>
            ) : (
              <span className="text-muted">—</span>
            )
          }
          selected={draft?.confidence != null}
          disabled={disabled}
          onClick={onPoints}
          label={draft?.confidence != null ? `${draft.confidence} points, change` : draft?.side ? "Points needed, set points" : "Set points"}
        />
      )}

      {(meta || footerRight) && (
        <div className="col-span-full flex items-center justify-between gap-3 text-xs text-muted">
          <span className="truncate">{meta}</span>
          {footerRight}
        </div>
      )}
    </li>
  );
}

function teamName(team: SlateGame["home"]) {
  return team.short_name ?? team.name;
}

/** "SEC game" for an in-conference matchup, "Nonconference" across conferences. */
function conferenceLabel(away: string | null, home: string | null) {
  if (!away || !home) return null;
  return away === home ? `${away} game` : "Nonconference";
}

function toDrafts(picks: PickInput[]): Record<string, Draft> {
  return Object.fromEntries(picks.map((p) => [p.game_id, { side: p.picked_side, confidence: p.confidence }]));
}

/**
 * The next time any open game locks, with what it covers. Per-game mode: "Next game locks".
 * Weekly mode: the main deadline is "Picks lock"; the first-day group (lock_at earlier than
 * the slate's) is "Monday picks lock"; a lone game tipping before its deadline is "Next game locks".
 */
function nextLockInfo(
  games: SlateGame[],
  now: number,
  slate: { lockAt: string | null; firstDayLockAt: string | null },
  settings: Settings,
): { at: number; label: string } | null {
  const open = games.filter((g) => !g.voided && !isGameLocked(g, now));
  if (!open.length) return null;
  const at = Math.min(...open.map((g) => new Date(g.effectiveLockAt).getTime()));
  if (settings.lockMode !== "weekly") return { at, label: "Next game locks" };

  const locking = open.filter((g) => new Date(g.effectiveLockAt).getTime() === at);
  // Deadline-driven: some game locking now has this as its deadline (not just its tip).
  const byDeadline = locking.filter((g) => g.lockAt !== null && new Date(g.lockAt).getTime() === at);
  if (!byDeadline.length) return { at, label: "Next game locks" };
  const main = slate.lockAt !== null && new Date(slate.lockAt).getTime() === at;
  if (main || !slate.firstDayLockAt) return { at, label: "Picks lock" };
  const g = byDeadline[0];
  return { at, label: `${formatInTimeZone(g.startAt, gameDateZone(g.timeTbd, settings.timezone), "EEEE")} picks lock` };
}

/**
 * Current time, re-rendering every 15s and exactly when the next game locks or starts (or
 * the weekly deadline passes), so rows lock and go live without a reload. The server
 * re-checks with its own clock.
 */
function useNow(games: SlateGame[], lockAt: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // A TBD placeholder isn't a tip, so it's not a boundary.
    const boundaries = [...games.flatMap((g) => (g.timeTbd ? [g.effectiveLockAt] : [g.effectiveLockAt, g.startAt])), ...(lockAt ? [lockAt] : [])]
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
