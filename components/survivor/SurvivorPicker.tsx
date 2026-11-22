"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MatchupHistoryDialog } from "@/components/ProfileDialogs";
import { CheckIcon, LiveDot, LockIcon, TeamLogo } from "@/components/ui";
import { formatSpread } from "@/lib/format";

export type PickerTeam = {
  id: string;
  name: string;
  abbreviation: string | null;
  logo_url: string | null;
  espnId: string | null;
  /** "7–3", when ESPN has it. */
  record: string | null;
  /** This team's point spread (−3.5 is a 3.5-point favorite), when there's a line. */
  spread: number | null;
  /** Once the game has started. */
  score: number | null;
  /** "Used · Week 3", when it can't be picked again. */
  used: string | null;
};
export type PickerGame = {
  id: string;
  /** "Sun, Nov 22 · 12:00 PM" */
  when: string;
  tv: string | null;
  state: "upcoming" | "live" | "final";
  /** Live: ESPN's clock and period. */
  clock: string | null;
  /** Can't be picked: it has started. */
  locked: boolean;
  /** Play-by-play and box score, once the game has started. */
  href: string | null;
  home: PickerTeam;
  away: PickerTeam;
};

/**
 * The week's games, each a pair of teams to tap, with what helps choose: the spread, each
 * team's record, where to watch, and "More info" (both teams' recent results). One pick a
 * week: tapping another team moves it. Teams already used and games under way can't be picked.
 * A bar at the bottom of the screen says what's picked and whether it has saved. `readOnly`
 * (a past week, an entry that's out) shows the same cards with scores and nothing to tap.
 */
