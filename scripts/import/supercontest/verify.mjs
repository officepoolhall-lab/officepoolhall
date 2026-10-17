#!/usr/bin/env node
// Check an imported Supercontest pool against the parsed workbook.
//
//   node verify.mjs <parsed.json> --db <postgres-url> --pool-slug 2026-ncaa-supercontest
//
// For every entry: per-week W-L, season W-L and Segment 1/2/3 W-L from picks.result (and the
// grader's slate_scores) vs the sheet, for the imported weeks only. Also checks membership,
// paid flags, commissioners and the segments setting. Exits 1 on any mismatch.
// Prints names, never emails. Uses the psql binary; no dependencies.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const SEGMENT_STARTS = [1, 6, 11];
const COMMISSIONERS = ["cross.brooks.a@gmail.com", "noah.brown94@gmail.com"];

const a = process.argv.slice(2);
const o = {};
for (let i = 0; i < a.length; i++) {
  if (a[i].startsWith("--")) o[a[i].slice(2)] = a[++i];
  else o.input = a[i];
}
if (!o.input || !o.db || !o["pool-slug"] || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(o["pool-slug"])) {
  console.error("usage: node verify.mjs <parsed.json> --db <url> --pool-slug <slug> [--report <report.json>]");
  process.exit(2);
}
const slug = o["pool-slug"];
const data = JSON.parse(readFileSync(o.input, "utf8"));

/** Split a Postgres record literal like (a,"b ""c""",,d) into fields; NULL → "" (like psql -At). */
function parseRecord(text) {
  const out = [];
  let i = 1;
  while (i < text.length) {
    let field = "";
    if (text[i] === '"') {
      i++;
      while (i < text.length) {
        if (text[i] === '"' && text[i + 1] === '"') { field += '"'; i += 2; }
        else if (text[i] === "\\") { field += text[i + 1]; i += 2; }
        else if (text[i] === '"') { i++; break; }
        else field += text[i++];
      }
    } else {
      while (i < text.length && text[i] !== "," && text[i] !== ")") field += text[i++];
    }
    out.push(field);
    if (text[i] === ")") break;
    i++; // skip the comma
  }
  return out;
}

function q(sql) {
  // --db linked: query the linked Supabase project through the CLI (no DB password needed).
  if (o.db === "linked") {
    // The CLI returns rows as JSON objects, which collapse duplicate/unnamed columns, so ask
    // Postgres for each row as one positional record literal and split it here.
    const wrapped = `select (t.*)::text as r from (${sql.trim().replace(/;$/, "")}) t`;
    const r = spawnSync("npx", ["supabase", "db", "query", "--linked", "-o", "json", wrapped], { encoding: "utf8", maxBuffer: 64 << 20 });
    if (r.status !== 0) {
      console.error(r.stderr || r.error);
      process.exit(2);
    }
    const rows = JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))).rows ?? [];
    return rows.map((row) => parseRecord(row.r));
  }
  const r = spawnSync("psql", [o.db, "-X", "-At", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr || r.error);
    process.exit(2);
  }
  return r.stdout.split("\n").filter(Boolean).map((l) => l.split("\t"));
}

const segOf = (week) => SEGMENT_STARTS.filter((s) => s <= week).length - 1;
const fmt = (r) => `${r.w}-${r.l}`;
const same = (x, y) => x.w === y.w && x.l === y.l;
const mismatches = [];
const bad = (m) => mismatches.push(m);
// Expected differences that aren't errors: the import never un-marks a member the app has
// marked paid, and never renames an account whose owner already chose a display name.
const notes = [];

const nameByEmail = new Map(data.roster.map((r) => [r.email, r.name]));
const weeks = data.weeks.map((w) => w.week);

// ---- DB side ----
const pool = q(`select id, settings->'segments' from pools where slug = '${slug}'`);
if (!pool.length) {
  console.error(`pool ${slug} not found`);
  process.exit(1);
}
const poolId = pool[0][0];
const segSetting = JSON.parse(pool[0][1] || "null");
const wantSeg = [
  { name: "Segment 1", first_week: 1 },
  { name: "Segment 2", first_week: 6 },
  { name: "Segment 3", first_week: 11 },
];
if (JSON.stringify(segSetting) !== JSON.stringify(wantSeg)) bad(`settings.segments is ${JSON.stringify(segSetting)}`);

