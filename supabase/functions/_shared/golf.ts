// ESPN PGA Tour leaderboard page: reads each golfer's finish and earnings from the data the
// page embeds in its HTML. The page isn't a documented API, so keep this parser narrow and
// fail loudly when the shape changes.

export type GolfPlayer = {
  id: string;
  name: string;
  pos: string;
  earnings: number;
  status: string;
  tee: string | null;
};

export type EventState = {
  status: "scheduled" | "in_progress" | "final";
  firstTee: string | null; // earliest tee time on the page; used as the pick lock while scheduled
};

/**
 * Event status from the players' statuses. Every golfer "post" means final. Some golfers
 * "post" or "in" means in progress. Nothing started means scheduled.
 * Status values "pre" and "in" are not yet confirmed on a live page; check before relying on it.
 */
export function deriveEventState(players: GolfPlayer[]): EventState {
  const tees = players.map((p) => p.tee).filter((t): t is string => !!t).sort();
  const firstTee = tees[0] ?? null;
  if (players.length === 0) return { status: "scheduled", firstTee };
  const posted = players.filter((p) => p.status === "post").length;
  if (posted === players.length) return { status: "final", firstTee };
  const started = posted > 0 || players.some((p) => p.status === "in");
  return { status: started ? "in_progress" : "scheduled", firstTee };
}

export function leaderboardUrl(espnEventId: string) {
  return `https://www.espn.com/golf/leaderboard/_/tournamentId/${espnEventId}`;
}

export async function fetchLeaderboardHtml(espnEventId: string): Promise<string> {
  const res = await fetch(leaderboardUrl(espnEventId), {
    headers: { "User-Agent": "office-pool-hall-import" },
  });
  if (!res.ok) throw new Error(`ESPN leaderboard ${espnEventId} returned HTTP ${res.status}`);
  return await res.text();
}

/** Every golfer object in the page's embedded data, de-duplicated by ESPN id. */
export function parsePlayers(html: string): GolfPlayer[] {
  const byId = new Map<string, GolfPlayer>();
  for (const m of html.matchAll(/\{"guid":[^{}]*\}/g)) {
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(m[0]);
    } catch {
      continue;
    }
    if (o["$$"] === undefined || typeof o.name !== "string" || o.id === undefined) continue;
    byId.set(String(o.id), {
      id: String(o.id),
      name: o.name,
      pos: o.pos === undefined || o.pos === null || o.pos === "" ? "-" : String(o.pos),
      earnings: Number(o["$$"]) || 0,
      status: typeof o.status === "string" ? o.status : "",
      tee: typeof o.tee === "string" ? o.tee : null,
    });
  }
  return [...byId.values()];
}
