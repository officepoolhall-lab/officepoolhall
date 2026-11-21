// NFL Playoff Fantasy: each entry builds one roster before the Wild Card round, taking exactly
// one player from each playoff team, and scores fantasy points through the Super Bowl. Every
// player on the roster counts every week; a player stops scoring when his team is out. The
// rules live in pools.settings.playoff_fantasy (settings.format = "playoff_fantasy").

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
  /** Kicker: each field goal and extra point made. */
  fg: number;
  xp: number;
  /** Defense. */
  def_sack: number;
  def_int: number;
  def_fum_rec: number;
  def_td: number;
  /** Score the defense on points allowed (the usual 10 for a shutout down to -4 for 35+). */
  def_points_allowed: boolean;
};

export type PfSettings = {
  /** When lineups lock (the first Wild Card kickoff), ISO; null until the commissioner sets it. */
  lock_at: string | null;
  roster: Record<Position, number>;
  scoring: PfScoring;
};

/** The most common league scoring (full PPR), on a 14-player roster: one from each playoff team. */
export const PF_DEFAULT: PfSettings = {
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
    xp: 1,
    def_sack: 1,
    def_int: 2,
    def_fum_rec: 2,
    def_td: 6,
    def_points_allowed: true,
  },
};

export function pfSettings(settings: unknown): PfSettings {
  const s = block(settings, "playoff_fantasy");
  const r = (s.roster ?? {}) as Record<string, unknown>;
  const sc = (s.scoring ?? {}) as Record<string, unknown>;
  const d = PF_DEFAULT.scoring;
  const n = (k: keyof PfScoring, lo: number, hi: number) => num(sc[k], lo, hi) ?? (d[k] as number);
  return {
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
      xp: n("xp", 0, 20),
      def_sack: n("def_sack", 0, 20),
      def_int: n("def_int", 0, 20),
      def_fum_rec: n("def_fum_rec", 0, 20),
      def_td: n("def_td", 0, 20),
      def_points_allowed: sc.def_points_allowed !== false,
    },
  };
}

export const rosterSize = (s: PfSettings) => POSITIONS.reduce((t, p) => t + s.roster[p], 0);

export function pfSettingsError(s: PfSettings): string | null {
  const size = rosterSize(s);
  if (size < 1) return "The roster needs at least one spot.";
  if (size > 14) return `The roster has ${size} spots, but only 14 teams make the playoffs (one player per team).`;
  return null;
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** "PPR", "Half PPR" or "Standard". */
export const recLabel = (rec: number) => (rec === 1 ? "PPR" : rec === 0.5 ? "Half PPR" : rec === 0 ? "Standard (no points per catch)" : `${rec} per catch`);

/** The rules in plain words, for Home and the settings summary. */
export function pfRules(s: PfSettings): string[] {
  const sc = s.scoring;
  const spots = POSITIONS.filter((p) => s.roster[p] > 0).map((p) => `${s.roster[p]} ${p}`).join(", ");
  const bonuses = [
    sc.bonus_pass_300 ? `${signed(sc.bonus_pass_300)} for 300 passing yards` : null,
    sc.bonus_rush_100 ? `${signed(sc.bonus_rush_100)} for 100 rushing yards` : null,
    sc.bonus_rec_100 ? `${signed(sc.bonus_rec_100)} for 100 receiving yards` : null,
  ].filter(Boolean);
  return [
    `Build one roster of ${rosterSize(s)}: ${spots}.`,
    "Only one player from each playoff team.",
    "Every player counts every week, from the Wild Card round through the Super Bowl. Most total points wins.",
    `Scoring: ${recLabel(sc.rec)}, ${sc.pass_td} per passing touchdown, ${sc.rush_td} per rushing or receiving touchdown, 1 point per ${sc.pass_yds_per_pt} passing yards and per ${sc.yds_per_pt} rushing or receiving yards.`,
    ...(bonuses.length ? [`Yardage bonuses: ${bonuses.join(", ")}.`] : []),
  ];
}

// ---------------------------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------------------------

/** One player's line in one game. */
export type PlayerLine = { passYds: number; passTd: number; passInt: number; rushYds: number; rushTd: number; rec: number; recYds: number; recTd: number; fumLost: number; fg: number; xp: number };
/** One team defense's line in one game. */
export type DefLine = { sacks: number; ints: number; fumRec: number; td: number; pointsAllowed: number };

export const emptyLine = (): PlayerLine => ({ passYds: 0, passTd: 0, passInt: 0, rushYds: 0, rushTd: 0, rec: 0, recYds: 0, recTd: 0, fumLost: 0, fg: 0, xp: 0 });

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
      l.fg * sc.fg +
      l.xp * sc.xp,
  );
}

/** The usual points-allowed scale: 10 for a shutout down to -4 for 35 or more. */
export const pointsAllowedScore = (pa: number) => (pa === 0 ? 10 : pa <= 6 ? 7 : pa <= 13 ? 4 : pa <= 20 ? 1 : pa <= 27 ? 0 : pa <= 34 ? -1 : -4);

export function defPoints(d: DefLine, sc: PfScoring): number {
  return round2(d.sacks * sc.def_sack + d.ints * sc.def_int + d.fumRec * sc.def_fum_rec + d.td * sc.def_td + (sc.def_points_allowed ? pointsAllowedScore(d.pointsAllowed) : 0));
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
export function defLine(team: BoxTeam, opponent: BoxTeam | undefined, opponentScore: number): DefLine {
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
    pointsAllowed: opponentScore,
  };
}

/** A team defense's id in the player list. */
export const defId = (teamEspnId: string) => `DEF-${teamEspnId}`;

export const ROUNDS = [
  { week: 1, name: "Wild Card", short: "WC" },
  { week: 2, name: "Divisional", short: "DIV" },
  { week: 3, name: "Conference", short: "CONF" },
  { week: 5, name: "Super Bowl", short: "SB" },
] as const;
