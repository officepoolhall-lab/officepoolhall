import type { PoolKind } from "./poolType";
import type { PresetKey } from "./poolSettings";

// Every sport and pool type the site lists: the landing page's "Choose your sport, then your
// pool" and the Start a Pool page share this, so they always match. `template` is what Start a
// Pool creates (a team-sport preset, or a golf contest). `live`: the site runs this kind of pool
// (the landing page shows "Coming soon" for the rest); only types with a template can be started
// from Start a Pool.

export type GolfTemplate = "golf_tiers" | "golf_salary";
/** NCAA Pick X (settings.format = "pick_x"). */
export type PickXTemplate = "ncaab_pickx";
export type Template = PresetKey | GolfTemplate | PickXTemplate;

export type CatalogType = { id: string; name: string; text: string; live: boolean; template?: Template };
export type CatalogLeague = { id: "nfl" | "ncaaf" | "ncaab" | "pga"; label: string; full: string; kind: PoolKind; types: CatalogType[] };

export const LEAGUES: CatalogLeague[] = [
  {
    id: "nfl",
    label: "NFL",
    full: "NFL",
    kind: "football",
    types: [
      { live: true, id: "supercontest", name: "Supercontest", template: "nfl_ats", text: "Pick a set number of games against the spread each week. Lines lock when the week is published." },
      { live: false, id: "survivor", name: "Survivor", text: "Pick one team to win each week. Lose and you're out, and you can't use a team twice." },
      { live: true, id: "pickem", name: "Pick'em", template: "nfl_pickem", text: "Pick the winner of every game straight up, no spreads. Easy for anyone to jump into." },
      { live: true, id: "confidence", name: "Confidence", template: "nfl_confidence", text: "Pick every game and rank them. Your surest pick is worth the most points." },
      { live: false, id: "squares", name: "Super Bowl Squares", text: "A 10-by-10 grid for the big game. Numbers are drawn at random, and each quarter's score picks a winner." },
      { live: false, id: "playoff-fantasy", name: "Playoff Fantasy", text: "Pick a roster of players for the playoffs and ride them all postseason. Points for every yard and touchdown." },
      { live: false, id: "guillotine", name: "Guillotine", text: "A fantasy league where the lowest-scoring team each week is cut, and its players go back up for grabs." },
    ],
  },
  {
    id: "ncaaf",
    label: "NCAAF",
    full: "College football",
    kind: "football",
    types: [
      { live: true, id: "supercontest", name: "Supercontest", template: "ncaaf_ats", text: "Pick a set number of games against the spread from each week's slate." },
      { live: true, id: "pickem", name: "Pick'em", template: "ncaaf_pickem", text: "Pick winners straight up from the week's biggest games." },
      { live: true, id: "confidence", name: "Confidence", template: "ncaaf_confidence", text: "Pick every game on the slate and rank them by how sure you are." },
    ],
  },
  {
    id: "ncaab",
    label: "NCAAB",
    full: "College basketball",
    kind: "basketball",
    types: [
      { live: true, id: "confidence", name: "Confidence", template: "ncaab_confidence", text: "Weekly slates all season, ranked by confidence, with bonus points for calling early-season tournament champions." },
      { live: true, id: "pickem", name: "Pick'em", template: "ncaab_pickem", text: "Pick the winner of every game straight up, no spreads. Easy for anyone to jump into." },
      { live: true, id: "pick-x", name: "Pick X", template: "ncaab_pickx", text: "Pick a set number of tournament teams. Every game they win earns you points, with more for lower seeds." },
      { live: false, id: "bracket", name: "Bracket", text: "Fill out the whole tournament bracket before it tips off. Each round is worth more than the last." },
    ],
  },
  {
    id: "pga",
    label: "PGA",
    full: "PGA Tour",
    kind: "golf",
    types: [
      { live: true, id: "tiers", name: "Tiers", template: "golf_tiers", text: "Golfers split into tiers by odds and world ranking. Pick from each tier for a major or any tour event." },
      { live: true, id: "salary", name: "Salary Cap", template: "golf_salary", text: "Build a roster of golfers under a budget, scored hole by hole, fantasy style." },
      { live: true, id: "one-and-done", name: "One-and-Done", text: "One golfer a week, each golfer only once all season. Standings are the prize money your golfers win." },
    ],
  },
];

/** The league and type a template belongs to (for opening Start a Pool on it). */
export function findTemplate(t: string | undefined): { league: CatalogLeague; type: CatalogType } | null {
  for (const league of LEAGUES) for (const type of league.types) if (type.template && type.template === t) return { league, type };
  return null;
}
