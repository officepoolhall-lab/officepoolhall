"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { useScrollLock } from "@/lib/useScrollLock";

/**
 * The pop-up a game's play-by-play and box score open in over My Picks or the Scoreboard. Blue
 * border like every pop-up, page behind locked; ×, Esc or a tap outside closes it, which goes
 * back to the page underneath (the browser's Back button does the same).
 */
export function GameModal({ children }: { children: ReactNode }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  useScrollLock();
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      onClose={() => router.back()}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      aria-label="Game"
      className="m-auto w-[min(64rem,calc(100vw-1rem))] rounded-xl border-2 border-accent bg-bg p-0 text-ink shadow-xl backdrop:bg-black/50"
    >
      <div className="relative max-h-[min(90vh,calc(100dvh-1rem))] overflow-y-auto overscroll-contain p-4 pt-3 sm:p-5 sm:pt-4">
        <div className="sticky top-0 z-30 -mb-9 flex justify-end">
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="grid size-9 place-items-center rounded-full bg-bg text-xl text-muted shadow-sm hover:bg-surface"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
