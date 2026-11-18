import { GameModal } from "@/components/GameModal";
import { GameView } from "../../../game/[gameId]/GameView";

/**
 * A game opened from inside the app (My Picks, the Scoreboard): the same play-by-play and box
 * score as its own page, in a pop-up over the page it was opened from. Closing it goes back.
 * Opening the game's address directly (or refreshing) shows the full page instead.
 */
export default async function GamePopup({ params, searchParams }: PageProps<"/p/[slug]/game/[gameId]">) {
  const { slug, gameId } = await params;
  return (
    <GameModal>
      <GameView slug={slug} gameId={gameId} searchParams={await searchParams} modal />
    </GameModal>
  );
}
