// NFL Playoff Fantasy, two styles (settings.playoff_fantasy.style):
// - "roster" (the default): each entry builds one roster before the Wild Card round, one player
//   from each playoff team, and scores fantasy points through the Super Bowl. Every player on
//   the roster counts every week; a player stops scoring when his team is out.
// - "weekly": a lineup each round, any players (no team
//   limit). A player's points are multiplied by how many rounds in a row he's been in the
//   lineup (2x his second straight round, up to 4x); swapping him out starts him over. Last
//   round's lineup carries over, less players whose team is out. Lineups lock player by player
//   at each one's kickoff, or all at once at the round's first game (weekly_lock).
// The rules live in pools.settings.playoff_fantasy (settings.format = "playoff_fantasy").

import { block, int, num } from "./formats";

export const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;
export type Position = (typeof POSITIONS)[number];
export const POSITION_NAME: Record<Position, string> = { QB: "Quarterback", RB: "Running back", WR: "Wide receiver", TE: "Tight end", K: "Kicker", DEF: "Defense" };

export type PfScoring = {
  /** Passing yards for one point (25 = 0.04 a yard). */
  pass_yds_per_pt: number;
  pass_td: number;
  /** Interception thrown (negative). */
  pass_int: number;
  /** Rushing and receiving yards for one point. */
  yds_per_pt: number;
  rush_td: number;
  rec_td: number;
  /** Points per reception: 1 (PPR), 0.5 (half) or 0 (standard). */
  rec: number;
  /** Fumble lost (negative). */
  fum_lost: number;
  /** Yardage bonuses: extra points for a 300-yard passing game and 100-yard rushing or receiving games (0 = off). */
  bonus_pass_300: number;
  bonus_rush_100: number;
  bonus_rec_100: number;
  /** Kicker: a field goal under 40 yards, from 40-49, and from 50 or more; and an extra point. */
  fg: number;
  fg_40: number;
  fg_50: number;
  xp: number;
  /** A two-point conversion: to the passer, the receiver, or the runner. */
  two_pt: number;
  /** Defense. */
  def_sack: number;
  def_int: number;
  def_fum_rec: number;
  def_td: number;
  def_safety: number;
  /** Score the defense on points allowed (the usual 10 for a shutout down to -4 for 35+). */
  def_points_allowed: boolean;
};

export type PfStyle = "roster" | "weekly";
/** Weekly style: each player locks at his own game's kickoff, or the whole lineup at the round's first. */
export type PfWeeklyLock = "player" | "week";

export type PfSettings = {
  style: PfStyle;
  weekly_lock: PfWeeklyLock;
  /**
   * Demo pools only (set in the database, not on Settings): before the real playoff field is
   * set, use the teams that would be in if the season ended today.
   */
  demo_projected?: boolean;
  /**
   * Demo pools only: made-up playoff games and player stats, played through `through` rounds
   * (1 = Wild Card done, 2 = Divisional done...), the same every time for a given `seed`.
   */
  demo_sim?: { through: number; seed: number } | null;
  /** When lineups lock (the first Wild Card kickoff), ISO; null until the commissioner sets it. */
  lock_at: string | null;
  roster: Record<Position, number>;
  scoring: PfScoring;
};

/** The most common league scoring (full PPR), on a 14-player roster: one from each playoff team. */
export const PF_DEFAULT: PfSettings = {
  style: "roster",
  weekly_lock: "player",
  lock_at: null,
  roster: { QB: 2, RB: 4, WR: 4, TE: 2, K: 1, DEF: 1 },
  scoring: {
    pass_yds_per_pt: 25,
    pass_td: 4,
    pass_int: -2,
    yds_per_pt: 10,
    rush_td: 6,
    rec_td: 6,
    rec: 1,
    fum_lost: -2,
    bonus_pass_300: 0,
    bonus_rush_100: 0,
    bonus_rec_100: 0,
    fg: 3,
    fg_40: 4,
    fg_50: 5,
    xp: 1,
    two_pt: 2,
    def_sack: 1,
    def_int: 2,
    def_fum_rec: 2,
    def_td: 6,
    def_safety: 2,
    def_points_allowed: true,
  },
};

