import { GameModal } from "@/components/GameModal";

/** The pop-up opens straight away while ESPN's play-by-play loads. */
export default function GamePopupLoading() {
  return (
    <GameModal>
      <p className="py-10 text-center text-sm text-muted">Loading the game…</p>
    </GameModal>
  );
}
