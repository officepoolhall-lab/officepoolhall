// The team sports a pool can be: college basketball, college football and the NFL (golf has
// its own pages). One place for ESPN's paths and the small differences between them.

export type TeamSport = "ncaab" | "ncaaf" | "nfl";

/** A pool's (or game's) sport as one of the team sports (anything else reads as college football). */
export function teamSport(s: string | null | undefined): TeamSport {
  return s === "ncaab" || s === "nfl" ? s : "ncaaf";
}

/** ESPN site-API path for each sport. */
export const ESPN_PATH: Record<TeamSport, string> = {
  ncaab: "basketball/mens-college-basketball",
  ncaaf: "football/college-football",
  nfl: "football/nfl",
};

/** ESPN scoreboard `groups`: all D1 basketball (50), FBS football (80); the NFL needs none. */
export const ESPN_GROUP: Record<TeamSport, string> = { ncaab: "50", ncaaf: "80", nfl: "" };

/** `&groups=…` for a scoreboard URL ("" for the NFL). */
export const groupsParam = (s: TeamSport) => (ESPN_GROUP[s] ? `&groups=${ESPN_GROUP[s]}` : "");

export const isFootball = (s: TeamSport) => s !== "ncaab";

/** Home's news heading. */
export const NEWS_TITLE: Record<TeamSport, string> = { ncaab: "College basketball news", ncaaf: "College football news", nfl: "NFL news" };
