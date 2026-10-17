// The Odds API v4. https://the-odds-api.com/liveapi/guides/v4/
import type { Sport } from "./espn.ts";

const SPORT_KEY: Record<Sport, string> = {
  ncaab: "basketball_ncaab",
  ncaaf: "americanfootball_ncaaf",
};

type Outcome = { name: string; price: number; point?: number };
export type OddsEvent = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: { key: string; markets: { key: string; outcomes: Outcome[] }[] }[];
};

export async function fetchOdds(sport: Sport, bookmaker: string, apiKey: string) {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${SPORT_KEY[sport]}/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", "us");
  url.searchParams.set("markets", "spreads,h2h");
  url.searchParams.set("oddsFormat", "american");
  url.searchParams.set("bookmakers", bookmaker);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Odds API ${res.status}: ${await res.text()}`);
  return {
    events: (await res.json()) as OddsEvent[],
    remaining: res.headers.get("x-requests-remaining"),
  };
}

/** Spread and moneylines for one team name from one bookmaker's markets. */
export function lineFor(event: OddsEvent, bookmaker: string, teamName: string) {
  const book = event.bookmakers.find((b) => b.key === bookmaker);
  const spread = book?.markets.find((m) => m.key === "spreads")?.outcomes.find((o) => o.name === teamName);
  const h2h = book?.markets.find((m) => m.key === "h2h")?.outcomes;
  return {
    spread: spread?.point ?? null,
    moneyline: h2h?.find((o) => o.name === teamName)?.price ?? null,
    otherMoneyline: h2h?.find((o) => o.name !== teamName)?.price ?? null,
  };
}