const members = new Map(
  q(`select lower(u.email), m.role, m.paid from pool_members m join auth.users u on u.id = m.user_id
     where m.pool_id = '${poolId}'`).map(([e, role, paid]) => [e, { role, paid: paid === "t" }]),
);
const displayNames = new Map(
  q(`select lower(u.email), p.display_name from pool_members m join auth.users u on u.id = m.user_id
     join profiles p on p.id = u.id where m.pool_id = '${poolId}'`),
);
for (const r of data.roster) {
  const m = members.get(r.email);
  if (!m) {
    bad(`${r.name}: not a member`);
    continue;
  }
  if (r.paid && !m.paid) bad(`${r.name}: unpaid, sheet says paid`);
  else if (m.paid && !r.paid) notes.push(`${r.name}: paid in the app, not in the sheet`);
  const wantRole = COMMISSIONERS.includes(r.email) ? "commissioner" : null;
  if (wantRole && m.role !== wantRole) bad(`${r.name}: role ${m.role}, expected commissioner`);
  if (displayNames.get(r.email) !== r.name) notes.push(`${r.name}: keeps their own display name`);
}

const slates = new Map(
  q(`select week, status, (select count(*) from slate_games sg where sg.slate_id = s.id) from slates s
     where pool_id = '${poolId}'`).map(([w, st, n]) => [Number(w), { status: st, games: Number(n) }]),
);
for (const w of data.weeks) {
  const s = slates.get(w.week);
  if (!s) bad(`week ${w.week}: no slate`);
  else {
    if (s.status !== "graded") bad(`week ${w.week}: slate is ${s.status}`);
    if (s.games !== w.games.length) bad(`week ${w.week}: ${s.games} slate games, sheet ${w.games.length}`);
  }
}

// email → week → {w,l} from picks, and from slate_scores
const fromPicks = new Map();
for (const [e, wk, w, l, other] of q(
  `select lower(u.email), s.week,
          count(*) filter (where p.result = 'win'), count(*) filter (where p.result = 'loss'),
          count(*) filter (where p.result is null or p.result not in ('win','loss'))
   from picks p join slates s on s.id = p.slate_id join auth.users u on u.id = p.user_id
   where s.pool_id = '${poolId}' group by 1, 2`,
)) {
  if (!fromPicks.has(e)) fromPicks.set(e, new Map());
  fromPicks.get(e).set(Number(wk), { w: Number(w), l: Number(l) });
  if (Number(other)) bad(`${nameByEmail.get(e) ?? "(non-roster member)"} week ${wk}: ${other} pick(s) not win/loss`);
}
const fromScores = new Map();
for (const [e, wk, w, l, pts] of q(
  `select lower(u.email), s.week, ss.wins, ss.losses, ss.points
   from slate_scores ss join slates s on s.id = ss.slate_id join auth.users u on u.id = ss.user_id
   where s.pool_id = '${poolId}'`,
)) {
  if (!fromScores.has(e)) fromScores.set(e, new Map());
  fromScores.get(e).set(Number(wk), { w: Number(w), l: Number(l), pts: Number(pts) });
}

// ---- compare ----
const zero = () => ({ w: 0, l: 0 });
const add = (x, y) => ({ w: x.w + y.w, l: x.l + y.l });
const sub = (x, y) => ({ w: x.w - y.w, l: x.l - y.l });
const standingsByName = new Map(data.standings.map((s) => [s.name, s]));
const excludedByWeek = (data.excluded_weeks ?? []).map((x) => ({ week: x.week, records: x.records }));
// Picks the importer didn't count (Brooks's rule: only the first 5 by kickoff count). The
// sheet's own record includes them, so take each dropped pick's result back out of it.
const reportPath = o.report;
const trimmed = reportPath ? (JSON.parse(readFileSync(reportPath, "utf8")).trimmed ?? []) : [];
const adjustments = new Map(); // "name|week" -> {w, l} to subtract from the sheet
for (const t of trimmed) {
  const week = data.weeks.find((w) => w.week === t.week);
  if (!week) continue;
  const adj = { w: 0, l: 0 };
  for (const d of t.dropped) {
    const game = week.games.find((g) => g.col === d.col);
    const entry = week.entries.find((x) => x.name === t.entry);
    const pick = entry?.picks.find((p) => p.col === d.col);
    if (!game || !pick) continue;
    if (pick.team === game.cover.team) adj.w++;
    else adj.l++;
  }
  adjustments.set(`${t.entry}|${t.week}`, adj);
  notes.push(`${t.entry} week ${t.week}: ${t.dropped.length} pick(s) past the first ${t.kept} not counted (${t.dropped.map((d) => d.raw).join(", ")}); sheet record adjusted by -${adj.w}-${adj.l}`);
}
let entriesChecked = 0;
let weekRows = 0;

