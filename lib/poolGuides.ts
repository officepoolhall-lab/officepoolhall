import { LEAGUES, type CatalogLeague, type CatalogType } from "./poolCatalog";

// The pool-type pages (/formats/[league]/[type]): how each kind of pool plays, how it scores,
// and what the commissioner can change. The football and basketball pick pools share the same
// engine, so their guides are shared too.

export type Guide = {
  /** How a week (or the tournament) goes, in order. */
  how: string[];
  scoring: string[];
  /** Settings the commissioner chooses. */
  options: string[];
  /** How ties are broken (TIEBREAKERS below; a placeholder until each pool's are settled). */
  tiebreakers: string[];
};

const LOCKS = "When picks lock: each game at its own start, or every pick at one weekly deadline.";
const REVEAL = "When players can see each other's picks: as each game starts, or once picks lock.";
const SEGMENTS = "Bonus segments: split the season into stretches (first half, second half) with standings of their own.";
const MISSED = "Missed weeks: score nothing, or the week's last-place score.";
const LINES = "Lines from the sportsbook you choose, frozen when the week is published, with half points if you want no pushes.";

const supercontest: Omit<Guide, "tiebreakers"> = {
  how: [
    "Each week the commissioner publishes the slate, and the spreads freeze at that moment.",
    "Players pick a set number of games against the spread, five by default.",
    "Picks lock as each game starts, and everyone's picks show on the League Grid.",
    "Results grade automatically when games go final, and the standings update themselves.",
  ],
  scoring: ["1 point for a cover, half a point for a push, nothing for a loss (all adjustable).", "Season and weekly standings, by points or by record."],
  options: [
    "How many picks a week, and whether players must make exactly that many or up to that many.",
    "Full card: picks save only once all of them are made.",
    LINES,
    LOCKS,
    REVEAL,
    "Points for a win, push and loss.",
    SEGMENTS,
    MISSED,
  ],
};

const pickem: Omit<Guide, "tiebreakers"> = {
  how: [
    "Each week's games are posted, with no spreads.",
    "Players pick the winner of every game straight up.",
    "Picks lock as each game starts.",
    "Results grade automatically, and the standings update themselves.",
  ],
  scoring: ["1 point for each correct pick.", "Season and weekly standings, by record or by points."],
  options: ["How many games a week.", LOCKS, REVEAL, "Points for a win, push and loss.", "Upset bonuses: extra points for picking an underdog most of the pool passed on.", SEGMENTS, MISSED],
};

const confidence: Omit<Guide, "tiebreakers"> = {
  how: [
    "Players pick the winner of every game on the week's slate.",
    "They rank their picks by confidence: their surest pick gets the most points, the next one less, and so on.",
    "Picks lock as each game starts or at the weekly deadline.",
    "Correct picks earn their confidence points, and the standings update as games go final.",
  ],
  scoring: ["A correct pick earns the confidence points it was given.", "Optional upset bonuses for correct picks most of the pool missed."],
  options: [
    "How many games a week, and the confidence values (one of each, or tiers that repeat).",
    "Wrong picks: score nothing, or lose the points they were worth.",
    "Upset bonuses: how much of the pool has to miss a pick before it pays extra, and how much.",
    "Straight up or against the spread.",
    LOCKS,
    REVEAL,
    SEGMENTS,
    MISSED,
  ],
};

const pickX: Omit<Guide, "tiebreakers"> = {
  how: [
    "Once the NCAA Tournament field is set, players pick a set number of teams from anywhere in the bracket.",
    "Picks lock when the First Round tips off.",
    "Every game a player's teams win earns points, all the way to the title.",
    "Teams still alive show on every entry, so everyone can see who has the most points left.",
    "Winners fill in from ESPN as games finish, so standings keep themselves.",
  ],
  scoring: ["Seed × round by default: a win is worth the team's seed times the round (1 to 6), so a 12 seed's first-round upset is worth 12.", "Other presets: seed plus 3 per win, seed per win, or a flat doubling scale; or set your own points per round."],
  options: [
    "How many teams each player picks.",
    "The scoring: a preset, or your own points for each round, with or without the seed and a bonus per win.",
    "Limits: none, one team per seed line, a most-per-region cap, or a minimum total of seeds.",
    "A tiebreaker: none, or the closest guess of the championship game's total points.",
  ],
};

