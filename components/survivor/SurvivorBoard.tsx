"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { GameRow, useNow, type BoardSettings } from "@/app/p/[slug]/picks/PickBoard";
import { PickSummaryRow } from "@/components/PickSummaryRow";
import { TeamHistoryDialog } from "@/components/ProfileDialogs";
import { useLiveGames } from "@/components/useLiveGames";
import { CheckIcon, ChevronIcon, LockIcon, chipClass } from "@/components/ui";
import { dayKey, dayLabel, formatSpread } from "@/lib/format";
import { EliminatedCard, WeekPickCard } from "./WeekPickCard";
import { hasStarted } from "@/lib/locks";
import type { SlateGame } from "@/lib/pool";

type Side = "home" | "away";
export type SplitState = {
  /** Entries still alive, and how many of them have asked to split. */
  alive: number;
  asked: number;
  /** This entry has asked. */
  mine: boolean;
  /** Everyone left agreed: the pool is over. */
  done: boolean;
  /** "$1,180 each" once split (or what each would get), omitted without an entry fee. */
  each?: string | null;
  toggle?: (on: boolean) => Promise<{ error?: string }>;
};
export type SvPrior = { week: number; label: string; href: string; game: SlateGame | null; side: Side | null; result: "win" | "loss" | "pending" | "void" | "missed" };

const teamName = (t: SlateGame["home"]) => t.short_name ?? t.name;

/**
 * Survivor's My Picks, laid out like every other pool's: the season's picks in the left column,
 * this week's pick across the top, and the week's games on the right in the same cards (tap a
 * team to pick it, its name for recent results, Box Score once it starts). One pick a week,
 * saved the moment it's tapped; teams already used can't be picked.
 */
