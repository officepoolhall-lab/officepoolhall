"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * The end of a Roster row: a menu with Bench (or Bring back) and Remove. Remove always asks
 * first in a pop-up that has to be answered; it offers benching instead, which keeps the spot.
 */
export function RosterActions({
  name,
  benched,
  bench,
  unbench,
  remove,
}: {
  name: string;
  benched: boolean;
  bench: () => Promise<void>;
  unbench: () => Promise<void>;
  remove: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Close the menu on a click elsewhere or Escape.
  useEffect(() => {
    if (!open) return;
    const off = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menu.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", off);
    document.addEventListener("keydown", off);
    return () => {
      document.removeEventListener("pointerdown", off);
      document.removeEventListener("keydown", off);
    };
  }, [open]);

  const item = "flex min-h-10 w-full items-center rounded-lg px-3 text-left text-sm font-medium hover:bg-hover";
  return (
    <div ref={menu} className="relative">
      <button
        type="button"
        aria-label={`Options for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex size-10 items-center justify-center rounded-full text-muted transition hover:bg-hover hover:text-ink"
      >
        <svg aria-hidden viewBox="0 0 20 20" className="size-5">
          <circle cx="4.5" cy="10" r="1.6" fill="currentColor" />
          <circle cx="10" cy="10" r="1.6" fill="currentColor" />
          <circle cx="15.5" cy="10" r="1.6" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-30 w-52 rounded-xl bg-bg p-1 shadow-lg ring-1 ring-line">
          <form action={benched ? unbench : bench}>
            <button role="menuitem" className={`${item} text-ink`}>
              {benched ? "Bring back" : "Bench for now"}
            </button>
          </form>
          <button
            role="menuitem"
            type="button"
            className={`${item} text-loss`}
            onClick={() => {
              setOpen(false);
              dialog.current?.showModal();
            }}
          >
            Remove from pool…
          </button>
        </div>
      )}

      {/* Has to be answered: Remove, Bench instead, or Cancel (Escape cancels). */}
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl bg-bg p-5 text-ink shadow-xl ring-1 ring-line backdrop:bg-black/40"
      >
        <h2 id={titleId} className="text-lg font-bold">
          Remove {name}?
        </h2>
        <p className="mt-2 text-sm text-muted">
          They&apos;ll lose access to the pool and drop out of the standings and the Grid. They could only come back by rejoining with the invite link.
        </p>
        {!benched && <p className="mt-2 text-sm text-muted">To have them sit out but keep their spot, bench them instead.</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => dialog.current?.close()} className="inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-ink ring-1 ring-line hover:bg-hover">
            Cancel
          </button>
          {!benched && (
            <form action={bench} onSubmit={() => dialog.current?.close()}>
              <button className="inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-ink ring-1 ring-line hover:bg-hover">Bench instead</button>
            </form>
          )}
          <form action={remove} onSubmit={() => dialog.current?.close()}>
            <button className="inline-flex h-10 items-center rounded-full bg-loss px-4 text-sm font-semibold text-white hover:opacity-90">Remove</button>
          </form>
        </div>
      </dialog>
    </div>
  );
}