for (const r of data.roster) {
  entriesChecked++;
  const dbWeeks = fromPicks.get(r.email) ?? new Map();
  const dbScores = fromScores.get(r.email) ?? new Map();
  let sheetSeason = zero();
  let dbSeason = zero();
  const sheetSeg = [zero(), zero(), zero()];
  const dbSeg = [zero(), zero(), zero()];
  for (const w of data.weeks) {
    weekRows++;
    const e = w.entries.find((x) => x.name === r.name);
    const adj = adjustments.get(`${r.name}|${w.week}`);
    const sheet = e ? (adj ? sub(e.record, adj) : e.record) : zero();
    const db = dbWeeks.get(w.week) ?? zero();
    const sc = dbScores.get(w.week);
    if (!same(sheet, db)) bad(`${r.name} week ${w.week}: db ${fmt(db)}, sheet ${fmt(sheet)}`);
    if (!sc) bad(`${r.name} week ${w.week}: no slate_scores row`);
    else if (!same(sc, db) || sc.pts !== db.w) bad(`${r.name} week ${w.week}: slate_scores ${fmt(sc)} / ${sc.pts} pts vs picks ${fmt(db)}`);
    sheetSeason = add(sheetSeason, sheet);
    dbSeason = add(dbSeason, db);
    sheetSeg[segOf(w.week)] = add(sheetSeg[segOf(w.week)], sheet);
    dbSeg[segOf(w.week)] = add(dbSeg[segOf(w.week)], db);
  }
  for (const wk of dbWeeks.keys()) if (!weeks.includes(wk)) bad(`${r.name}: unexpected picks in week ${wk}`);
  if (!same(sheetSeason, dbSeason)) bad(`${r.name} season: db ${fmt(dbSeason)}, sheet ${fmt(sheetSeason)}`);
  for (let i = 0; i < 3; i++) {
    if (!same(sheetSeg[i], dbSeg[i])) bad(`${r.name} segment ${i + 1}: db ${fmt(dbSeg[i])}, sheet ${fmt(sheetSeg[i])}`);
  }

  // Reconcile with the Standings tab: its totals minus the weeks we didn't import.
  const st = standingsByName.get(r.name);
  if (!st) bad(`${r.name}: not on Standings`);
  else {
    let season = st.record;
    const segs = st.segments.slice();
    for (const w of data.weeks) {
      const adj = adjustments.get(`${r.name}|${w.week}`);
      if (!adj) continue;
      season = sub(season, adj);
      segs[segOf(w.week)] = sub(segs[segOf(w.week)], adj);
    }
    for (const x of excludedByWeek) {
      const rec = x.records[r.name];
      if (!rec) continue;
      season = sub(season, rec);
      segs[segOf(x.week)] = sub(segs[segOf(x.week)], rec);
    }
    if (!same(season, dbSeason)) bad(`${r.name} season: db ${fmt(dbSeason)}, Standings tab (imported weeks) ${fmt(season)}`);
    for (let i = 0; i < 3; i++) {
      if (!same(segs[i], dbSeg[i])) bad(`${r.name} segment ${i + 1}: db ${fmt(dbSeg[i])}, Standings tab (imported weeks) ${fmt(segs[i])}`);
    }
  }
}

const totalPicks = [...fromPicks.values()].reduce((n, m) => n + [...m.values()].reduce((k, x) => k + x.w + x.l, 0), 0);
console.log(
  `verify ${slug}: weeks ${weeks.join(",")}; ${entriesChecked} entries, ${weekRows} entry-weeks, ` +
    `${totalPicks} graded picks, ${members.size} members (${data.roster.length} roster)`,
);
if (notes.length) {
  console.log(`${notes.length} note(s):`);
  for (const n of notes) console.log("  -", n);
}
if (mismatches.length) {
  console.log(`${mismatches.length} mismatch(es):`);
  for (const m of mismatches) console.log("  -", m);
  process.exit(1);
}
console.log(
  "0 mismatches: per-week, season and segment records match the week sheets, and the Standings tab " +
    (excludedByWeek.length ? `once weeks ${excludedByWeek.map((x) => x.week).join(",")} (not imported) are removed` : "directly"),
);