export function SurvivorBoard({
  slug,
  weekLabel,
  games: serverGames,
  initialPick,
  used,
  canPick,
  behalf,
  records,
  spreads,
  timezone,
  prior,
  status,
  backHref,
  historyHref,
  save,
  clear,
  outWeek = null,
  outPick = null,
  fixedNow,
  split = null,
}: {
  slug: string;
  weekLabel: string;
  games: SlateGame[];
  initialPick: { gameId: string; teamId: string } | null;
  /** Team id → "Wk 3": teams this entry has already used (can't be picked again). */
  used: Record<string, string>;
  /** Picking is open for this entry this week (alive, not a guest, games left). */
  canPick: boolean;
  /** The commissioner picking for someone: started games can be chosen too. */
  behalf: boolean;
  records: Record<string, string>;
  /** Game id → the home team's spread. */
  spreads: Record<string, number>;
  timezone: string;
  prior: SvPrior[];
  /** "Alive", "2 of 3 lives left", "Eliminated · Week 6". */
  status: { text: string; alive: boolean };
  /** Where the game pop-up goes back to. */
  backHref: string;
  historyHref?: string;
  save: (gameId: string, teamId: string) => Promise<{ error?: string }>;
  /** The week this entry was eliminated (null while alive): the pick card says so. */
  outWeek?: number | null;
  /** The pick that eliminated this entry (null: out on a missed week). */
  outPick?: { game: SlateGame; side: Side } | null;
  /** Removes this week's pick (tapping the picked team again). */
  clear: () => Promise<{ error?: string }>;
  /** A demo pool shown as of an earlier moment: that moment, instead of the clock. */
  fixedNow?: number;
  /** Request to Split: shown while this entry is alive with others left, or once the pot is split. */
  split?: SplitState | null;
}) {
  const router = useRouter();
  const clock = useNow(serverGames, null);
  const now = fixedNow ?? clock;
  const games = useLiveGames(serverGames, now, "nfl");
  const [pick, setPick] = useState(initialPick);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [history, setHistory] = useState<SlateGame["home"] | null>(null);

  const pickGame = pick ? games.find((g) => g.id === pick.gameId) : undefined;
  const pickSide: Side | null = pickGame && pick ? (pick.teamId === pickGame.home.id ? "home" : "away") : null;
  const pickLocked = Boolean(pickGame && hasStarted(pickGame, now)) && !behalf;
  const pickTeam = pickGame && pickSide ? pickGame[pickSide] : null;
  const pickStarted = Boolean(pickGame && hasStarted(pickGame, now));

  const settings: BoardSettings = {
    pickType: "straight_up",
    picksPerSlate: 1,
    tiers: null,
    minusPoints: false,
    maxUpsetBonus: null,
    timezone,
    poolTimezone: timezone,
    bookmaker: "",
    lockMode: "per_game",
    fullCard: false,
  };

  // Tap a team to pick it; tap the picked team again (before it locks) to take the pick back.
  const choose = (g: SlateGame, side: Side) => {
    const team = g[side];
    if (pending) return;
    const before = pick;
    const removing = pick?.teamId === team.id;
    if (removing && pickLocked) return;
    setPick(removing ? null : { gameId: g.id, teamId: team.id });
    setError(null);
    start(async () => {
      const r = await (removing ? clear() : save(g.id, team.id)).catch(() => ({ error: "That didn't save. Try again." }));
      if (r.error) {
        setPick(before);
        setError(r.error);
      } else router.refresh();
    });
  };

  const days = useMemo(() => {
    const out: { key: string; label: string; games: SlateGame[] }[] = [];
    for (const g of games.filter((x) => !x.voided)) {
      const key = dayKey(g.startAt, timezone);
      const day = out.find((d) => d.key === key);
      if (day) day.games.push(g);
      else out.push({ key, label: dayLabel(g.startAt, timezone), games: [g] });
    }
    return out;
  }, [games, timezone]);

  const spreadLabel = (g: SlateGame) => {
    const sp = spreads[g.id];
    if (sp === undefined) return null;
    if (sp === 0) return "Pick 'em";
    const fav = sp < 0 ? g.home : g.away;
    return `${fav.abbreviation ?? teamName(fav)} ${formatSpread(-Math.abs(sp))}`;
  };

  return (
    <div data-wide className="lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-6 min-[1600px]:grid-cols-[22rem_minmax(0,1fr)] min-[1600px]:gap-10">
      {/* This week's pick, across the top (the same card as on Home); once out, the pick that did it. */}
      {outWeek ? (
        <EliminatedCard week={outWeek} game={outPick?.game ?? null} side={outPick?.side ?? null} className="mb-5 max-w-2xl lg:col-span-2" />
      ) : (
      <WeekPickCard
        weekLabel={weekLabel}
        game={pickGame ?? null}
        side={pickSide}
        started={pickStarted}
        locked={pickLocked}
        timezone={timezone}
        empty={canPick ? "No pick yet" : "No pick"}
        className="mb-5 max-w-2xl lg:col-span-2"
      />
      )}


      {/* The season so far, pinned in the left column on desktop; above the games on phones. */}
      <aside className="lg:self-stretch">
        <div className="lg:sticky lg:top-[calc(3rem+3px+1rem+env(safe-area-inset-top))]">
          <section className="mb-5 lg:mb-0" aria-labelledby="my-picks">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <h2 id="my-picks" className="text-lg font-extrabold tracking-[-0.03em]">{behalf ? "Their picks" : "My Picks"}</h2>
              <span className={`text-xs font-semibold tabular-nums ${status.alive ? "text-win" : "text-muted"}`}>{status.text}</span>
            </div>
            {prior.length === 0 ? (
              <p className="border-y border-line py-3 text-sm text-muted">Each week&apos;s pick shows up here.</p>
            ) : (
              <ul className="divide-y divide-line border-y border-line">
                {prior.map((p) =>
                  p.game && p.side ? (
                    <li key={p.week} className="flex items-center gap-2">
                      <span className="w-9 shrink-0 text-xs font-medium tabular-nums text-muted">Wk {p.week}</span>
                      <ul className="min-w-0 flex-1">
                        <PickSummaryRow
                          game={p.game}
                          side={p.side}
                          confidence={null}
                          result={p.result === "win" || p.result === "loss" ? p.result : null}
                          locked={false}
                          now={now}
                          pickType="straight_up"
                          timezone={timezone}
                          dense
                        />
                      </ul>
                    </li>
                  ) : (
                    <li key={p.week} className="flex min-h-9 items-center gap-2 py-1 text-sm">
                      <span className="w-9 shrink-0 text-xs font-medium tabular-nums text-muted">Wk {p.week}</span>
                      <span className="flex-1 text-muted">No pick</span>
                      <span className="text-xs font-semibold text-loss">Loss</span>
                    </li>
                  ),
                )}
              </ul>
            )}
          </section>
          {historyHref && (
            <Link href={historyHref} className={chipClass(false, "-mt-2 mb-5 lg:mt-3 lg:mb-1 lg:self-start", "sm")}>
              View League Grid <ChevronIcon className="size-3.5" />
            </Link>
          )}
        </div>
      </aside>

      <div className="min-w-0">
        {split && <SplitBar split={split} />}
        {days.map((day) => (
          <section key={day.key} className="mb-5 lg:mb-4">
            <h3 className="sticky top-[calc(5.75rem+4px+env(safe-area-inset-top))] sm:top-[calc(3rem+3px+env(safe-area-inset-top))] z-10 -mx-4 flex items-baseline gap-2 border-l-4 border-accent bg-surface px-3 py-2 text-base font-bold text-ink lg:mx-0 lg:mb-1 lg:rounded-r-md lg:py-1.5 lg:text-sm">
              <span>{day.label}</span>
            </h3>
            <ul className="lg:grid lg:grid-cols-[repeat(auto-fill,minmax(18.5rem,1fr))] lg:gap-x-5 min-[1600px]:grid-cols-4 min-[2000px]:grid-cols-5">
              {day.games.map((g) => {
                const started = hasStarted(g, now);
                const editable = canPick && !pickLocked && (behalf || !started);
                const usedNote = (side: Side) => (used[g[side].id] && pick?.teamId !== g[side].id ? `Used · ${used[g[side].id]}` : null);
                const side = pick?.gameId === g.id ? pickSide : null;
                return (
                  <GameRow
                    key={g.id}
                    game={g}
                    draft={side ? { side, confidence: null } : undefined}
                    graded={undefined}
                    locked={started && !behalf}
                    editable={editable}
                    edited={false}
                    now={now}
                    settings={settings}
                    onTeam={(s) => choose(g, s)}
                    onHistory={(s) => setHistory(s === "home" ? g.home : g.away)}
                    records={records}
                    onPoints={() => undefined}
                    gameHref={`/p/${slug}/game/${g.id}?back=${encodeURIComponent(backHref)}`}
                    sideDisabled={{ home: Boolean(usedNote("home")), away: Boolean(usedNote("away")) }}
                    sideNote={{ home: usedNote("home"), away: usedNote("away") }}
                    extraMeta={spreadLabel(g)}
                  />
                );
              })}
            </ul>
          </section>
        ))}
        {error && <div aria-hidden className="h-12" />}
      </div>

      {history?.espn_id && (
        <TeamHistoryDialog sport="nfl" espnId={history.espn_id} name={teamName(history)} logo={history.logo_url} ats={false} timezone={timezone} onClose={() => setHistory(null)} />
      )}

      {/* The tracker, as on every pool's My Picks: what's picked and whether it saved. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto max-w-5xl py-2.5 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] lg:max-w-none">
          {error && <p className="mb-1.5 text-sm text-loss" role="alert">{error}</p>}
          <div className="flex items-center gap-3">
            <p className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-muted">
              {(pickLocked || !canPick) && <LockIcon className="size-3.5 shrink-0" />}
              {pickTeam ? (
                <span className="truncate">
                  {weekLabel}: <span className="font-semibold text-ink">{teamName(pickTeam)}</span>
                </span>
              ) : (
                <span className="truncate">{canPick ? "Tap a team to make your pick" : `No pick in ${weekLabel}`}</span>
              )}
            </p>
            <span className="shrink-0 text-right text-[15px] font-semibold tabular-nums">
              {pickTeam ? 1 : 0}/1
              <span role="status" aria-live="polite" className={`flex items-center justify-end gap-1 text-xs font-normal ${error ? "text-loss" : "text-muted"}`}>
                {pending ? "Saving…" : error ? "Not saved" : pickTeam ? (<><CheckIcon className="size-3.5 text-win" /> Saved</>) : "picked"}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Request to Split, on the right above the games: every entry still alive can ask to end the
 * pool and share the pot. When the last one asks, the pool is over (they confirm first).
 */
function SplitBar({ split }: { split: SplitState }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = !split.mine && split.asked === split.alive - 1;

  const send = (on: boolean) => {
    setConfirming(false);
    setError(null);
    start(async () => {
      const r = await (split.toggle ? split.toggle(on) : Promise.resolve<{ error?: string }>({})).catch(() => ({ error: "That didn't save. Try again." }));
      if (r.error) setError(r.error);
      else router.refresh();
    });
  };

  if (split.done) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm" role="status">
        <span className="font-semibold text-win">Pot split · the pool is over</span>
        <span className="text-muted">
          All {split.alive} remaining entries agreed{split.each ? <> · <span className="font-semibold text-ink">{split.each}</span></> : null}
        </span>
      </div>
    );
  }

  const btn =
    "inline-flex h-9 items-center justify-center rounded-lg px-3.5 text-sm font-semibold whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";
  return (
    <div className="mb-4 flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
        <span className="text-sm text-muted tabular-nums">
          <span className="font-semibold text-ink">{split.asked}</span> of {split.alive} remaining want to split
          {split.each ? <> · {split.each}</> : null}
        </span>
        {confirming ? (
          <span className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink">You&apos;re the last one. End the pool and split the pot?</span>
            <button type="button" className={`${btn} bg-accent text-white hover:brightness-110`} disabled={pending} onClick={() => send(true)}>
              Split now
            </button>
            <button type="button" className={`${btn} border border-line text-ink hover:bg-surface`} disabled={pending} onClick={() => setConfirming(false)}>
              Not yet
            </button>
          </span>
        ) : split.mine ? (
          <button type="button" className={`${btn} border border-line text-ink hover:bg-surface`} disabled={pending} onClick={() => send(false)}>
            {pending ? "Saving…" : (<><CheckIcon className="mr-1 size-3.5 text-win" /> Requested · Cancel</>)}
          </button>
        ) : (
          <button
            type="button"
            className={`${btn} bg-accent text-white shadow-sm hover:brightness-110 active:brightness-95`}
            disabled={pending}
            onClick={() => (last ? setConfirming(true) : send(true))}
          >
            {pending ? "Saving…" : "Request to Split"}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-loss" role="alert">{error}</p>}
    </div>
  );
}
