#!/usr/bin/env node
// Turn parse.py's JSON into one idempotent SQL import for the NCAA Supercontest pool.
//
//   node build.mjs <parsed.json> --pool-slug 2026-ncaa-supercontest --season 2026 \
//        --out <import.sql> --report <report.json> [--reserve-weeks 8] \
//        [--partial 7 --lock-at 2026-10-17T11:00:00-05:00 [--allow-postponed]]
//
// Matches every sheet game to exactly one final ESPN event (both teams AND the score must
// agree), converts the sheet's spreads to locked_home_spread and picks to home/away, and
// fails loudly on anything it can't match. --partial N imports an in-progress week N: games
// the sheet hasn't decided match on teams alone and keep ESPN's live status, every game locks
// at --lock-at, and the app's score poller grades the rest as they finish. The output contains names and emails: keep it
// outside the repo. Node 22+, no dependencies.
import { readFileSync, writeFileSync } from "node:fs";

const UA = "Mozilla/5.0 (compatible; OfficePoolHall/1.0)";
const BASE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football";
const COMMISSIONERS = ["cross.brooks.a@gmail.com", "noah.brown94@gmail.com"];
const SEGMENTS = [
  { name: "Segment 1", first_week: 1 },
  { name: "Segment 2", first_week: 6 },
  { name: "Segment 3", first_week: 11 },
];
const TZ = "America/Chicago";
const PICKS_PER_WEEK = 5;

// Same as supabase/functions/_shared/espn.ts.
const SHORT_CONFERENCE = {
  "Atlantic Coast Conference": "ACC",
  "Southeastern Conference": "SEC",
  "Big Ten Conference": "Big Ten",
  "Big 12 Conference": "Big 12",
  "Big East Conference": "Big East",
  "Pac-12 Conference": "Pac-12",
  "American Conference": "American",
  "Atlantic 10 Conference": "A-10",
  "Mountain West Conference": "Mountain West",
  "West Coast Conference": "WCC",
  "Missouri Valley Conference": "MVC",
  "Mid-American Conference": "MAC",
  "Conference USA": "C-USA",
  "Sun Belt Conference": "Sun Belt",
};

// Normalized sheet name → normalized canonical name. Applied to both the sheet and every
// ESPN name field, so either spelling lands on the same key.
const ALIASES = {
  "miami fl": "miami",
  "miami florida": "miami",
  fau: "florida atlantic",
  fiu: "florida international",
  uconn: "connecticut",
  mississippi: "ole miss",
  cal: "california",
  ndsu: "north dakota state",
  usf: "south florida",
  umass: "massachusetts",
  pitt: "pittsburgh",
  "app state": "appalachian state",
  "southern miss": "southern mississippi",
  "sam houston state": "sam houston",
  "central florida": "ucf",
  "southern california": "usc",
  "louisiana state": "lsu",
  "brigham young": "byu",
  "southern methodist": "smu",
  "texas san antonio": "utsa",
  "ut san antonio": "utsa",
  "alabama birmingham": "uab",
  "north carolina state": "nc state",
  "kennesaw": "kennesaw state",
  "jax state": "jacksonville state",
  "ul monroe": "louisiana monroe",
  ulm: "louisiana monroe",
  "louisiana lafayette": "louisiana",
  "texas am": "texas a and m",
  "texas a m": "texas a and m",
  "hawai i": "hawaii",
  tennesse: "tennessee", // typo seen in the sheet
  "western ky": "western kentucky",
  wku: "western kentucky",
  "middle tennessee state": "middle tennessee",
  mtsu: "middle tennessee",
};

