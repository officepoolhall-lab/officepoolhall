import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import { getEspnField, remapPicks, remapRegions, semifinalPairs, type EspnField, type EspnTeam } from "./espnBracket";

// Every college basketball pool's NCAA Tournament bracket, set up and kept from ESPN with no
// commissioner work (run by the bracket cron, /api/brackets/sync, through March and April):
//  - Once ESPN lists the field (Selection Sunday), each pool for this season that has no bracket
//    yet gets one: the 64 teams by region and seed, the First Four, and the lock at the first
//    Round of 64 tip. Weekly pools put it in the week that tip falls in.
//  - Until the lock, spots waiting on a First Four game fill in as those games finish.
//  - Once ESPN has the national semifinals' teams, a bracket whose regions were paired
//    differently is re-paired (field, results and every entry's picks move with their regions).
// A bracket a commissioner set up keeps its teams; only its empty spots and First Four fill in.

type Db = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Our team id for each ESPN team, adding any we don't have yet. */
async function teamIds(db: Db, teams: EspnTeam[]): Promise<Map<string, string>> {
  const espnIds = [...new Set(teams.map((t) => t.espnId))];
  const out = new Map<string, string>();
  const { data } = await db.from("teams").select("id, espn_id").eq("sport", "ncaab").in("espn_id", espnIds);
  for (const t of (data ?? []) as { id: string; espn_id: string }[]) out.set(t.espn_id, t.id);
  const missing = espnIds.map((id) => teams.find((t) => t.espnId === id)!).filter((t) => !out.has(t.espnId));
  if (missing.length) {
    const { data: added } = await db
      .from("teams")
      .insert(missing.map((t) => ({ sport: "ncaab", name: t.name, short_name: t.name, abbreviation: t.abbr, espn_id: t.espnId, logo_url: t.logo })))
      .select("id, espn_id");
    for (const t of (added ?? []) as { id: string; espn_id: string }[]) out.set(t.espn_id, t.id);
  }
  return out;
}

/** The week a weekly pool's bracket belongs to: the slate whose dates hold the first tip, else the week after the last. */
async function weekFor(db: Db, poolId: string, firstTip: string): Promise<number> {
  const { data } = await db.from("slates").select("week, window_start, window_end").eq("pool_id", poolId).order("week");
  const slates = (data ?? []) as { week: number; window_start: string; window_end: string }[];
  const tip = Date.parse(firstTip);
  const hit = slates.find((s) => Date.parse(s.window_start) <= tip && tip <= Date.parse(s.window_end));
  return hit?.week ?? Math.max(0, ...slates.map((s) => s.week)) + 1;
}

export type AutoReport = { pool: string; action: "created" | "filled" | "repaired" | "unchanged" };

