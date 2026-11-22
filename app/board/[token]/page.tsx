import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SquaresBoardView } from "@/components/squares/SquaresPages";
import { Wordmark } from "@/components/ui";
import { getSquares } from "@/lib/squaresData";
import { createAdminClient } from "@/lib/supabase/admin";

// A Squares board for anyone with its link, no sign-in: the board, the winners and the pot.
// When the pool lets players fill the board, this is also where they do it (tap squares, type
// a name, Save). The link carries the board's share token (a long random id); without it,
// there's no way to reach a board from outside its pool.

export const metadata: Metadata = { title: "Squares board", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SharedBoardPage({ params }: PageProps<"/board/[token]">) {
  const { token } = await params;
  if (!UUID.test(token)) notFound();
  const admin = createAdminClient();
  const db = admin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: board } = await db.from("squares_boards").select("pool_id").eq("share_token", token).maybeSingle();
  if (!board) notFound();
  const { data: pool } = await db.from("pools").select("id, name, slug, season, sport, settings").eq("id", board.pool_id).maybeSingle();
  if (!pool || pool.settings?.format !== "squares") notFound();
  const data = await getSquares({ supabase: admin, pool });

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line bg-bg pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center px-4 xl:max-w-6xl 2xl:max-w-7xl">
          <Link href="/" className="flex h-11 items-center text-ink">
            <Wordmark className="text-[19px]" />
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl xl:max-w-6xl 2xl:max-w-7xl flex-1 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <SquaresBoardView data={data} slug={pool.slug} title={pool.name} />
      </main>
    </div>
  );
}