function norm(s) {
  let t = String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^#\d+\s+/, "")
    .replace(/&/g, " and ")
    .replace(/\buniv(ersity)?\b\.?/g, " ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  t = t.replace(/\bst\b/g, "state");
  return ALIASES[t] ?? ALIASES[t.replace(/\bstate\b/g, "st")] ?? t;
}

function teamKeys(t) {
  // displayName ('Michigan State Spartans'), short ('Michigan St'), location ('Michigan State'),
  // abbreviation ('MSU'). The mascot alone is too ambiguous to use.
  return new Set([t.displayName, t.shortDisplayName, t.location, t.abbreviation].filter(Boolean).map(norm));
}

function args() {
  const a = process.argv.slice(2);
  const o = { input: null };
  const flags = new Set(["allow-postponed"]); // take no value
  for (let i = 0; i < a.length; i++) {
    if (flags.has(a[i].slice(2))) o[a[i].slice(2)] = true;
    else if (a[i].startsWith("--")) o[a[i].slice(2)] = a[++i];
    else o.input = a[i];
  }
  for (const k of ["input", "pool-slug", "season", "out", "report"]) {
    if (!o[k]) {
      console.error(`missing ${k === "input" ? "<parsed.json>" : "--" + k}`);
      process.exit(2);
    }
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(o["pool-slug"])) {
    console.error("bad --pool-slug");
    process.exit(2);
  }
  o.season = Number(o.season);
  // --reserve-weeks 7 (or 7-8): hold those week numbers with an empty draft placeholder so the
  // app's next slate (numbered max(week)+1) lands on the right week. See README.
  o.reserve = [];
  if (o["reserve-weeks"]) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(o["reserve-weeks"]);
    if (!m) {
      console.error("bad --reserve-weeks (use N or N-M)");
      process.exit(2);
    }
    for (let w = Number(m[1]); w <= Number(m[2] ?? m[1]); w++) o.reserve.push(w);
  }
  // --partial 7 --lock-at <ISO>: week 7 is in progress (see README "importing an in-progress week").
  if (o.partial !== undefined || o["lock-at"] !== undefined) {
    if (!/^\d+$/.test(o.partial ?? "")) {
      console.error("bad --partial (use the week number)");
      process.exit(2);
    }
    o.partial = Number(o.partial);
    // Require an explicit offset so the deadline can't silently land in the machine's zone.
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?(\.\d+)?(Z|[+-]\d\d:\d\d)$/.test(o["lock-at"] ?? "") || isNaN(Date.parse(o["lock-at"]))) {
      console.error("--partial needs --lock-at <ISO timestamp with offset>, e.g. 2026-10-17T11:00:00-05:00");
      process.exit(2);
    }
    o.lockAt = new Date(o["lock-at"]).toISOString();
    if (o.reserve.includes(o.partial)) {
      console.error(`--reserve-weeks can't include the partial week ${o.partial}`);
      process.exit(2);
    }
  } else o.partial = null;
  if (o["allow-postponed"] && o.partial === null) {
    console.error("--allow-postponed only applies with --partial");
    process.exit(2);
  }
  return o;
}

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA } });
    if (res.ok) return res.json();
    if (attempt >= 3) throw new Error(`ESPN ${res.status} for ${url}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

const boardCache = new Map();
async function scoreboard(season, week, fbsOnly) {
  const k = `${week}:${fbsOnly}`;
  if (!boardCache.has(k)) {
    const url = `${BASE}/scoreboard?dates=${season}&seasontype=2&week=${week}${fbsOnly ? "&groups=80" : ""}&limit=300`;
    boardCache.set(k, getJson(url).then((d) => d.events ?? []));
  }
  return boardCache.get(k);
}

/**
 * ESPN conference group id → conference name. Football's /groups endpoint only lists
 * divisions ('FBS', 'FCS', 'NCAA Division II') with a truncated team list, so the walker in
 * _shared/espn.ts yields 'FBS' or nothing; that would overwrite real conferences already
 * stored (ingest_espn keeps a stored value only when the payload is null). Instead map each
 * competitor's team.conferenceId through scoreboard/conferences, keeping only real
 * conferences (those with a parent group), and send null for anything unknown.
 */
async function conferences() {
  const data = await getJson(`${BASE}/scoreboard/conferences`);
  const out = new Map();
  for (const c of data.conferences ?? []) {
    if (!c.parentGroupId || !c.groupId || !c.name || /^(FBS|FCS)\b|division/i.test(c.name)) continue;
    out.set(String(c.groupId), SHORT_CONFERENCE[c.name] ?? String(c.name).replace(/ Conference$/, ""));
  }
  return out;
}

function mapStatus(type) {
  const name = type?.name ?? "";
  if (name.includes("POSTPONED")) return "postponed";
  if (name.includes("CANCELED") || name.includes("CANCELLED") || name.includes("FORFEIT")) return "cancelled";
  if (type?.completed || type?.state === "post") return "final";
  if (type?.state === "in") return "in_progress";
  return "scheduled";
}

const rank = (r) => (r?.current && r.current >= 1 && r.current <= 25 ? r.current : null);

function venueLabel(address) {
  if (!address?.city) return null;
  const region = address.state || address.country;
  return region ? `${address.city}, ${region}` : address.city;
}

/** Which competitor of the event a sheet team name refers to (index into [home, away]), or -1. */
function sideOf(ev, name) {
  const k = norm(name);
  const hits = ev.sides.map((s, i) => (s.keys.has(k) ? i : -1)).filter((i) => i >= 0);
  return hits.length === 1 ? hits[0] : -1;
}

function prepare(e) {
  const c = e.competitions?.[0];
  const home = c?.competitors?.find((x) => x.homeAway === "home");
  const away = c?.competitors?.find((x) => x.homeAway === "away");
  if (!home || !away) return null;
  return { e, c, home, away, sides: [home, away].map((x) => ({ x, keys: teamKeys(x.team) })) };
}

/** Events where both sheet teams match, opposite sides. */
function candidates(events, g) {
  const out = [];
  for (const e of events) {
    const ev = prepare(e);
    if (!ev) continue;
    const a = sideOf(ev, g.teams[0].name);
    const b = sideOf(ev, g.teams[1].name);
    if (a >= 0 && b >= 0 && a !== b) out.push({ ev, sideIdx: [a, b] });
  }
  return out;
}

function scoreAgrees(cand, g) {
  const { ev, sideIdx } = cand;
  const wi = g.teams.findIndex((t) => t.name === g.outcome.winner);
  const sc = (i) => Number(ev.sides[sideIdx[i]].x.score);
  return (
    mapStatus(ev.c.status?.type ?? ev.e.status?.type) === "final" &&
    sc(wi) === g.outcome.w_score &&
    sc(1 - wi) === g.outcome.l_score
  );
}

/** yyyy-mm-dd in Central for an instant. */
const localDate = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
const nextDay = (d) => {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
};

async function main() {
  const o = args();
  const data = JSON.parse(readFileSync(o.input, "utf8"));
  const problems = [];
  const report = { pool_slug: o["pool-slug"], season: o.season, weeks: [], aliases_used: {}, fallbacks: [], rank_diffs: 0, trimmed: [] };

  const rosterByName = new Map(data.roster.map((r) => [r.name, r]));
  for (const c of COMMISSIONERS) {
    if (!data.roster.some((r) => r.email === c)) problems.push(`commissioner ${c} isn't on the roster`);
  }

  const confs = await conferences().catch((err) => {
    console.error("warning: conferences unavailable:", err.message);
    return new Map();
  });

  // parse.py and build.mjs must agree on which week is in progress.
  const parsedPartial = data.partial_week ?? null;
  if (parsedPartial !== o.partial) {
    console.error(`parsed.json was parsed with --partial ${parsedPartial ?? "(none)"} but build got --partial ${o.partial ?? "(none)"}`);
    process.exit(2);
  }
  if (o.partial !== null && data.weeks.at(-1)?.week !== o.partial) {
    console.error(`--partial ${o.partial} must be the last parsed week`);
    process.exit(2);
  }
  if (o.partial !== null && Date.parse(o.lockAt) > Date.now()) {
    console.error(`warning: --lock-at ${o["lock-at"]} is in the future; the slate is imported locked anyway (nobody can pick in the app)`);
  }

  const teams = new Map();
  const games = new Map();
  const slates = [];

  for (const w of data.weeks) {
    const partial = w.week === o.partial;
    const wr = { week: w.week, games: w.games.length, matched: 0, by_espn_week: {} };
    if (partial) Object.assign(wr, { partial: true, decided: 0, espn_status: {} });
    const slateGames = [];
    const sideByCol = new Map(); // col → { espn_id, home sheet-team index }
    for (const g of w.games) {
      // Undecided = an in-progress week's game with neither outcome nor cover yet (parse.py).
      const decided = g.decided !== false;
      if (!decided && !partial) {
        problems.push(`Week ${w.week} col ${g.col}: ${g.raw}: marked undecided outside the --partial week`);
        continue;
      }
      if (decided && (!g.outcome || !g.cover)) {
        problems.push(`Week ${w.week} col ${g.col}: ${g.raw}: no outcome/cover in the sheet`);
        continue;
      }
      for (const t of g.teams) {
        const n = norm(t.name);
        const plain = String(t.name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        if (n !== plain && n !== plain.replace(/\bst\b/g, "state")) report.aliases_used[t.name] = n;
      }
      // Week N first, then N-1 and N+1, then the same weeks without the FBS filter (FCS opponents).
      const attempts = [
        [w.week, true], [w.week - 1, true], [w.week + 1, true],
        [w.week, false], [w.week - 1, false], [w.week + 1, false],
      ].filter(([n]) => n >= 1);
      let found = null;
      let tried = [];
      for (const [n, fbs] of attempts) {
        const events = await scoreboard(o.season, n, fbs);
        const cands = candidates(events, g);
        // A decided game must also match ESPN's final score; an undecided one (the in-progress
        // week's unplayed games) matches on both teams alone.
        const good = decided ? cands.filter((c) => scoreAgrees(c, g)) : cands;
        // A decided game whose teams match but ESPN isn't final yet: say so (usually "wait").
        const notFinal = decided ? cands.map((c) => mapStatus(c.ev.c.status?.type ?? c.ev.e.status?.type)).filter((st) => st !== "final") : [];
        tried.push(
          `wk${n}${fbs ? "" : " all"}: ${cands.length} team match(es)${decided ? `, ${good.length} with score` : ""}` +
            (notFinal.length ? ` (ESPN shows ${notFinal.join("/")}; wait until it is final)` : ""),
        );
        if (good.length > 1) {
          const ids = new Set(good.map((c) => c.ev.e.id));
          if (ids.size > 1) {
            problems.push(`Week ${w.week}: ${g.raw}: ambiguous — ${good.length} ESPN events (${[...ids].join(", ")})`);
            found = "ambiguous";
            break;
          }
        }
        if (good.length >= 1) {
          found = { ...good[0], espnWeek: n, fbs };
          break;
        }
      }
      if (found === "ambiguous") continue;
      if (!found) {
        const what = decided ? `${g.outcome.winner} ${g.outcome.w_score}-${g.outcome.l_score}` : "undecided";
        problems.push(`Week ${w.week} col ${g.col}: no ESPN match for ${g.raw} (${what}); tried ${tried.join("; ")}`);
        continue;
      }
      if (found.espnWeek !== w.week || !found.fbs) {
        report.fallbacks.push({ week: w.week, game: g.raw, espn_week: found.espnWeek, fbs_filter: found.fbs });
      }
      wr.by_espn_week[found.espnWeek] = (wr.by_espn_week[found.espnWeek] ?? 0) + 1;
      wr.matched++;

      const { ev, sideIdx } = found;
      const espnId = String(ev.e.id);
      if (games.has(espnId)) problems.push(`Week ${w.week}: ${g.raw}: ESPN event ${espnId} used twice`);
      // sideIdx[i] = 0 (home) / 1 (away) for sheet team i.
      const homeTeam = sideIdx[0] === 0 ? 0 : 1; // sheet index of the home team
      const spreadIdx = g.teams.findIndex((t) => t.spread !== null);
      const homeSpread = spreadIdx === homeTeam ? g.teams[spreadIdx].spread : -g.teams[spreadIdx].spread;
      const homeScore = Number(ev.home.score);
      const awayScore = Number(ev.away.score);
      // History is final by construction (scoreAgrees); the in-progress week keeps ESPN's
      // live status, with scores only once a game has started (as _shared/espn.ts does).
      const status = partial ? mapStatus(ev.c.status?.type ?? ev.e.status?.type) : "final";
      const started = status === "in_progress" || status === "final";
      if (decided) {
        const cover = homeScore - awayScore + homeSpread;
        const coverTeam = cover === 0 ? null : g.teams[cover > 0 ? homeTeam : 1 - homeTeam].name;
        if (coverTeam !== g.cover.team) {
          problems.push(`Week ${w.week}: ${g.raw}: computed cover ${coverTeam ?? "push"} but sheet says ${g.cover.team}`);
        }
      }
      if (partial) {
        if (decided) wr.decided++;
        wr.espn_status[status] = (wr.espn_status[status] ?? 0) + 1;
        if (!decided && status === "final") (report.sheet_behind ??= []).push({ week: w.week, game: g.raw, home_score: homeScore, away_score: awayScore });
        if (status === "postponed" || status === "cancelled") {
          // --allow-postponed imports it with ESPN's status: grade_slate voids a cancelled game
          // and leaves a postponed one ungraded (the poller keeps watching it; Brooks can void it).
          if (o["allow-postponed"]) (report.postponed ??= []).push({ week: w.week, game: g.raw, status });
          else problems.push(`Week ${w.week}: ${g.raw}: ESPN says ${status}; ask Brooks how it counts, then re-run with --allow-postponed to import it as ${status}`);
        }
      }

      for (const side of [ev.home, ev.away]) {
        const t = side.team;
        teams.set(String(t.id), {
          espn_id: String(t.id),
          name: t.displayName,
          short_name: t.shortDisplayName ?? t.location ?? t.displayName,
          abbreviation: t.abbreviation,
          logo_url: t.logo ?? null,
          conference: t.conferenceId != null ? (confs.get(String(t.conferenceId)) ?? null) : null,
        });
      }
      const sheetRank = (homeIdx) => g.teams[homeIdx].rank;
      const hr = rank(ev.home.curatedRank);
      const ar = rank(ev.away.curatedRank);
      if ((sheetRank(homeTeam) ?? hr) !== hr || (sheetRank(1 - homeTeam) ?? ar) !== ar) report.rank_diffs++;
      const national = (ev.c.broadcasts ?? []).find((b) => b.market === "national") ?? ev.c.broadcasts?.[0];
      games.set(espnId, {
        espn_id: espnId,
        season: ev.e.season?.year ?? o.season,
        home_espn_id: String(ev.home.team.id),
        away_espn_id: String(ev.away.team.id),
        start_at: new Date(ev.e.date).toISOString(),
        time_tbd: ev.c.timeValid === false,
        status,
        home_score: started ? homeScore : null,
        away_score: started ? awayScore : null,
        // Only decided games must already be final with the sheet's score (checked in SQL
        // against these, which come from the sheet, not from ESPN).
        decided,
        sheet_home_score: decided ? (g.teams[homeTeam].name === g.outcome.winner ? g.outcome.w_score : g.outcome.l_score) : null,
        sheet_away_score: decided ? (g.teams[homeTeam].name === g.outcome.winner ? g.outcome.l_score : g.outcome.w_score) : null,
        neutral_site: Boolean(ev.c.neutralSite),
        tv_network: national?.names?.join("/") || null,
        home_rank: hr,
        away_rank: ar,
        venue: venueLabel(ev.c.venue?.address),
      });
      sideByCol.set(g.col, { espn_id: espnId, homeTeam, names: g.teams.map((t) => t.name) });
      // verify.mjs needs col → ESPN game to compare an in-progress week on decided games only.
      if (partial) (wr.game_map ??= []).push({ col: g.col, espn_id: espnId, decided });
      slateGames.push({ espn_id: espnId, sort_order: slateGames.length + 1, home_spread: homeSpread });
    }

    const picks = [];
    for (const e of w.entries) {
      const r = rosterByName.get(e.name);
      if (!r) {
        problems.push(`Week ${w.week}: entry ${JSON.stringify(e.name)} isn't on the roster`);
        continue;
      }
      const entryPicks = [];
      for (const p of e.picks) {
        const s = sideByCol.get(p.col);
        if (!s) continue; // its game already reported as unmatched
        const ti = s.names.indexOf(p.team);
        entryPicks.push({ email: r.email, espn_id: s.espn_id, side: ti === s.homeTeam ? "home" : "away", col: p.col, raw: p.raw });
      }
      // Brooks's rule: with more than 5 picks, only the 5 on the earliest kickoffs count
      // (sheet column order breaks ties).
      if (entryPicks.length > PICKS_PER_WEEK) {
        entryPicks.sort((a, b) => games.get(a.espn_id).start_at.localeCompare(games.get(b.espn_id).start_at) || a.col - b.col);
        const dropped = entryPicks.splice(PICKS_PER_WEEK);
        report.trimmed.push({ week: w.week, entry: e.name, kept: PICKS_PER_WEEK, dropped: dropped.map((p) => ({ col: p.col, raw: p.raw })) });
      }
      for (const { email, espn_id, side } of entryPicks) picks.push({ email, espn_id, side });
    }

    const starts = slateGames.map((sg) => games.get(sg.espn_id).start_at).sort();
    if (starts.length) {
      slates.push({
        week: w.week,
        label: `Week ${w.week}`,
        // In-progress week: every game (and the slate) locks at Brooks's deadline; history has none.
        lock_at: partial ? o.lockAt : null,
        partial,
        first_date: localDate(starts[0]),
        end_date: nextDay(localDate(starts.at(-1))),
        published_at: new Date(Date.parse(starts[0]) - 86400000).toISOString(),
        games: slateGames,
        picks,
      });
    }
    wr.picks = picks.length;
    report.weeks.push(wr);
  }

  report.problems = problems;
  writeFileSync(o.report, JSON.stringify(report, null, 1));
  if (problems.length) {
    console.error(`${problems.length} problem(s):`);
    for (const p of problems) console.error("  -", p);
    process.exit(1);
  }

  if (o.reserve.length && !slates.length) {
    console.error("--reserve-weeks needs at least one imported week");
    process.exit(2);
  }
  const imported = new Set(slates.map((s) => s.week));
  const last = slates.reduce((a, s) => (s.week > a.week ? s : a), slates[0]);
  const shift = (d, days) => {
    const t = new Date(`${d}T12:00:00Z`);
    t.setUTCDate(t.getUTCDate() + days);
    return t.toISOString().slice(0, 10);
  };
  const reserved = [];
  for (const w of o.reserve) {
    if (imported.has(w)) continue; // imported now; nothing to hold
    if (w < last.week) {
      console.error(`--reserve-weeks ${w} is before the last imported week ${last.week}`);
      process.exit(2);
    }
    reserved.push({
      week: w,
      label: placeholderLabel(w),
      first_date: shift(last.first_date, 7 * (w - last.week)),
      end_date: shift(last.end_date, 7 * (w - last.week)),
    });
  }

  const payload = {
    teams: [...teams.values()],
    games: [...games.values()],
    roster: data.roster,
    slates,
    reserved,
  };
  writeFileSync(o.out, sql(o["pool-slug"], o.season, payload));
  console.log(
    `ok: ${games.size} games, ${teams.size} teams, ${slates.length} slates, ` +
      `${slates.reduce((n, s) => n + s.picks.length, 0)} picks, ${data.roster.length} roster, ` +
      `${reserved.length} reserved week(s)${reserved.length ? " (" + reserved.map((r) => r.week).join(",") + ")" : ""} → ${o.out}`,
  );
  for (const w of report.weeks) {
    console.log(
      `  week ${w.week}: ${w.matched}/${w.games} matched, ESPN weeks ${JSON.stringify(w.by_espn_week)}, ${w.picks} picks` +
        (w.partial ? `; in progress: ${w.decided} decided in the sheet, ESPN ${JSON.stringify(w.espn_status)}, locks at ${o.lockAt}` : ""),
    );
  }
  for (const p of report.postponed ?? []) console.log(`  week ${p.week}: ${p.game} is ${p.status} on ESPN; imported as ${p.status} (--allow-postponed)`);
  for (const b of report.sheet_behind ?? []) console.log(`  week ${b.week}: ${b.game} is final on ESPN (${b.home_score}-${b.away_score} home-away) but not in the sheet yet; the app grades it`);
  for (const t of report.trimmed) console.log(`  week ${t.week}: ${t.entry} had more than ${t.kept} picks; not counted (latest kickoff): ${t.dropped.map((d) => d.raw).join(", ")}`);
  if (report.fallbacks.length) console.log(`  fallback matches: ${report.fallbacks.length} (see report)`);
}

