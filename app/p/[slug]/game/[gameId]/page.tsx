import type { Metadata } from "next";
import { GameView } from "./GameView";

export const metadata: Metadata = { title: "Game" };

/**
 * A game's own page: opened directly (a shared link, a refresh). Tapping a game inside the app
 * opens the same view as a pop-up instead (app/p/[slug]/@modal/(.)game/[gameId]).
 */
export default async function GamePage({ params, searchParams }: PageProps<"/p/[slug]/game/[gameId]">) {
  const { slug, gameId } = await params;
  return <GameView slug={slug} gameId={gameId} searchParams={await searchParams} />;
}
