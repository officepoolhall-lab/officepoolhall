"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A Home page column that ends level with the tallest-fixed column beside it on desktop (the
 * rankings or NFL standings). It takes no height of its own in the grid row (h-0) and stretches
 * to the row (min-h-full), then hides rows from the end of its list ([data-fill-list] > li)
 * until everything fits. If the viewer's own row ([data-fill-me]) gets hidden, the pinned copy
 * ([data-fill-pin], hidden on desktop by default) shows under the list instead, and the list
 * gives up a row or two more to make room. Phones and tablets are untouched: the server's own
 * row limits apply there.
 */
export function FillColumn({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const col = ref.current;
    if (!col) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    let busy = false;

    const fit = () => {
      if (busy) return;
      busy = true;
      const lists = [...col.querySelectorAll<HTMLElement>("[data-fill-list]")];
      const rowsOf = (l: HTMLElement) => [...l.children].filter((c): c is HTMLElement => c instanceof HTMLElement && !c.hasAttribute("data-fill-pin"));
      const pins = [...col.querySelectorAll<HTMLElement>("[data-fill-pin]")];
      // Start from everything the server sent.
      for (const l of lists) for (const r of rowsOf(l)) r.style.display = "";
      for (const p of pins) p.style.display = "";
      if (desktop.matches) {
        const fits = () => col.scrollHeight <= col.clientHeight + 1;
        const showPins = (on: boolean) => pins.forEach((p) => (p.style.display = on ? (p.dataset.fillPin || "flex") : ""));
        // The viewer's row isn't in the list at all (ranked past what the server sent): pinned.
        const me = col.querySelector<HTMLElement>("[data-fill-me]");
        if (!me && pins.length) showPins(true);
        for (const l of lists) {
          const rows = rowsOf(l);
          // Keep at least three rows.
          for (let i = rows.length - 1; i >= 3 && !fits(); i--) {
            rows[i].style.display = "none";
            if (rows[i] === me) showPins(true);
          }
        }
      }
      busy = false;
    };

    fit();
    // Re-fit when the row's height changes (rankings streaming in, a resize) or the content
    // does (switching Season / Week).
    const ro = new ResizeObserver(() => fit());
    ro.observe(col);
    const mo = new MutationObserver(() => fit());
    mo.observe(col, { childList: true, subtree: true });
    desktop.addEventListener("change", fit);
    return () => {
      ro.disconnect();
      mo.disconnect();
      desktop.removeEventListener("change", fit);
    };
  }, []);

  return (
    <div ref={ref} className={`lg:h-0 lg:min-h-[max(100%,28rem)] lg:overflow-hidden ${className}`}>
      {children}
    </div>
  );
}