const tiers: Omit<Guide, "tiebreakers"> = {
  how: [
    "For each event the field is split into tiers by betting odds, world ranking, or a blend of both.",
    "Players pick golfers from each tier: a favorite or two up top, longer shots further down.",
    "Lineups lock at the first tee time.",
    "Scores update live, hole by hole, while the event is played.",
  ],
  scoring: ["The best golfers in each lineup count, by total score to par or by prize money.", "One standings total across the season's events, or each event on its own."],
  options: [
    "4, 6 or 8 tiers, and how many golfers to pick from each.",
    "How many of each lineup's golfers count.",
    "Tiers built from odds, world ranking, a blend, or set by hand.",
    "Leave out the favorites: the top golfers by odds or by ranking, so nobody can pick them.",
    "Majors only, or any tour event.",
  ],
};

const salary: Omit<Guide, "tiebreakers"> = {
  how: [
    "Every golfer in the field gets a salary, based on betting odds and world ranking.",
    "Players build a roster of golfers under the salary cap.",
    "Lineups lock at the first tee time.",
    "Scores update live, hole by hole, fantasy style.",
  ],
  scoring: ["Each roster scores from its golfers' rounds.", "One standings total across the season's events, or each event on its own."],
  options: ["The salary cap and roster size.", "The lowest and highest salary.", "Salaries from the odds-and-ranking formula, or set by hand.", "Leave out the favorites, by odds or by ranking."],
};

const oneAndDone: Omit<Guide, "tiebreakers"> = {
  how: [
    "Every week of the PGA Tour season, players pick one golfer.",
    "Each golfer can be used only once all season, so saving the stars for the majors matters.",
    "Picks lock at the first tee time of the event.",
    "Each pick earns the prize money that golfer wins that week.",
  ],
  scoring: ["Standings are the total prize money your golfers have won.", "Missed a week? Earn $0, or the lowest amount anyone earned that week."],
  options: ["Which events count.", "What a missed pick earns: $0, or the week's lowest pick."],
};

const survivor: Omit<Guide, "tiebreakers"> = {
  how: [
    "Each week the commissioner publishes the NFL slate.",
    "Players pick one team to win its game, straight up. No spreads.",
    "A pick locks when its game kicks off, and everyone's pick shows on Standings from that moment.",
    "Win and you move on. Lose and you're out (or lose a life, in pools with more than one).",
    "Once a team is picked it's used up, so saving the favorites for later is the whole game.",
  ],
  scoring: ["No points: you're either alive or out.", "Standings show who's left, lives remaining, and every entry's pick each week.", "A week with no pick counts as a loss."],
  options: [
    "Lives: one and done, or two or three losses before an entry is out.",
    "A tied game: counts as a loss, or as a win.",
    "Each team only once (the usual rule), or let teams be picked again.",
    "The week the pool starts, for pools that begin after Week 1.",
    "The commissioner can make or fix a pick for a player.",
  ],
};

const squares: Omit<Guide, "tiebreakers"> = {
  how: [
    "The board has 100 squares: ten columns for one team, ten rows for the other.",
    "Players tap open squares to take them, and can give one back until the board locks.",
    "When the board is ready, the commissioner draws the numbers: a digit from 0 to 9 lands on each column and row at random.",
    "At the end of each quarter, take the last digit of each team's score. The square where they meet wins.",
    "Scores and winners fill in live from ESPN once the game is linked, or the commissioner can type them in.",
  ],
  scoring: ["Four winning squares: end of the 1st quarter, halftime, end of the 3rd quarter, and the final score (overtime included).", "The board shows the pot and what each quarter pays."],
  options: [
    "The price of a square.",
    "A limit on squares per entry, or none.",
    "How the pot is split: even quarters, a bigger final, halftime and final, final only, or your own percentages.",
    "The team names on the board, and the game it follows.",
    "The commissioner can take squares for a player, and clear the numbers to reopen the board.",
  ],
};

