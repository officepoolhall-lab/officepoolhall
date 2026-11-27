import type { PoolKind } from "./poolType";
import type { PresetKey } from "./poolSettings";

// Every sport and pool type the site lists: the landing page's "Choose your sport, then your
// pool" and the Start a Pool page share this, so they always match. `template` is what Start a
// Pool creates (a team-sport preset, or a golf contest). `live`: the site runs this kind of pool
// (the landing page shows "Coming soon" for the rest); only types with a template can be started
// from Start a Pool.

export type GolfTemplate = "golf_tiers" | "golf_salary";
/** NFL pools with their own format (settings.format): Survivor, Super Bowl Squares, Playoff Fantasy. */
export type FormatTemplate = "nfl_survivor" | "nfl_squares" | "nfl_playoff_fantasy" | "ncaaf_squares";
/** NCAA Pick X (settings.format = "pick_x"). */
export type PickXTemplate = "ncaab_pickx";
export type Template = PresetKey | GolfTemplate | PickXTemplate | FormatTemplate;

export type CatalogType = { id: string; name: string; text: string; live: boolean; template?: Template };
export type CatalogLeague = { id: "nfl" | "ncaaf" | "ncaab" | "pga"; label: string; full: string; kind: PoolKind; types: CatalogType[] };

export const LEAGUES: CatalogLeague[] = [
  {
    id: "nfl",
    label: "NFL",
    full: "NFL",
    kind: "football",
    types: [
      { live: true, id: "survivor", name: "Survivor", template: "nfl_survivor", text: "Pick one team to win each week, using each team only once. Lose and you're out. Last one standing wins." },
      { live: true, id: "supercontest", name: "Supercontest", template: "nfl_ats", text: "Pick a set number of games against the spread each week. The most wins over the season takes it." },
      { live: true, id: "pickem", name: "Pick 'Em", template: "nfl_pickem", text: "Pick the winner of every game, no spreads. The easiest pool for anyone to join." },
      { live: true, id: "confidence", name: "Confidence", template: "nfl_confidence", text: "Pick every game and rank them by how sure you are. Your surest pick is worth the most." },
      { live: true, id: "squares", name: "Super Bowl Squares", template: "nfl_squares", text: "Claim squares on a 10-by-10 grid for the Super Bowl. The score at the end of each quarter pays a square." },
      { live: false, id: "guillotine", name: "Guillotine Fantasy", text: "A fantasy league where the lowest-scoring team is cut each week and its players go back up for grabs." },
      { live: true, id: "playoff-fantasy", name: "Playoff Fantasy", template: "nfl_playoff_fantasy", text: "Pick NFL players for the playoffs: one roster for the whole postseason, or a new lineup each round with NFL.com-style multipliers." },
    ],
  },
  {
    id: "ncaaf",
    label: "NCAAF",
    full: "College football",
    kind: "football",
    types: [
      { live: true, id: "supercontest", name: "Supercontest", template: "ncaaf_ats", text: "Pick a set number of college games against the spread from each week's slate." },
      { live: true, id: "pickem", name: "Pick 'Em", template: "ncaaf_pickem", text: "Pick winners straight up from each week's biggest college games." },
      { live: true, id: "confidence", name: "Confidence", template: "ncaaf_confidence", text: "Pick every game on the week's slate and rank them by how sure you are." },
      { live: true, id: "squares", name: "Squares", template: "ncaaf_squares", text: "Claim squares on a 10-by-10 grid for any college game: a rivalry, a bowl or the title game. Each quarter's score pays a square." },
    ],
  },
  {
    id: "ncaab",
    label: "NCAAB",
    full: "College basketball",
    kind: "basketball",
    types: [
      { live: true, id: "pick-x", name: "Pick X", template: "ncaab_pickx", text: "Pick a set number of NCAA Tournament teams. Every game they win earns points, and long shots earn more." },
      { live: false, id: "calcutta", name: "Calcutta", text: "Bid on NCAA Tournament teams in an auction. Each round your teams win pays a share of the pot." },
      { live: false, id: "bracket", name: "Bracket", text: "Fill out the whole bracket before tip-off. Each round is worth more than the last." },
      { live: false, id: "takeover", name: "Takeover Bracket", text: "Everyone starts with teams in the bracket. When your team wins, you take over the team it beat." },
      { live: true, id: "pickem", name: "Pick 'Em", template: "ncaab_pickem", text: "Pick the winner of each week's college basketball games straight up, no spreads." },
      { live: true, id: "confidence", name: "Confidence", template: "ncaab_confidence", text: "Rank each week's games by how sure you are, all season, with bonus points for calling early-season tournament winners." },
    ],
  },
  {
    id: "pga",
    label: "PGA",
    full: "PGA Tour",
    kind: "golf",
    types: [
      { live: true, id: "tiers", name: "Tiers", template: "golf_tiers", text: "Golfers are split into tiers by odds and world ranking. Take one from each tier for a major or any tour event." },
      { live: true, id: "one-and-done", name: "One-and-Done", text: "Pick one golfer each week, using each golfer only once all season. Your golfers' prize money is your score." },
      { live: true, id: "salary", name: "Salary Cap", template: "golf_salary", text: "Build a team of golfers under a salary cap, scored hole by hole like fantasy." },
      { live: false, id: "calcutta", name: "Calcutta", text: "Bid on golfers in an auction before the tournament. Where your golfers finish pays a share of the pot." },
    ],
  },
];

/** Each format template's settings.format (and the name of its rules block). */
export const TEMPLATE_FORMAT: Record<FormatTemplate, "survivor" | "squares" | "playoff_fantasy"> = {
  nfl_survivor: "survivor",
  nfl_squares: "squares",
  nfl_playoff_fantasy: "playoff_fantasy",
  ncaaf_squares: "squares",
};
/** The sport each format template's pool is. */
export const TEMPLATE_SPORT: Record<FormatTemplate, "nfl" | "ncaaf"> = { nfl_survivor: "nfl", nfl_squares: "nfl", nfl_playoff_fantasy: "nfl", ncaaf_squares: "ncaaf" };
export const isFormatTemplate = (t: string | null | undefined): t is FormatTemplate => Boolean(t && t in TEMPLATE_FORMAT);

/** The league and type a template belongs to (for opening Start a Pool on it). */
export function findTemplate(t: string | undefined): { league: CatalogLeague; type: CatalogType } | null {
  for (const league of LEAGUES) for (const type of league.types) if (type.template && type.template === t) return { league, type };
  return null;
}
