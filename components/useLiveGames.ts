"use client";

import { useEffect, useState } from "react";
import { hasStarted } from "@/lib/locks";
import type { SlateGame } from "@/lib/pool";

const LIVE_POLL_MS = 10_000;
type LiveDetail = { clock: string; home: number | null; away: number | null; lastPlay: string | null; situation: string | null; possession: "home" | "away" | null };

/** yyyymmdd in US Eastern (ESPN's scoreboard dates). */
const espnDay = (at: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(at)).replaceAll("-", "");

/**
 * While any game is live (and the tab is visible), asks /api/live every 10 seconds for ESPN's
 * latest clock, score, down and distance and last play, and lays them over the games, so new
 * plays appear without reloading the page. Stops on its own when no game is live.
 */
export function useLiveGames(games: SlateGame[], now: number, sport: "ncaaf" | "ncaab" | undefined): SlateGame[] {
  const [detail, setDetail] = useState<Record<string, LiveDetail>>({});
  const isLiveGame = (g: SlateGame) =>
    !g.voided && Boolean(g.espnId) && hasStarted(g, now) && g.status !== "final" && !g.overridden && g.status !== "postponed" && g.status !== "cancelled";
  const live = games.filter(isLiveGame);
  const dates = [...new Set(live.map((g) => espnDay(g.startAt)))].sort().join(",");

  useEffect(() => {
    if (!sport || !dates) return;
    let stopped = false;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/live?sport=${sport}&dates=${dates}`, { cache: "no-store" });
        if (!res.ok || stopped) return;
        const body = (await res.json()) as { games?: Record<string, LiveDetail> };
        if (!stopped) setDetail(body.games ?? {});
      } catch {
        // Try again next tick.
      }
    };
    void poll();
    const id = setInterval(poll, LIVE_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sport, dates]);

  return games.map((g) => {
    const d = g.espnId ? detail[g.espnId] : undefined;
    if (!d || !isLiveGame(g)) return g;
    return { ...g, clock: d.clock, lastPlay: d.lastPlay, situation: d.situation, possession: d.possession, homeScore: d.home ?? g.homeScore, awayScore: d.away ?? g.awayScore };
  });
}
