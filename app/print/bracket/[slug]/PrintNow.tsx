"use client";

import { useEffect } from "react";

/** Opens the print dialog once the page has drawn (logos included), and a button to open it again. */
export function PrintNow() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 800);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="mx-auto mb-4 flex w-[1320px] items-center justify-between rounded-xl bg-[#f2f2f5] px-4 py-2 text-sm print:hidden">
      <span>Choose &ldquo;Save as PDF&rdquo; in the print dialog to keep a copy. Landscape fits the whole bracket on one page.</span>
      <button type="button" onClick={() => window.print()} className="h-9 cursor-pointer rounded-lg bg-[#0066d6] px-4 font-semibold text-white hover:brightness-110">
        Print / Save PDF
      </button>
    </div>
  );
}
