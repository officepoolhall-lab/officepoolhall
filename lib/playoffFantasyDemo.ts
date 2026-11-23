// Made-up playoff games and player stats for a demo Playoff Fantasy pool
// (settings.playoff_fantasy.demo_sim). The bracket follows the real seeding rules from the
// seeds it's given; each game's box score is built from the teams' depth charts, so the
// starters get most of the numbers, and the final score comes from those numbers. Seeded, so the
// same pool shows the same results on every page and every visit.

import type { PlayoffGame, Seeded } from "./nflPlayoffs";
import { defId, emptyLine, type DefLine, type PlayerLine, type Position } from "./playoffFantasy";

type Player = { id: string; name: string; pos: Position; teamId: string; depth?: number | null };
type Team = { id: string; espnId: string | null };
export type Sim = {
  games: PlayoffGame[];
  /** Player id → his line in each round (null: didn't play that round). */
  lines: Map<string, (PlayerLine | null)[]>;
  /** Defense id ("DEF-<espn id>") → its line in each round. */
  defs: Map<string, (DefLine | null)[]>;
};

const DATES = ["2027-01-16T21:30:00Z", "2027-01-23T21:30:00Z", "2027-01-31T20:00:00Z", "2027-02-14T23:30:00Z"];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One team's offense in one game: its players' lines, and the points they add up to. */
function offense(r: () => number, roster: Player[]) {
  const at = (pos: Position) => roster.filter((p) => p.pos === pos).sort((a, b) => (a.depth ?? 99) - (b.depth ?? 99) || a.name.localeCompare(b.name));
  const [qb] = at("QB");
  const rbs = at("RB");
  const wrs = at("WR");
  const tes = at("TE");
  const [k] = at("K");
  const lines = new Map<string, PlayerLine>();
  const line = (p: Player | undefined) => {
    if (!p) return emptyLine();
    if (!lines.has(p.id)) lines.set(p.id, emptyLine());
    return lines.get(p.id)!;
  };
  const between = (lo: number, hi: number) => Math.round(lo + r() * (hi - lo));
  const count = (avg: number) => {
    // A small Poisson-like count around the average.
    let n = 0;
    let p = Math.exp(-avg);
    let c = p;
    const u = r();
    while (u > c && n < 6) {
      n++;
      p *= avg / n;
      c += p;
    }
    return n;
  };

  // Passing: the starter throws it all.
  const passYds = between(165, 335);
  const passTd = count(1.9);
  const passInt = count(0.7);
  const q = line(qb);
  q.passYds = passYds;
  q.passTd = passTd;
  q.passInt = passInt;
  q.rushYds = between(0, 38);
  const qbRushTd = r() < 0.12 ? 1 : 0;
  q.rushTd = qbRushTd;

  // Running: the lead back carries most of it.
  const rb1 = line(rbs[0]);
  rb1.rushYds = between(45, 135);
  rb1.rushTd = count(0.65);
  if (r() < 0.1) rb1.fumLost = 1;
  const rb2 = rbs[1] ? line(rbs[1]) : null;
  if (rb2) {
    rb2.rushYds = between(8, 45);
    rb2.rushTd = r() < 0.12 ? 1 : 0;
  }

  // Catching: the passing yards and touchdowns split among the targets, starters first.
  const targets: [Player | undefined, number][] = [
    [wrs[0], 0.29], [wrs[1], 0.21], [wrs[2], 0.12], [tes[0], 0.16], [rbs[0], 0.1], [wrs[3], 0.05], [tes[1], 0.04], [rbs[1], 0.03],
  ];
  const live = targets.filter(([p]) => p);
  const weights = live.map(([, w]) => w * (0.6 + r() * 0.8));
  const sum = weights.reduce((a, b) => a + b, 0);
  let yardsLeft = passYds;
  live.forEach(([p], i) => {
    const l = line(p);
    const y = i === live.length - 1 ? yardsLeft : Math.round((passYds * weights[i]) / sum);
    yardsLeft -= y;
    l.recYds += Math.max(0, y);
    l.rec += Math.max(y > 0 ? 1 : 0, Math.round(y / (9 + r() * 5)));
  });
  for (let t = 0; t < passTd; t++) {
    let u = r() * sum;
    const i = Math.max(0, weights.findIndex((w) => (u -= w) <= 0));
    line(live[i]?.[0]).recTd += 1;
  }

  // Kicking: extra points after touchdowns, a few field goals.
  const tds = passTd + qbRushTd + rb1.rushTd + (rb2?.rushTd ?? 0);
  const kl = line(k);
  kl.xp = Array.from({ length: tds }, () => r() < 0.95).filter(Boolean).length;
  const fgs = count(1.7);
  kl.fgYds = Array.from({ length: fgs }, () => between(21, 56));
  kl.fg = fgs;
  const points = tds * 6 + kl.xp + fgs * 3;
  return { lines, points, passInt, fumLost: rb1.fumLost };
}

