// ESPN PGA Tour leaderboard page: reads each golfer's finish and earnings from the data the
// page embeds in its HTML. The page isn't a documented API, so keep this parser narrow and
// fail loudly when the shape changes.

export type GolfPlayer = {
  id: string;
  name: string;
  pos: string;
  earnings: number;
  status: string;
};

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
    });
  }
  return [...byId.values()];
}