/** The weekly style's starting lineup: QB, 2 RB, 2 WR, TE, K, DEF (8 players). */
export const WEEKLY_ROSTER: Record<Position, number> = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 };

export function pfSettings(settings: unknown): PfSettings {
  const s = block(settings, "playoff_fantasy");
  const r = (s.roster ?? {}) as Record<string, unknown>;
  const sc = (s.scoring ?? {}) as Record<string, unknown>;
  const d = PF_DEFAULT.scoring;
  const n = (k: keyof PfScoring, lo: number, hi: number) => num(sc[k], lo, hi) ?? (d[k] as number);
  return {
    style: s.style === "weekly" ? "weekly" : "roster",
    weekly_lock: s.weekly_lock === "week" ? "week" : "player",
    demo_projected: s.demo_projected === true,
    demo_sim:
      s.demo_sim && typeof s.demo_sim === "object"
        ? { through: Math.min(4, Math.max(0, Number((s.demo_sim as Record<string, unknown>).through) || 0)), seed: Number((s.demo_sim as Record<string, unknown>).seed) || 1 }
        : null,
    lock_at: typeof s.lock_at === "string" && !Number.isNaN(Date.parse(s.lock_at)) ? s.lock_at : null,
    roster: Object.fromEntries(POSITIONS.map((p) => [p, int(r[p], 0, 10) ?? PF_DEFAULT.roster[p]])) as Record<Position, number>,
    scoring: {
      pass_yds_per_pt: n("pass_yds_per_pt", 1, 100),
      pass_td: n("pass_td", 0, 20),
      pass_int: n("pass_int", -10, 0),
      yds_per_pt: n("yds_per_pt", 1, 100),
      rush_td: n("rush_td", 0, 20),
      rec_td: n("rec_td", 0, 20),
      rec: n("rec", 0, 5),
      fum_lost: n("fum_lost", -10, 0),
      bonus_pass_300: n("bonus_pass_300", 0, 20),
      bonus_rush_100: n("bonus_rush_100", 0, 20),
      bonus_rec_100: n("bonus_rec_100", 0, 20),
      fg: n("fg", 0, 20),
      fg_40: n("fg_40", 0, 20),
      fg_50: n("fg_50", 0, 20),
      xp: n("xp", 0, 20),
      two_pt: n("two_pt", 0, 20),
      def_sack: n("def_sack", 0, 20),
      def_int: n("def_int", 0, 20),
      def_fum_rec: n("def_fum_rec", 0, 20),
      def_td: n("def_td", 0, 20),
      def_safety: n("def_safety", 0, 20),
      def_points_allowed: sc.def_points_allowed !== false,
    },
  };
}

export const rosterSize = (s: PfSettings) => POSITIONS.reduce((t, p) => t + s.roster[p], 0);

