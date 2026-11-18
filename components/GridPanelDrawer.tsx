"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useScrollLock } from "@/lib/useScrollLock";
import { chipClass } from "./ui";

/**
 * The Grid's side panel when the screen is too narrow to show it beside the Grid: a "Pool
 * Summary" button that opens the same content from the right edge on desktop and from the
 * bottom on phones. The button hides itself (id grid-panel-button) wherever the panel shows
 * beside the Grid; the page's media rule does that.
 */
export function GridPanelDrawer({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button id="grid-panel-button" type="button" onClick={() => setOpen(true)} className={chipClass(false, "shrink-0", "xs")} aria-haspopup="dialog">
        Pool Summary
      </button>
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
      className="m-0 mt-auto w-full max-w-none rounded-t-2xl border-2 border-b-0 border-accent bg-bg p-0 text-ink shadow-xl backdrop:bg-black/50 lg:ml-auto lg:mt-0 lg:h-dvh lg:max-h-none lg:w-[22rem] lg:rounded-none lg:rounded-l-2xl lg:border-b-2 lg:border-r-0"
    >
      <div className="flex max-h-[85dvh] flex-col lg:h-full lg:max-h-none">
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-3">
          <h2 className="text-base font-bold">Pool Summary</h2>
          <button type="button" onClick={() => dialog.current?.close()} className="-mr-2 grid size-9 place-items-center rounded-full text-xl text-muted hover:bg-surface" aria-label="Close">
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </dialog>
  );
}
