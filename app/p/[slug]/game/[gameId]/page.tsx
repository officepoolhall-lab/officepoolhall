import { redirect } from "next/navigation";
import { ReturnToPoolPage } from "@/components/OpenGameFromQuery";
import { gameBackHref } from "./GameView";

/**
 * A game's address loaded on its own (a refresh while its pop-up was open, or a shared link):
 * there's no separate game page. It goes back to the page the game was opened from (My Picks,
 * or the Scoreboard on the same week) with ?game= added, and that page reopens the game's
 * pop-up over itself (OpenGameFromQuery). Inside the app, games open as pop-ups directly
 * (@modal/(.)game/[gameId]).
 */
export default async function GamePage({ params, searchParams }: PageProps<"/p/[slug]/game/[gameId]">) {
  const { slug, gameId } = await params;
  const q = await searchParams;
  // No ?back= or ?from=: the browser knows the last page seen in this pool.
  if (typeof q.back !== "string" && typeof q.from !== "string") return <ReturnToPoolPage slug={slug} gameId={gameId} />;
  const back = gameBackHref(slug, q);
  redirect(`${back}${back.includes("?") ? "&" : "?"}game=${encodeURIComponent(gameId)}`);
}