export function SurvivorPicker({
  games,
  pick,
  pickLocked,
  readOnly = false,
  weekLabel,
  timezone,
  save,
}: {
  games: PickerGame[];
  pick: { gameId: string; teamId: string } | null;
  /** The current pick's game has started: it can't be changed. */
  pickLocked: boolean;
  readOnly?: boolean;
  weekLabel: string;
  timezone: string;
  save: (gameId: string, teamId: string) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState(pick?.teamId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [info, setInfo] = useState<PickerGame | null>(null);

  const choose = (g: PickerGame, t: PickerTeam) => {
    if (readOnly || pending || t.id === chosen) return;
    const before = chosen;
    setChosen(t.id);
    setError(null);
    start(async () => {
      const r = await save(g.id, t.id).catch(() => ({ error: "That didn't save. Try again." }));
      if (r.error) {
        setChosen(before);
        setError(r.error);
      } else router.refresh();
    });
  };

  const chosenTeam = games.flatMap((g) => [g.away, g.home]).find((t) => t.id === chosen) ?? null;

  const team = (g: PickerGame, t: PickerTeam, other: PickerTeam) => {
    const on = t.id === chosen;
    const fixed = readOnly || pickLocked;
    const off = !on && (g.locked || fixed || Boolean(t.used));
    const won = g.state === "final" && t.score !== null && other.score !== null ? t.score > other.score : null;
    return (
      <button
        type="button"
        disabled={off || (on && fixed)}
        aria-pressed={on}
        aria-label={`${on ? "Your pick: " : "Pick "}${t.name}${t.spread !== null ? ` ${formatSpread(t.spread)}` : ""}${t.used ? `, ${t.used}` : ""}`}
        onClick={() => choose(g, t)}
        className={`flex min-h-12 w-full items-center gap-2.5 rounded-xl px-3 py-1.5 text-left ring-1 transition ${
          on
            ? "bg-accent text-white ring-accent dark:text-black"
            : off
              ? `bg-bg text-ink ring-line ${t.used || (g.state === "upcoming" && !readOnly) ? "opacity-55" : ""}`
              : "bg-bg text-ink ring-line hover:ring-2 hover:ring-accent"
        }`}
      >
        <TeamLogo src={t.logo_url} abbr={t.abbreviation} className="size-7 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className={`truncate text-[15px] ${won === false ? "font-medium" : "font-semibold"}`}>{t.name}</span>
            {t.record && <span className="shrink-0 text-xs tabular-nums opacity-70">{t.record}</span>}
          </span>
          {on ? (
            <span className="block text-[11px] font-semibold">{fixed ? "Your pick · locked" : "Your pick"}</span>
          ) : t.used ? (
            <span className="block truncate text-[11px] font-medium">{t.used}</span>
          ) : null}
        </span>
        {t.spread !== null && <span className="w-11 shrink-0 text-right text-sm tabular-nums opacity-80">{formatSpread(t.spread)}</span>}
        {t.score !== null && (
          <span className={`w-8 shrink-0 text-right text-lg tabular-nums ${won === false ? "font-medium opacity-70" : "font-bold"}`}>{t.score}</span>
        )}
      </button>
    );
  };

  return (
    <div>
      <ul className="grid gap-3 md:grid-cols-2">
        {games.map((g) => (
          <li key={g.id} className="rounded-2xl bg-surface p-3">
            <div className="mb-2 flex min-h-6 items-center gap-1.5 text-xs font-medium text-muted">
              <span className="min-w-0 flex-1 truncate">
                {g.state === "final" ? (
                  <span className="font-semibold text-ink">Final</span>
                ) : g.state === "live" ? (
                  <>
                    <LiveDot>Live</LiveDot>
                    {g.clock && <span className="ml-1.5 tabular-nums text-ink">{g.clock}</span>}
                  </>
                ) : (
                  g.when
                )}
                {g.tv && g.state !== "final" && <span> · {g.tv}</span>}
                {g.state === "final" && <span> · {g.when}</span>}
                {g.locked && g.state === "upcoming" && <LockIcon className="ml-1.5 inline size-3 align-[-2px]" />}
              </span>
              {g.away.espnId && g.home.espnId && (
                <button type="button" onClick={() => setInfo(g)} className="-my-1 shrink-0 rounded-full px-2 py-1 font-semibold text-accent hover:bg-hover">
                  More info
                </button>
              )}
              {g.href && (
                <Link href={g.href} scroll={false} className="-my-1 -mr-1 shrink-0 rounded-full px-2 py-1 font-semibold text-accent hover:bg-hover">
                  Box Score ›
                </Link>
              )}
            </div>
            <div className="space-y-1.5">
              {team(g, g.away, g.home)}
              {team(g, g.home, g.away)}
            </div>
          </li>
        ))}
      </ul>

      {info && info.away.espnId && info.home.espnId && (
        <MatchupHistoryDialog
          sport="nfl"
          away={{ espnId: info.away.espnId, name: info.away.name, logo: info.away.logo_url }}
          home={{ espnId: info.home.espnId, name: info.home.name, logo: info.home.logo_url }}
          detail={[
            info.when,
            info.tv,
            info.home.spread !== null
              ? info.home.spread === 0
                ? "Pick 'em"
                : `${info.home.spread < 0 ? info.home.name : info.away.name} ${formatSpread(-Math.abs(info.home.spread))}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          timezone={timezone}
          onClose={() => setInfo(null)}
        />
      )}

      {/* What's picked and whether it has saved, pinned to the bottom like the other pools' tracker. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto max-w-5xl py-2.5 xl:max-w-6xl 2xl:max-w-7xl pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
          {error && <p className="mb-1.5 text-sm text-loss" role="alert">{error}</p>}
          <div className="flex min-h-9 items-center gap-3">
            <p className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted">
              {(readOnly || pickLocked) && <LockIcon className="size-3.5 shrink-0" />}
              {chosenTeam ? (
                <>
                  <span className="shrink-0">{weekLabel} pick</span>
                  <TeamLogo src={chosenTeam.logo_url} abbr={chosenTeam.abbreviation} className="size-6 shrink-0" />
                  <span className="truncate text-[15px] font-semibold text-ink">{chosenTeam.name}</span>
                </>
              ) : (
                <span>{readOnly ? `No pick in ${weekLabel}` : `${weekLabel}: tap a team to make your pick`}</span>
              )}
            </p>
            <span role="status" aria-live="polite" className={`flex shrink-0 items-center gap-1 text-sm font-semibold ${error ? "text-loss" : pending ? "text-muted" : "text-win"}`}>
              {pending ? (
                "Saving…"
              ) : error ? (
                "Not saved"
              ) : chosenTeam ? (
                <>
                  <CheckIcon className="size-4" /> Saved
                </>
              ) : null}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