/** Label of the empty draft that holds a week number until its sheet results are imported. */
const placeholderLabel = (w) => `Week ${w} (pending sheet import)`;

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

function sql(slug, season, payload) {
  const json = JSON.stringify(payload);
  if (json.includes("$json$")) throw new Error("payload contains the dollar-quote tag");
  return `-- NCAA Supercontest history import (scripts/import/supercontest/build.mjs).
-- Generated ${new Date().toISOString()}. Contains names and emails: never commit this file.
-- One statement, so it is all-or-nothing under any client. Idempotent: re-running replaces
-- these weeks' slates/picks with the sheet's and leaves everything else alone.
do $import$
declare
  v_slug constant text := ${lit(slug)};
  v_season constant int := ${season};
  v_commissioners constant text[] := array[${COMMISSIONERS.map(lit).join(", ")}];
  v_data constant jsonb := $json$${json}$json$::jsonb;
  v_pool pools%rowtype;
  v_slate record;
  v_slate_id uuid;
  v_n int;
  v_first_start timestamptz;
begin
  -- Guardrails: the pool must exist and be an ATS football pool for this season.
  select * into v_pool from pools where slug = v_slug for update;
  if not found then
    raise exception 'Pool % does not exist; create it first', v_slug;
  end if;
  if v_pool.sport <> 'ncaaf' or v_pool.settings->>'pick_type' <> 'ats' or v_pool.season <> v_season then
    raise exception 'Pool % is %/%/% — expected ncaaf/ats/%', v_slug, v_pool.sport,
      v_pool.settings->>'pick_type', v_pool.season, v_season;
  end if;
  -- The grader scores with the pool's own rules, and once a non-draft slate exists
  -- guard_pool_settings freezes most of them. Refuse unless they are the sheet's rules:
  -- 5 picks, 1 point per cover and 0 per loss, no confidence, no upset bonus, missed week = 0.
  if coalesce(jsonb_typeof(v_pool.settings->'confidence'), 'null') <> 'null'
     or coalesce(jsonb_typeof(v_pool.settings->'upset_bonus'), 'null') <> 'null'
     or coalesce(v_pool.settings->>'missed_week', 'zero') <> 'zero'
     or (v_pool.settings->'scoring'->>'win')::numeric is distinct from 1
     or (v_pool.settings->'scoring'->>'loss')::numeric is distinct from 0
     or (v_pool.settings->>'picks_per_slate')::int is distinct from 5 then
    raise exception 'Pool % rules differ from the sheet (need picks_per_slate 5, scoring win 1 / loss 0, confidence null, upset_bonus null, missed_week zero): %',
      v_slug, jsonb_build_object('picks_per_slate', v_pool.settings->'picks_per_slate', 'scoring', v_pool.settings->'scoring',
        'confidence', v_pool.settings->'confidence', 'upset_bonus', v_pool.settings->'upset_bonus',
        'missed_week', v_pool.settings->'missed_week');
  end if;

  -- Fail closed if any imported or reserved week number is already used by a slate this
  -- import doesn't own. The app numbers a new slate max(week)+1, so after importing weeks 1-6
  -- an in-app slate for the next real week becomes week 7; re-importing week 7 must not
  -- overwrite it. Owned = a non-draft slate whose games are all this sheet week's games, or
  -- our untouched empty placeholder draft.
  for v_slate in
    select s.id, s.week, s.status, s.label, x.games, x.placeholder
    from slates s
    join (
      select (j->>'week')::int as week, j->'games' as games, false as placeholder from jsonb_array_elements(v_data->'slates') j
      union all
      select (j->>'week')::int, '[]'::jsonb, true from jsonb_array_elements(v_data->'reserved') j
    ) x on x.week = s.week
    where s.pool_id = v_pool.id
  loop
    if v_slate.status = 'draft' then
      if v_slate.label is distinct from ('Week ' || v_slate.week || ' (pending sheet import)')
         or exists (select 1 from slate_games where slate_id = v_slate.id)
         or exists (select 1 from picks where slate_id = v_slate.id) then
        raise exception 'Week % already has an in-app draft slate (%) that this import did not create; renumber or delete it first',
          v_slate.week, v_slate.label;
      end if;
    elsif v_slate.placeholder then
      raise exception 'Week % is reserved for a later sheet import but already has an in-app % slate (%)',
        v_slate.week, v_slate.status, v_slate.label;
    elsif exists (
      select 1 from slate_games sg join games g on g.id = sg.game_id
      where sg.slate_id = v_slate.id
        and g.espn_id not in (select x->>'espn_id' from jsonb_array_elements(v_slate.games) x)
    ) then
      raise exception 'Week % already has an in-app % slate (%) with games that are not the sheet''s week %; refusing to overwrite it',
        v_slate.week, v_slate.status, v_slate.label, v_slate.week;
    end if;
  end loop;

  -- Teams and games, through the same upsert the schedule sync uses.
  perform ingest_espn('ncaaf', v_data->'teams', v_data->'games');
  -- Every game the sheet has decided must now be final with the sheet's score (sheet_*_score
  -- come from the workbook, separately from the ESPN scores ingested above). An in-progress
  -- week's undecided games only have to exist; the score poller finishes them.
  select count(*) into v_n
  from jsonb_to_recordset(v_data->'games') x(espn_id text, sheet_home_score int, sheet_away_score int, decided boolean)
  join games g on g.espn_id = x.espn_id and g.sport = 'ncaaf'
  where coalesce(x.decided, true)
    and g.status = 'final' and g.home_score = x.sheet_home_score and g.away_score = x.sheet_away_score;
  if v_n <> (select count(*) from jsonb_array_elements(v_data->'games') x where coalesce((x->>'decided')::boolean, true)) then
    raise exception 'Only % of % decided games ingested as final with matching scores', v_n,
      (select count(*) from jsonb_array_elements(v_data->'games') x where coalesce((x->>'decided')::boolean, true));
  end if;
  select count(*) into v_n
  from jsonb_to_recordset(v_data->'games') x(espn_id text)
  join games g on g.espn_id = x.espn_id and g.sport = 'ncaaf';
  if v_n <> jsonb_array_length(v_data->'games') then
    raise exception 'Only % of % games ingested', v_n, jsonb_array_length(v_data->'games');
  end if;

  -- Accounts for roster emails that don't have one (no email is sent; the person signs
  -- in later with a magic link to the same address). Same shape as supabase/seed.sql.
  with roster as (
    select * from jsonb_to_recordset(v_data->'roster') r(name text, email text, paid boolean)
  ), new_users as (
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    )
    select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
           r.email, '', now(), '{"provider":"email","providers":["email"]}',
           jsonb_build_object('display_name', r.name), now(), now(), '', '', '', ''
    from roster r
    where not exists (select 1 from auth.users u where lower(u.email) = r.email)
    returning id, email
  )
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), id, id::text, 'email',
         jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
         now(), now(), now()
  from new_users;
  get diagnostics v_n = row_count;
  raise notice 'created % account(s)', v_n;

  drop table if exists _roster;
  create temp table _roster on commit drop as
  select r.name, r.email, r.paid, u.id as user_id
  from jsonb_to_recordset(v_data->'roster') r(name text, email text, paid boolean)
  join auth.users u on lower(u.email) = r.email;
  if (select count(*) from _roster) <> jsonb_array_length(v_data->'roster')
     or (select count(distinct user_id) from _roster) <> jsonb_array_length(v_data->'roster') then
    raise exception 'Roster emails don''t map 1:1 to accounts';
  end if;
  if (select count(*) from _roster r join profiles p on p.id = r.user_id) <> (select count(*) from _roster) then
    raise exception 'Some roster accounts have no profile';
  end if;

  -- profiles are global, so only name accounts nobody has named yet: ones this import
  -- created (already named via raw_user_meta_data) and ones still on handle_new_user's
  -- default (the email's local part). Someone's chosen name is left alone.
  update profiles p set display_name = r.name, name_confirmed = true,
    first_name = (split_display_name(r.name)).first_name, last_name = (split_display_name(r.name)).last_name
  from _roster r
  where p.id = r.user_id and p.display_name is distinct from r.name
    and (coalesce(trim(p.display_name), '') = '' or p.display_name = split_part(r.email, '@', 1));

  -- Members. joined_at is backdated to the first imported week so zero-pick weeks count as missed.
  select min(start_at) into v_first_start
  from games where espn_id in (select x->>'espn_id' from jsonb_array_elements(v_data->'games') x);
  insert into pool_members (pool_id, user_id, role, paid, joined_at)
  select v_pool.id, r.user_id, 'player', r.paid, v_first_start - interval '7 days'
  from _roster r
  on conflict (pool_id, user_id) do update
    -- Never un-mark someone the commissioner has marked paid in the app.
    set paid = pool_members.paid or excluded.paid,
        joined_at = least(pool_members.joined_at, excluded.joined_at);

  update pool_members m set role = 'commissioner'
  from _roster r
  where m.pool_id = v_pool.id and m.user_id = r.user_id and r.email = any (v_commissioners);
  get diagnostics v_n = row_count;
  if v_n <> array_length(v_commissioners, 1) then
    raise exception 'Expected % commissioners, set %', array_length(v_commissioners, 1), v_n;
  end if;

  update pools set settings = settings || jsonb_build_object('segments', ${lit(JSON.stringify(SEGMENTS))}::jsonb)
  where id = v_pool.id;

  for v_slate in
    select * from jsonb_to_recordset(v_data->'slates') s(
      week int, label text, first_date date, end_date date, published_at timestamptz, games jsonb, picks jsonb,
      lock_at timestamptz, partial boolean)
  loop
    -- Imported slates are 'locked' (never 'open'), so submit_picks refuses them, close_slates
    -- skips them, and ingest_espn never calls refresh_slate_locks on them. An in-progress week
    -- also carries its pick deadline (lock_at) on the slate and on every game; history has none.
    insert into slates (pool_id, week, label, window_start, window_end, lock_at, status, published_at)
    values (v_pool.id, v_slate.week, v_slate.label,
            v_slate.first_date::timestamp at time zone '${TZ}',
            v_slate.end_date::timestamp at time zone '${TZ}',
            v_slate.lock_at, 'locked', v_slate.published_at)
    on conflict (pool_id, week) do update
      set label = excluded.label, window_start = excluded.window_start, window_end = excluded.window_end,
          lock_at = excluded.lock_at, first_day_lock_at = null, status = 'locked', published_at = excluded.published_at
    returning id into v_slate_id;

    -- History is the sheet's: replace this week's picks and games wholesale.
    delete from picks where slate_id = v_slate_id;
    delete from slate_games sg
    where sg.slate_id = v_slate_id
      and sg.game_id not in (select g.id from games g
                             join jsonb_to_recordset(v_slate.games) x(espn_id text) on x.espn_id = g.espn_id);

    insert into slate_games (slate_id, game_id, sort_order, locked_home_spread, locked_line_id, lock_at,
                             voided, override_home_score, override_away_score)
    select v_slate_id, g.id, x.sort_order, x.home_spread, null, v_slate.lock_at, false, null, null
    from jsonb_to_recordset(v_slate.games) x(espn_id text, sort_order int, home_spread numeric)
    join games g on g.espn_id = x.espn_id
    on conflict (slate_id, game_id) do update
      set sort_order = excluded.sort_order, locked_home_spread = excluded.locked_home_spread,
          locked_line_id = null, lock_at = excluded.lock_at, voided = false,
          override_home_score = null, override_away_score = null;
    get diagnostics v_n = row_count;
    if v_n <> jsonb_array_length(v_slate.games) then
      raise exception 'Week %: % of % slate games written', v_slate.week, v_n, jsonb_array_length(v_slate.games);
    end if;

    insert into picks (slate_id, game_id, user_id, picked_side, confidence)
    select v_slate_id, g.id, r.user_id, p.side, null
    from jsonb_to_recordset(v_slate.picks) p(email text, espn_id text, side text)
    join _roster r on r.email = p.email
    join games g on g.espn_id = p.espn_id;
    get diagnostics v_n = row_count;
    if v_n <> jsonb_array_length(v_slate.picks) then
      raise exception 'Week %: % of % picks written', v_slate.week, v_n, jsonb_array_length(v_slate.picks);
    end if;

    -- Grades every final game; an in-progress week stays 'locked' until its last game is
    -- final, then the poller's grade_game moves it to 'graded'.
    perform grade_slate(v_slate_id);
    if coalesce(v_slate.partial, false) then
      if (select status from slates where id = v_slate_id) not in ('locked', 'graded') then
        raise exception 'Week % ended up %', v_slate.week, (select status from slates where id = v_slate_id);
      end if;
      select count(*) into v_n from slate_games sg join games g on g.id = sg.game_id
      where sg.slate_id = v_slate_id and g.status = 'final';
      raise notice 'week %: % games (% final, % pending), % picks, %, picks locked at %', v_slate.week,
        jsonb_array_length(v_slate.games), v_n, jsonb_array_length(v_slate.games) - v_n,
        jsonb_array_length(v_slate.picks), (select status from slates where id = v_slate_id), v_slate.lock_at;
    else
      if (select status from slates where id = v_slate_id) <> 'graded' then
        raise exception 'Week % did not grade', v_slate.week;
      end if;
      raise notice 'week %: % games, % picks, graded', v_slate.week,
        jsonb_array_length(v_slate.games), jsonb_array_length(v_slate.picks);
    end if;
  end loop;

  -- Placeholders that hold later week numbers (empty drafts; players don't see drafts).
  for v_slate in
    select * from jsonb_to_recordset(v_data->'reserved') s(week int, label text, first_date date, end_date date)
  loop
    insert into slates (pool_id, week, label, window_start, window_end, status)
    values (v_pool.id, v_slate.week, v_slate.label,
            v_slate.first_date::timestamp at time zone '${TZ}',
            v_slate.end_date::timestamp at time zone '${TZ}', 'draft')
    on conflict (pool_id, week) do nothing;
    raise notice 'week %: reserved (empty draft placeholder)', v_slate.week;
  end loop;
end
$import$;
`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