export function pfSettingsError(s: PfSettings): string | null {
  const size = rosterSize(s);
  if (size < 1) return "The roster needs at least one spot.";
  if (s.style === "roster" && size > 14) return `The roster has ${size} spots, but only 14 teams make the playoffs (one player per team).`;
  if (size > 20) return `The lineup has ${size} spots; 20 is the most.`;
  return null;
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** "PPR", "Half PPR" or "Standard". */
export const recLabel = (rec: number) => (rec === 1 ? "PPR" : rec === 0.5 ? "Half PPR" : rec === 0 ? "Standard (no points per catch)" : "custom");

/** The rules in plain words, for Home and the settings summary. */
export function pfRules(s: PfSettings): string[] {
  const sc = s.scoring;
  const spots = POSITIONS.filter((p) => s.roster[p] > 0).map((p) => `${s.roster[p]} ${p}`).join(", ");
  const bonuses = [
    sc.bonus_pass_300 ? `${signed(sc.bonus_pass_300)} for 300 passing yards` : null,
    sc.bonus_rush_100 ? `${signed(sc.bonus_rush_100)} for 100 rushing yards` : null,
    sc.bonus_rec_100 ? `${signed(sc.bonus_rec_100)} for 100 receiving yards` : null,
  ].filter(Boolean);
  const how =
    s.style === "weekly"
      ? [
          `Set a lineup of ${rosterSize(s)} each round: ${spots}. Any players, no limit per team.`,
          "Keep a player in your lineup and his points multiply: 2x his second straight round, 3x his third, 4x his fourth. Swap him out and he starts over at 1x.",
          "Your lineup carries over to the next round; players whose team is out drop off.",
          s.weekly_lock === "player" ? "Each player locks when his game kicks off." : "The whole lineup locks when the round's first game kicks off.",
          "Most total points through the Super Bowl wins.",
        ]
      : [
          `Build one roster of ${rosterSize(s)}: ${spots}.`,
          "Only one player from each playoff team.",
          "Every player counts every week, from the Wild Card round through the Super Bowl. Most total points wins.",
        ];
  // Every scoring value, as chosen: the box reads back exactly what the settings say.
  const pts = (n: number) => `${n}`;
  const yds = (n: number) => `1 point per ${n} yards`;
  return [
    ...how,
    `Passing: ${yds(sc.pass_yds_per_pt)}, ${pts(sc.pass_td)} per touchdown, ${pts(sc.pass_int)} per interception.`,
    `Rushing and receiving: ${yds(sc.yds_per_pt)}, ${pts(sc.rush_td)} per rushing touchdown, ${pts(sc.rec_td)} per receiving touchdown, ${sc.rec ? `${pts(sc.rec)} per catch (${recLabel(sc.rec)})` : "no points per catch (non-PPR)"}.`,
    `Fumble lost: ${pts(sc.fum_lost)}. Two-point conversion: ${pts(sc.two_pt)}.`,
    ...(bonuses.length ? [`Yardage bonuses: ${bonuses.join(", ")}.`] : []),
    `Kickers: ${pts(sc.fg)} for a field goal under 40 yards, ${pts(sc.fg_40)} from 40-49, ${pts(sc.fg_50)} from 50 or more, ${pts(sc.xp)} per extra point.`,
    `Defense: ${pts(sc.def_sack)} per sack, ${pts(sc.def_int)} per interception, ${pts(sc.def_fum_rec)} per fumble recovered, ${pts(sc.def_td)} per touchdown, ${pts(sc.def_safety)} per safety${
      sc.def_points_allowed ? ", and points allowed (10 for a shutout down to -4 for 35 or more)" : "; points allowed don't count"
    }.`,
  ];
}

// ---------------------------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------------------------

/** One player's line in one game. */
export type PlayerLine = {
  passYds: number; passTd: number; passInt: number; rushYds: number; rushTd: number; rec: number; recYds: number; recTd: number; fumLost: number;
  /** Field goals made (the box score), and the distance of each one found in the scoring summary. */
  fg: number;
  fgYds: number[];
  xp: number;
  /** Two-point conversions thrown, caught or run in. */
  twoPt: number;
};
/** One team defense's line in one game. */
export type DefLine = { sacks: number; ints: number; fumRec: number; td: number; safeties: number; pointsAllowed: number };

export const emptyLine = (): PlayerLine => ({ passYds: 0, passTd: 0, passInt: 0, rushYds: 0, rushTd: 0, rec: 0, recYds: 0, recTd: 0, fumLost: 0, fg: 0, fgYds: [], xp: 0, twoPt: 0 });

const round2 = (n: number) => Math.round(n * 100) / 100;

export function playerPoints(l: PlayerLine, sc: PfScoring): number {
  return round2(
    l.passYds / sc.pass_yds_per_pt +
      l.passTd * sc.pass_td +
      l.passInt * sc.pass_int +
      (l.rushYds + l.recYds) / sc.yds_per_pt +
      l.rushTd * sc.rush_td +
      l.recTd * sc.rec_td +
      l.rec * sc.rec +
      l.fumLost * sc.fum_lost +
      (l.passYds >= 300 ? sc.bonus_pass_300 : 0) +
      (l.rushYds >= 100 ? sc.bonus_rush_100 : 0) +
      (l.recYds >= 100 ? sc.bonus_rec_100 : 0) +
      // Each field goal by its distance; one the scoring summary didn't list scores as a short one.
      l.fgYds.reduce((t, y) => t + (y >= 50 ? sc.fg_50 : y >= 40 ? sc.fg_40 : sc.fg), 0) +
      Math.max(0, l.fg - l.fgYds.length) * sc.fg +
      l.xp * sc.xp +
      l.twoPt * sc.two_pt,
  );
}

/** The usual points-allowed scale: 10 for a shutout down to -4 for 35 or more. */
export const pointsAllowedScore = (pa: number) => (pa === 0 ? 10 : pa <= 6 ? 7 : pa <= 13 ? 4 : pa <= 20 ? 1 : pa <= 27 ? 0 : pa <= 34 ? -1 : -4);

export function defPoints(d: DefLine, sc: PfScoring): number {
  return round2(
    d.sacks * sc.def_sack + d.ints * sc.def_int + d.fumRec * sc.def_fum_rec + d.td * sc.def_td + d.safeties * sc.def_safety + (sc.def_points_allowed ? pointsAllowedScore(d.pointsAllowed) : 0),
  );
}

// ---------------------------------------------------------------------------------------------
// Reading ESPN's box score
// ---------------------------------------------------------------------------------------------

/** One team's box-score tables from a game summary (lib/gameSummary.ts). */
export type BoxTeam = { teamId: string; groups: { name: string; labels: string[]; rows: { id: string | null; name: string; stats: string[] }[] }[] };

const toNum = (v: string | undefined) => {
  // "2/3" (made/attempted) reads as its first number.
  const n = Number(String(v ?? "").split("/")[0]);
  return Number.isFinite(n) ? n : 0;
};

/** A table by what its name says ("Kansas City Passing"), and a reader for its columns by label. */
function table(team: BoxTeam, match: RegExp) {
  const g = team.groups.find((x) => match.test(x.name));
  if (!g) return null;
  const col = (label: string) => g.labels.findIndex((l) => l.toUpperCase() === label);
  return { rows: g.rows, get: (row: { stats: string[] }, label: string) => toNum(row.stats[col(label)]) };
}

/** Every player's line for one team in one game, by ESPN player id. */
export function playerLines(team: BoxTeam): Map<string, PlayerLine> {
  const out = new Map<string, PlayerLine>();
  const line = (id: string | null) => {
    if (!id) return emptyLine();
    if (!out.has(id)) out.set(id, emptyLine());
    return out.get(id)!;
  };
  const pass = table(team, /passing/i);
  for (const r of pass?.rows ?? []) {
    const l = line(r.id);
    l.passYds += pass!.get(r, "YDS");
    l.passTd += pass!.get(r, "TD");
    l.passInt += pass!.get(r, "INT");
  }
  const rush = table(team, /rushing/i);
  for (const r of rush?.rows ?? []) {
    const l = line(r.id);
    l.rushYds += rush!.get(r, "YDS");
    l.rushTd += rush!.get(r, "TD");
  }
  const rec = table(team, /receiving/i);
  for (const r of rec?.rows ?? []) {
    const l = line(r.id);
    l.rec += rec!.get(r, "REC");
    l.recYds += rec!.get(r, "YDS");
    l.recTd += rec!.get(r, "TD");
  }
  const fum = table(team, /fumbles/i);
  for (const r of fum?.rows ?? []) line(r.id).fumLost += fum!.get(r, "LOST");
  // "Kicking", not "Kick Returns".
  const kick = table(team, /kicking/i);
  for (const r of kick?.rows ?? []) {
    const l = line(r.id);
    l.fg += kick!.get(r, "FG");
    l.xp += kick!.get(r, "XP");
  }
  return out;
}

/** A team defense's line: its own sacks, interceptions and return touchdowns, the other side's lost fumbles and points. */
export function defLine(team: BoxTeam, opponent: BoxTeam | undefined, opponentScore: number, safeties = 0): DefLine {
  const sum = (t: ReturnType<typeof table>, label: string) => (t ? t.rows.reduce((a, r) => a + t.get(r, label), 0) : 0);
  const def = table(team, /defensive/i);
  const ints = table(team, /interceptions/i);
  const kr = table(team, /kick returns/i);
  const pr = table(team, /punt returns/i);
  const oppFum = opponent ? table(opponent, /fumbles/i) : null;
  return {
    sacks: sum(def, "SACKS"),
    ints: sum(ints, "INT"),
    fumRec: sum(oppFum, "LOST"),
    // The defensive table's TD column covers interception and fumble returns; add kick and punt returns.
    td: sum(def, "TD") + sum(kr, "TD") + sum(pr, "TD"),
    safeties,
    pointsAllowed: opponentScore,
  };
}

// ---------------------------------------------------------------------------------------------
// What the box score leaves out, from ESPN's scoring summary
// ---------------------------------------------------------------------------------------------
// Field goal distances, two-point conversions and safeties aren't in the box score's tables,
// but every scoring play is listed in words: "Harrison Butker 48 Yd Field Goal", "Isiah Pacheco
// 1 Yd Run (Patrick Mahomes Pass to Travis Kelce for Two-Point Conversion)", "Safety".

export type ScoringPlay = { teamId: string; type: string; text: string };
export type ScoringExtras = {
  fieldGoals: { teamId: string; kicker: string; yards: number }[];
  /** The players in each successful conversion: passer and receiver, or the runner. */
  twoPoint: { teamId: string; names: string[] }[];
  /** The team credited with each safety (its defense scores). */
  safeties: string[];
};

export function scoringExtras(plays: ScoringPlay[]): ScoringExtras {
  const out: ScoringExtras = { fieldGoals: [], twoPoint: [], safeties: [] };
  for (const p of plays) {
    const fg = p.text.match(/^(.*?)\s+(\d{1,2})\s*(?:yd|yds|yard|yards)\.?\s+field goal/i);
    if (fg && !/missed|no good|blocked/i.test(p.text)) out.fieldGoals.push({ teamId: p.teamId, kicker: fg[1].trim(), yards: Number(fg[2]) });
    for (const m of p.text.matchAll(/\(([^()]*two-point[^()]*)\)/gi)) {
      const t = m[1];
      if (/fail|no good|incomplete|unsuccessful/i.test(t)) continue;
      const pass = t.match(/^(.+?)\s+pass to\s+(.+?)\s+for\s+two-point/i);
      const run = t.match(/^(.+?)\s+(?:run|rush)\s+for\s+two-point/i);
      if (pass) out.twoPoint.push({ teamId: p.teamId, names: [pass[1].trim(), pass[2].trim()] });
      else if (run) out.twoPoint.push({ teamId: p.teamId, names: [run[1].trim()] });
    }
    if (/safety/i.test(p.type) || /^safety\b/i.test(p.text.trim())) out.safeties.push(p.teamId);
  }
  return out;
}

/** A name with case, punctuation and "Jr."/"III" dropped, so "A.J. Brown" and "AJ Brown" match. */
export const nameKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[.'’,]/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Add what the scoring summary says to one team's lines: each field goal's distance to its
 * kicker, and two-point conversions to the players named. `idByName` finds a player's id from
 * his full name (the pool's player list); the box score's own short names ("P. Mahomes") are
 * the fallback.
 */
export function applyExtras(team: BoxTeam, lines: Map<string, PlayerLine>, extras: ScoringExtras, idByName: (name: string) => string | undefined): void {
  // "P. Mahomes" for "Patrick Mahomes": how the box score lists players.
  const short = (full: string) => {
    const parts = nameKey(full).split(" ");
    return parts.length > 1 ? `${parts[0][0]} ${parts.slice(1).join(" ")}` : parts[0];
  };
  const boxId = new Map<string, string>();
  for (const g of team.groups) for (const r of g.rows) if (r.id) boxId.set(nameKey(r.name), r.id);
  const find = (name: string) => idByName(name) ?? boxId.get(nameKey(name)) ?? boxId.get(short(name));
  const line = (id: string) => {
    if (!lines.has(id)) lines.set(id, emptyLine());
    return lines.get(id)!;
  };

  const kickers = (team.groups.find((g) => /kicking/i.test(g.name))?.rows ?? []).filter((r) => r.id && lines.get(r.id)?.fg);
  for (const fg of extras.fieldGoals.filter((f) => f.teamId === team.teamId)) {
    // One kicker made this team's field goals (nearly always): they're his. Otherwise by name.
    const id = kickers.length === 1 ? kickers[0].id! : find(fg.kicker);
    if (id) line(id).fgYds.push(fg.yards);
  }
  // Never more distances than field goals the box score says he made.
  for (const l of lines.values()) if (l.fgYds.length > l.fg) l.fgYds.length = l.fg;

  for (const tp of extras.twoPoint.filter((t) => t.teamId === team.teamId)) {
    for (const name of tp.names) {
      const id = find(name);
      if (id) line(id).twoPt++;
    }
  }
}

/** A team defense's id in the player list. */
export const defId = (teamEspnId: string) => `DEF-${teamEspnId}`;

export const ROUNDS = [
  { name: "Wild Card", short: "WC" },
  { name: "Divisional", short: "DIV" },
  { name: "Conference", short: "CONF" },
  { name: "Super Bowl", short: "SB" },
] as const;

/**
 * The best possible lineup so far: one player per team, the roster's count at each position,
 * the most total points. Exact (a search over how many spots each position has used, team by
 * team; at most a few thousand states). Players with no points are ignored.
 */
export function optimalLineup(
  players: { id: string; pos: Position; teamId: string }[],
  points: (id: string) => number,
  roster: Record<Position, number>,
): { ids: string[]; total: number } {
  // Each team's best player at each position.
  const best = new Map<string, Map<Position, { id: string; pts: number }>>();
  for (const p of players) {
    const v = points(p.id);
    if (!(v > 0) || !roster[p.pos]) continue;
    const t = best.get(p.teamId) ?? new Map();
    if (!t.has(p.pos) || t.get(p.pos)!.pts < v) t.set(p.pos, { id: p.id, pts: v });
    best.set(p.teamId, t);
  }
  const pos = POSITIONS.filter((p) => roster[p] > 0);
  const key = (used: number[]) => used.join(",");
  // state: positions used so far → best total and the picks that got there.
  let states = new Map<string, { used: number[]; total: number; ids: string[] }>([[key(pos.map(() => 0)), { used: pos.map(() => 0), total: 0, ids: [] }]]);
  for (const t of best.values()) {
    const next = new Map(states);
    for (const s of states.values()) {
      pos.forEach((p, i) => {
        const c = t.get(p);
        if (!c || s.used[i] >= roster[p]) return;
        const used = s.used.map((u, j) => (j === i ? u + 1 : u));
        const k = key(used);
        const total = s.total + c.pts;
        if (!next.has(k) || next.get(k)!.total < total) next.set(k, { used, total, ids: [...s.ids, c.id] });
      });
    }
    states = next;
  }
  let top = { total: 0, ids: [] as string[] };
  for (const s of states.values()) if (s.total > top.total) top = s;
  return { ids: top.ids, total: Math.round(top.total * 100) / 100 };
}

/** A game-log column: its group ("Passing"), its label ("YDS") and how to read it from a line. */
type StatCol = { group: string; label: string; get: (l: PlayerLine & DefLine) => number | string };
const RECEIVER: StatCol[] = [
  { group: "Receiving", label: "REC", get: (l) => l.rec },
  { group: "Receiving", label: "YDS", get: (l) => l.recYds },
  { group: "Receiving", label: "TD", get: (l) => l.recTd },
  { group: "Rushing", label: "YDS", get: (l) => l.rushYds },
  { group: "Rushing", label: "TD", get: (l) => l.rushTd },
];
const STAT_COLS: Record<Position, StatCol[]> = {
  QB: [
    { group: "Passing", label: "YDS", get: (l) => l.passYds },
    { group: "Passing", label: "TD", get: (l) => l.passTd },
    { group: "Passing", label: "INT", get: (l) => l.passInt },
    { group: "Rushing", label: "YDS", get: (l) => l.rushYds },
    { group: "Rushing", label: "TD", get: (l) => l.rushTd },
  ],
  RB: [
    { group: "Rushing", label: "YDS", get: (l) => l.rushYds },
    { group: "Rushing", label: "TD", get: (l) => l.rushTd },
    { group: "Receiving", label: "REC", get: (l) => l.rec },
    { group: "Receiving", label: "YDS", get: (l) => l.recYds },
    { group: "Receiving", label: "TD", get: (l) => l.recTd },
  ],
  WR: RECEIVER,
  TE: RECEIVER,
  K: [
    { group: "Kicking", label: "FG", get: (l) => l.fg },
    { group: "Kicking", label: "LONG", get: (l) => (l.fgYds.length ? Math.max(...l.fgYds) : "–") },
    { group: "Kicking", label: "50+", get: (l) => l.fgYds.filter((y) => y >= 50).length },
    { group: "Kicking", label: "XP", get: (l) => l.xp },
  ],
  DEF: [
    { group: "Defense", label: "SACK", get: (l) => l.sacks },
    { group: "Defense", label: "INT", get: (l) => l.ints },
    { group: "Defense", label: "FR", get: (l) => l.fumRec },
    { group: "Defense", label: "TD", get: (l) => l.td },
    { group: "Defense", label: "PA", get: (l) => l.pointsAllowed },
  ],
};
const EXTRA_COLS: StatCol[] = [
  { group: "Misc", label: "FUM", get: (l) => l.fumLost },
  { group: "Misc", label: "2PT", get: (l) => l.twoPt },
];

/**
 * A player's playoff game log as columns: the position's usual ones (a QB's passing and rushing,
 * a kicker's field goals, a defense's sacks to points allowed), plus fumbles lost or two-point
 * conversions when any game had one. One row of values per line (null: no line that round).
 */
export function statColumns(pos: Position, lines: (PlayerLine | DefLine | null)[]): { head: { group: string; label: string }[]; rows: ((number | string)[] | null)[] } {
  const all = lines.filter((l): l is PlayerLine | DefLine => Boolean(l)) as (PlayerLine & DefLine)[];
  const cols = [...STAT_COLS[pos], ...(pos === "DEF" || pos === "K" ? [] : EXTRA_COLS.filter((c) => all.some((l) => Number(c.get(l)) > 0)))];
  return {
    head: cols.map((c) => ({ group: c.group, label: c.label })),
    rows: lines.map((l) => (l ? cols.map((c) => c.get(l as PlayerLine & DefLine)) : null)),
  };
}

/** The scoring rules as a table for the info pop-up: groups of [what, points]. */
export function pfScoringTable(s: PfSettings): { group: string; rows: [string, string][] }[] {
  const sc = s.scoring;
  const pt = (n: number) => `${n > 0 ? "+" : ""}${n}`;
  const per = (yds: number) => `+1 per ${yds} yds`;
  const bonus = (n: number, what: string): [string, string][] => (n ? [[what, pt(n)]] : []);
  return [
    {
      group: "Passing",
      rows: [["Yards", per(sc.pass_yds_per_pt)], ["Touchdown", pt(sc.pass_td)], ["Interception", pt(sc.pass_int)], ...bonus(sc.bonus_pass_300, "300+ yard game")],
    },
    {
      group: "Rushing and receiving",
      rows: [
        ["Yards", per(sc.yds_per_pt)],
        ["Rushing touchdown", pt(sc.rush_td)],
        ["Receiving touchdown", pt(sc.rec_td)],
        ["Reception", sc.rec ? pt(sc.rec) : "0"],
        ...bonus(sc.bonus_rush_100, "100+ rushing yard game"),
        ...bonus(sc.bonus_rec_100, "100+ receiving yard game"),
      ],
    },
    { group: "Other", rows: [["Fumble lost", pt(sc.fum_lost)], ["Two-point conversion", pt(sc.two_pt)]] },
    { group: "Kicking", rows: [["Field goal, under 40", pt(sc.fg)], ["Field goal, 40-49", pt(sc.fg_40)], ["Field goal, 50+", pt(sc.fg_50)], ["Extra point", pt(sc.xp)]] },
    {
      group: "Defense",
      rows: [
        ["Sack", pt(sc.def_sack)],
        ["Interception", pt(sc.def_int)],
        ["Fumble recovery", pt(sc.def_fum_rec)],
        ["Touchdown", pt(sc.def_td)],
        ["Safety", pt(sc.def_safety)],
        ...(sc.def_points_allowed ? ([["0 points allowed", "+10"], ["1-6 allowed", "+7"], ["7-13 allowed", "+4"], ["14-20 allowed", "+1"], ["21-27 allowed", "0"], ["28-34 allowed", "-1"], ["35+ allowed", "-4"]] as [string, string][]) : []),
      ],
    },
  ];
}
