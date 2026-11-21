"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export type Slide = { id: string; label: string; title: string; text: string; node: ReactNode };

const AUTO_MS = 10_000;

/**
 * The real pages, one at a time: the slides sit side by side and slide over when you pick
 * another (the arrows, the page names, or a swipe). Moves on by itself every 10 seconds, except
 * while the pointer is over it or after someone has picked a slide themselves; never for people
 * who ask for less motion.
 */
export function ShotCarousel({ slides }: { slides: Slide[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [userPicked, setUserPicked] = useState(false);
  const [reduced, setReduced] = useState(false);
  const touch = useRef<number | null>(null);
  const n = slides.length;
  const go = useCallback((to: number) => setI(((to % n) + n) % n), [n]);
  const pick = (to: number) => {
    setUserPicked(true);
    go(to);
  };

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    if (paused || userPicked || reduced || n < 2) return;
    const t = setTimeout(() => go(i + 1), AUTO_MS);
    return () => clearTimeout(t);
  }, [i, paused, userPicked, reduced, n, go]);

  const s = slides[i];
  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="carousel"
    >
      {/* The page names: tap one to slide to it. */}
      <div role="tablist" aria-label="Pages" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {slides.map((x, k) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={k === i}
            onClick={() => pick(k)}
            className={`relative h-9 shrink-0 overflow-hidden whitespace-nowrap rounded-full px-4 text-sm font-semibold transition ${
              k === i ? "bg-accent text-white dark:text-black" : "bg-bg text-ink ring-1 ring-line hover:bg-hover"
            }`}
          >
            {x.label}
            {/* How long until the next slide. */}
            {k === i && !paused && !userPicked && !reduced && n > 1 && (
              <span key={i} className="absolute inset-x-0 bottom-0 h-0.5 origin-left animate-[slide-progress_10s_linear_forwards] bg-white/70 dark:bg-black/50" />
            )}
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h3 className="text-xl font-extrabold leading-tight tracking-[-0.02em] sm:text-2xl">{s.title}</h3>
          <p className="mt-1.5 text-[15px] text-muted">{s.text}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" aria-label="Previous page" onClick={() => pick(i - 1)} className="flex size-10 items-center justify-center rounded-full bg-bg text-ink ring-1 ring-line hover:bg-hover">
            <svg aria-hidden viewBox="0 0 20 20" className="size-5"><path d="M12.5 4.5L7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button type="button" aria-label="Next page" onClick={() => pick(i + 1)} className="flex size-10 items-center justify-center rounded-full bg-bg text-ink ring-1 ring-line hover:bg-hover">
            <svg aria-hidden viewBox="0 0 20 20" className="size-5"><path d="M7.5 4.5L13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>

      {/* The slides side by side; only the current one is in view. Swipe on touch screens. */}
      <div
        className="overflow-hidden rounded-2xl"
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current === null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          touch.current = null;
          if (Math.abs(dx) > 50) pick(i + (dx < 0 ? 1 : -1));
        }}
      >
        <div className={`flex ${reduced ? "" : "transition-transform duration-500 ease-out"}`} style={{ transform: `translateX(-${i * 100}%)` }}>
          {slides.map((x, k) => (
            <div key={x.id} className="w-full shrink-0" aria-hidden={k !== i} role="tabpanel" aria-label={x.label}>
              {x.node}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
