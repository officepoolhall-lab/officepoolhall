import { formatInTimeZone } from "date-fns-tz";
import { getSquares } from "@/lib/squaresData";
import { squaresPdf } from "@/lib/squaresPdf";
import { createAdminClient } from "@/lib/supabase/admin";

// The board as a PDF (GET /board/<share token>/pdf): what the commissioner downloads from the
// Board page to send to people who don't have the link.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!UUID.test(token)) return new Response("Not found", { status: 404 });
  const admin = createAdminClient();
  const db = admin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: row } = await db.from("squares_boards").select("pool_id").eq("share_token", token).maybeSingle();
  if (!row) return new Response("Not found", { status: 404 });
  const { data: pool } = await db.from("pools").select("id, name, slug, season, sport, settings").eq("id", row.pool_id).maybeSingle();
  if (!pool || pool.settings?.format !== "squares") return new Response("Not found", { status: 404 });

  const { settings, board, squares, scores, winners } = await getSquares({ supabase: admin, pool });
  const pot = settings.price * squares.size;
  const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const pdf = squaresPdf({
    poolName: pool.name,
    homeName: board.homeName,
    awayName: board.awayName,
    colDigits: board.colDigits,
    rowDigits: board.rowDigits,
    names: Array.from({ length: 100 }, (_, i) => squares.get(i)?.label ?? null),
    scores,
    winners,
    payouts: settings.payouts.map((p) => (p > 0 && pot > 0 ? money((pot * p) / 100) : null)),
    footer: `The Office Pool Hall · ${formatInTimeZone(new Date(), pool.settings?.timezone ?? "America/Chicago", "MMM d, yyyy h:mm a")}`,
  });
  return new Response(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${String(pool.slug).replace(/[^a-z0-9-]/gi, "") || "squares"}-board.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