/** The demo's playoffs, played through `through` rounds; the next round's games are set and not started. */
export function simulatePlayoffs(picture: { AFC: Seeded[]; NFC: Seeded[] }, players: Player[], teams: Team[], through: number, seed: number): Sim {
  const idOf = new Map(teams.map((t) => [t.espnId ?? "", t.id]));
  const rosterOf = (espnId: string) => players.filter((p) => p.teamId === idOf.get(espnId));
  const games: PlayoffGame[] = [];
  const lines = new Map<string, (PlayerLine | null)[]>();
  const defs = new Map<string, (DefLine | null)[]>();
  const put = <T,>(m: Map<string, (T | null)[]>, id: string, round: number, v: T) => {
    const row = m.get(id) ?? [null, null, null, null];
    row[round] = v;
    m.set(id, row);
  };
  let n = 0;
  const side = (t: Seeded, homeAway: "home" | "away", score: number, lost: boolean) => ({
    espnId: t.espnId, name: t.name, fullName: t.fullName, abbreviation: t.abbreviation, logo: t.logo, homeAway, score, lost,
  });

  /** Play (or just schedule) one game; returns the winner once it's played. */
  const play = (round: number, away: Seeded, home: Seeded): Seeded | null => {
    const id = `demo-${round}-${away.espnId}-${home.espnId}`;
    if (round >= through) {
      games.push({ id, round, date: DATES[round], state: "pre", teams: [side(away, "away", 0, false), side(home, "home", 0, false)] });
      return null;
    }
    const r = rng(seed * 7919 + ++n * 104729);
    const a = offense(r, rosterOf(away.espnId));
    const h = offense(r, rosterOf(home.espnId));
    const defense = (opp: ReturnType<typeof offense>, oppScore: number): DefLine => ({
      sacks: Math.round(r() * 5),
      ints: opp.passInt,
      fumRec: opp.fumLost,
      td: r() < 0.06 ? 1 : 0,
      safeties: 0,
      pointsAllowed: oppScore,
    });
    let as = a.points;
    let hs = h.points;
    const aDef = defense(h, hs);
    const hDef = defense(a, as);
    as += aDef.td * 7;
    hs += hDef.td * 7;
    // No ties in the playoffs: a field goal in overtime for the home side (or, half the time, the road side).
    if (as === hs) {
      if (r() < 0.5) hs += 3;
      else as += 3;
    }
    aDef.pointsAllowed = hs;
    hDef.pointsAllowed = as;
    for (const [pid, l] of a.lines) put(lines, pid, round, l);
    for (const [pid, l] of h.lines) put(lines, pid, round, l);
    put(defs, defId(away.espnId), round, aDef);
    put(defs, defId(home.espnId), round, hDef);
    games.push({ id, round, date: DATES[round], state: "post", teams: [side(away, "away", as, as < hs), side(home, "home", hs, hs < as)] });
    return as > hs ? away : home;
  };

  const champs: Partial<Record<"AFC" | "NFC", Seeded | null>> = {};
  for (const c of ["AFC", "NFC"] as const) {
    const s = (k: number) => picture[c].find((t) => t.seed === k)!;
    const wc = [play(0, s(7), s(2)), play(0, s(6), s(3)), play(0, s(5), s(4))];
    if (wc.some((w) => !w)) {
      champs[c] = null;
      continue;
    }
    const left = (wc as Seeded[]).sort((x, y) => x.seed - y.seed);
    const div = [play(1, left[2], s(1)), play(1, left[1], left[0])];
    if (div.some((w) => !w)) {
      champs[c] = null;
      continue;
    }
    const [hi, lo] = (div as Seeded[]).sort((x, y) => x.seed - y.seed);
    champs[c] = play(2, lo, hi);
  }
  if (champs.AFC && champs.NFC) play(3, champs.AFC, champs.NFC);
  return { games, lines, defs };
}