const playoffFantasy: Omit<Guide, "tiebreakers"> = {
  how: [
    "Before the Wild Card round, each player builds one roster: 2 QB, 4 RB, 4 WR, 2 TE, a kicker and a defense by default.",
    "Only one player from each playoff team, so all 14 teams end up on every roster.",
    "Rosters lock at the first Wild Card kickoff, and everyone's roster shows from then on.",
    "Every player on the roster scores every week he plays, from the Wild Card round through the Super Bowl.",
    "When a team is knocked out, its player stops scoring. Most total points wins.",
  ],
  scoring: [
    "Starts from the most common league scoring: 1 point per 25 passing yards and per 10 rushing or receiving yards, 4 per passing touchdown, 6 per rushing or receiving touchdown, 1 per catch (PPR), -2 per interception or lost fumble.",
    "Kickers: 3 per field goal, 1 per extra point. Defenses: sacks, interceptions, fumble recoveries, touchdowns and points allowed.",
    "Points come from ESPN's box scores and update live during games.",
  ],
  options: [
    "Catches: PPR, half PPR or standard.",
    "Passing touchdowns: 4 or 6 points.",
    "Yardage bonuses for 300-yard passing and 100-yard rushing or receiving games.",
    "Every scoring value, for players, kickers and defenses.",
    "Roster spots at each position.",
    "When rosters lock.",
    "The commissioner can set or fix a roster for a player.",
  ],
};

const GUIDES: Record<string, Omit<Guide, "tiebreakers">> = {
  "nfl/supercontest": supercontest,
  "ncaaf/supercontest": supercontest,
  "nfl/pickem": pickem,
  "ncaaf/pickem": pickem,
  "ncaab/pickem": pickem,
  "nfl/confidence": confidence,
  "ncaaf/confidence": confidence,
  "ncaab/confidence": {
    ...confidence,
    how: [...confidence.how.slice(0, 3), "Early-season tournaments add bonus points for calling their champions."],
  },
  "ncaab/pick-x": pickX,
  "nfl/survivor": survivor,
  "nfl/squares": squares,
  "nfl/playoff-fantasy": playoffFantasy,
  "pga/tiers": tiers,
  "pga/salary": salary,
  "pga/one-and-done": oneAndDone,
};

// How each pool type breaks ties, by "league/type". Fill these in as each pool's rules are
// settled; until then the page shows TIEBREAKER_PLACEHOLDER.
const TIEBREAKER_PLACEHOLDER = ["Tiebreaker rules for this pool are being finalized and will be listed here soon."];
const TIEBREAKERS: Record<string, string[]> = {
  "nfl/supercontest": [],
  "ncaaf/supercontest": [],
  "nfl/pickem": [],
  "ncaaf/pickem": [],
  "ncaab/pickem": [],
  "nfl/confidence": [],
  "ncaaf/confidence": [],
  "ncaab/confidence": [],
  "ncaab/pick-x": ["The commissioner's choice: entries with the same points share the place, or the tie goes to the closest guess of the championship game's total points (made with your picks)."],
  "nfl/survivor": [],
  "nfl/squares": ["None needed: each quarter has exactly one winning square."],
  "nfl/playoff-fantasy": [],
  "pga/tiers": [],
  "pga/salary": [],
  "pga/one-and-done": [],
};

export function findPoolType(league: string, type: string): { league: CatalogLeague; type: CatalogType; guide: Guide | null } | null {
  const l = LEAGUES.find((x) => x.id === league);
  const t = l?.types.find((x) => x.id === type);
  if (!l || !t) return null;
  const key = `${l.id}/${t.id}`;
  const base = t.live ? GUIDES[key] : undefined;
  const tiebreakers = TIEBREAKERS[key]?.length ? TIEBREAKERS[key] : TIEBREAKER_PLACEHOLDER;
  return { league: l, type: t, guide: base ? { ...base, tiebreakers } : null };
}

export const poolTypeHref = (league: string, type: string) => `/formats/${league}/${type}`;
