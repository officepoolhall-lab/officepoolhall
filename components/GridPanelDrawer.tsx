"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useScrollLock } from "@/lib/useScrollLock";

/**
 * The Grid's side panel when the screen is too narrow to show it beside the Grid: a "View Pool
 * Summary" tab on the screen's edge (bottom on phones, right side on wider screens) that slides
 * the same content out from that edge; closing it (×, tap outside, Esc) tucks it back into the
 * tab. The tab hides itself (id grid-panel-button) wherever the panel shows beside the Grid;
 * the page's media rule does that.
 */
export function GridPanelDrawer({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* A small tab on the screen's edge: along the bottom on phones, on the right side from
          tablet/laptop width. Tapping it slides the summary out; closing it brings the tab back. */}
      {!open && (
        <button
          id="grid-panel-button"
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="summary-nudge fixed bottom-0 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-t-xl border-2 border-b-0 border-accent bg-accent px-4 pb-[calc(0.375rem+env(safe-area-inset-bottom))] pt-1.5 text-xs font-semibold text-white shadow-lg transition hover:brightness-110 lg:bottom-auto lg:left-auto lg:right-0 lg:top-1/2 lg:-translate-y-1/2 lg:translate-x-0 lg:rounded-none lg:rounded-l-xl lg:border-b-2 lg:border-r-0 lg:px-1.5 lg:py-4 lg:[writing-mode:vertical-rl]"
        >
          <span aria-hidden className="lg:hidden">▲</span>
          <span aria-hidden className="hidden lg:inline">◀</span>
          View Pool Summary
        </button>
      )}
      {open && <Drawer onClose={() => setOpen(false)}>{children}</Drawer>}
    </>
  );
}

function Drawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useScrollLock();
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      aria-label="Pool Summary"
      // Phones: a sheet up from the bottom. Desktop (lg): a panel in from the right, full height.
      // Slides in from its edge as it opens (where the browser supports it).
      className="m-0 mt-auto w-full max-w-none transition-transform duration-200 ease-out starting:translate-y-full lg:starting:translate-x-full lg:starting:translate-y-0 rounded-t-2xl border-2 border-b-0 border-accent bg-bg p-0 text-ink shadow-xl backdrop:bg-black/50 lg:ml-auto lg:mt-0 lg:h-dvh lg:max-h-none lg:w-[24rem] lg:rounded-none lg:rounded-l-2xl lg:border-b-2 lg:border-r-0"
    >
      <div className="flex max-h-[85dvh] lg:h-full lg:max-h-none">
        {/* Wider screens: a Hide handle running down the drawer's left edge, arrow pointing right
            (back toward the screen edge it came from). */}
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          aria-label="Hide the pool summary"
          className="hidden w-8 shrink-0 items-center justify-center gap-2 border-r border-line text-xs font-semibold text-accent transition hover:bg-hover lg:flex lg:flex-col"
        >
          <span className="[writing-mode:vertical-rl]">Hide</span>
          <span aria-hidden className="text-sm leading-none">▶</span>
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-3">
            <h2 className="text-base font-bold">Pool Summary</h2>
            {/* Phones: Hide in the corner of the bottom sheet. */}
            <button type="button" onClick={() => dialog.current?.close()} className="-mr-2 flex h-9 items-center gap-1 rounded-full px-2.5 text-sm font-medium text-muted hover:bg-surface lg:hidden" aria-label="Hide the pool summary">
              Hide <span aria-hidden className="text-lg leading-none">×</span>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">{children}</div>
        </div>
      </div>
    </dialog>
  );
}
