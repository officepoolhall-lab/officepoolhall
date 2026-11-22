import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// The board as it is this second, for the page people fill it in from: every saved square,
// every square someone is holding, and which of each belong to the browser asking (?h=<its id>).
// Nobody else's id is ever sent out.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!UUID.test(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const holder = new URL(req.url).searchParams.get("h") ?? "";
  const db = createAdminClient() as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: board } = await db.from("squares_boards").select("pool_id, drawn_at").eq("share_token", token).maybeSingle();
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [{ data: claims }, { data: holds }, { data: pool }] = await Promise.all([
    db.from("squares_claims").select("idx, label, owner_key").eq("pool_id", board.pool_id),
    db.from("squares_holds").select("idx, holder, expires_at").eq("pool_id", board.pool_id),
    db.from("pools").select("settings").eq("id", board.pool_id).maybeSingle(),
  ]);
  return NextResponse.json(
    {
      squares: ((claims ?? []) as { idx: number; label: string; owner_key: string | null }[]).map((c) => ({ i: c.idx, n: c.label, m: Boolean(holder) && c.owner_key === holder })),
      // Someone else's hold counts for three minutes; your own stays yours until you save or another person takes it.
      holds: ((holds ?? []) as { idx: number; holder: string; expires_at: string }[])
        .filter((h) => h.holder === holder || Date.parse(h.expires_at) > Date.now())
        .map((h) => ({ i: h.idx, m: Boolean(holder) && h.holder === holder })),
      open: !board.drawn_at && pool?.settings?.squares?.entry === "players",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