/** Set up and keep every college basketball pool's bracket for this season from ESPN. */
export async function autoBrackets(admin: unknown, now = Date.now()): Promise<{ field: boolean; pools: AutoReport[] }> {
  const db = admin as Db;
  const year = Number(formatInTimeZone(now, "America/New_York", "yyyy"));
  const field = await getEspnField(year);
  if (!field) return { field: false, pools: [] };
  const ids = await teamIds(db, [...field.slots.filter((t): t is EspnTeam => !!t), ...field.firstFour.flatMap((f) => f.teams)]);
  const slotIds = field.slots.map((t) => (t ? (ids.get(t.espnId) ?? null) : null));
  const firstFour = (f: EspnField["firstFour"]) =>
    f.map((g) => ({ slot: g.slot, teams: g.teams.map((t) => ids.get(t.espnId) ?? null), winner: g.winner ? (ids.get(g.winner) ?? null) : null }));

  // This season's college basketball pools (season stored as the starting or the ending year).
  const { data: pools } = await db.from("pools").select("id, name, settings").eq("sport", "ncaab").in("season", [year - 1, year]);
  const out: AutoReport[] = [];
  for (const pool of (pools ?? []) as { id: string; name: string; settings: Record<string, unknown> | null }[]) {
    const { data: existing } = await db
      .from("brackets")
      .select("id, lock_at, regions, bracket_teams ( slot, team_id )")
      .eq("pool_id", pool.id)
      .gte("lock_at", `${year}-01-01`)
      .order("created_at", { ascending: false })
      .limit(1);
    const b = (existing ?? [])[0] as { id: string; lock_at: string; regions: string[]; bracket_teams: { slot: number; team_id: string }[] } | undefined;

    if (!b) {
      // A new bracket, straight from ESPN.
      const week = pool.settings?.format === "pick_x" ? 1 : await weekFor(db, pool.id, field.firstTip);
      const { data: made, error } = await db
        .from("brackets")
        .insert({ pool_id: pool.id, name: `${year} NCAA Tournament`, week, lock_at: field.firstTip, regions: field.regions })
        .select("id")
        .single();
      if (error || !made) continue;
      await db.from("bracket_results").insert({ bracket_id: made.id });
      await db.from("bracket_teams").insert(slotIds.flatMap((team_id, slot) => (team_id ? [{ bracket_id: made.id, slot, team_id }] : [])));
      await db.from("brackets").update({ first_four: firstFour(field.firstFour) }).eq("id", made.id);
      out.push({ pool: pool.name, action: "created" });
      continue;
    }

    // An existing bracket: before the lock, its empty spots (First Four winners) fill in, and the
    // First Four is kept up to date.
    let action: AutoReport["action"] = "unchanged";
    const have = new Map(b.bracket_teams.map((t) => [t.slot, t.team_id]));
    const taken = new Set(have.values());
    const sameRegions = b.regions.every((r, i) => r.toLowerCase() === field.regions[i]?.toLowerCase());
    if (Date.parse(b.lock_at) > now && sameRegions) {
      const add = slotIds.flatMap((team_id, slot) => (team_id && !have.has(slot) && !taken.has(team_id) ? [{ bracket_id: b.id, slot, team_id }] : []));
      if (add.length) {
        await db.from("bracket_teams").insert(add);
        action = "filled";
      }
      await db.from("brackets").update({ first_four: firstFour(field.firstFour) }).eq("id", b.id);
    }

    // Once the semifinals are set: the regions paired the way the real bracket pairs them.
    if (Date.parse(b.lock_at) <= now) {
      const regionOf = new Map<string, string>();
      const espnOf = new Map(field.slots.flatMap((t) => (t ? [[ids.get(t.espnId)!, t.espnId] as const] : [])));
      for (const t of b.bracket_teams) {
        const espn = espnOf.get(t.team_id);
        if (espn) regionOf.set(espn, b.regions[Math.floor(t.slot / 16)]);
      }
      const pairs = await semifinalPairs(b.lock_at, regionOf);
      if (pairs) {
        const idx = (name: string) => b.regions.indexOf(name);
        const order = [idx(pairs[0][0]), idx(pairs[0][1]), idx(pairs[1][0]), idx(pairs[1][1])];
        const pairedNow = [[0, 1], [2, 3]].some((p) => (p.includes(order[0]) && p.includes(order[1])));
        if (!pairedNow && new Set(order).size === 4 && order.every((i) => i >= 0)) {
          await repair(db, b.id, b.regions, have, order);
          action = "repaired";
        }
      }
    }
    out.push({ pool: pool.name, action });
  }
  return { field: true, pools: out };
}

/** Re-pair a bracket's regions (see remapRegions): the field, the results and every entry's picks. */
async function repair(db: Db, bracketId: string, regions: string[], field: Map<number, string>, order: number[]) {
  const moved = remapRegions(order, field);
  await db.from("bracket_teams").delete().eq("bracket_id", bracketId);
  await db.from("bracket_teams").insert([...moved].map(([slot, team_id]) => ({ bracket_id: bracketId, slot, team_id })));
  await db.from("brackets").update({ regions: order.map((i) => regions[i]) }).eq("id", bracketId);
  const { data: res } = await db.from("bracket_results").select("results").eq("bracket_id", bracketId).maybeSingle();
  if (res) await db.from("bracket_results").update({ results: remapPicks(order, res.results ?? {}), updated_at: new Date().toISOString() }).eq("bracket_id", bracketId);
  const { data: entries } = await db.from("bracket_entries").select("user_id, picks").eq("bracket_id", bracketId);
  for (const e of (entries ?? []) as { user_id: string; picks: Record<string, string> }[]) {
    // Picks move with their regions; Final Four picks that no longer fit are dropped.
    const { data: pruned } = await db.rpc("bracket_prune", { p_bracket_id: bracketId, p_map: remapPicks(order, e.picks ?? {}) });
    await db.from("bracket_entries").update({ picks: pruned ?? remapPicks(order, e.picks ?? {}), updated_at: new Date().toISOString() }).eq("bracket_id", bracketId).eq("user_id", e.user_id);
  }
  await db.rpc("grade_bracket", { p_bracket_id: bracketId });
}
