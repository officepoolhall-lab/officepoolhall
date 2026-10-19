"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** How far the finger moves (px) before the swipe's direction is decided. */
const DECIDE_PX = 6;
/** Glide after release: speed kept per 16ms frame, and the speed (px/ms) where it stops. */
const FRICTION = 0.95;
const STOP_SPEED = 0.02;

/**
 * A box that scrolls both ways, but on touch screens each swipe moves along one axis only:
 * the direction of its first few pixels, then a native-feeling glide on release. Single-finger
 * touches only; pinch-zoom, taps, mouse wheels and trackpads behave as usual.
 */
export function AxisLockScroll({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let lastT = 0;
    let axis: "x" | "y" | null = null;
    let velocity = 0; // px/ms along the locked axis
    let tracking = false;
    let glide = 0;

    const stopGlide = () => {
      if (glide) cancelAnimationFrame(glide);
      glide = 0;
    };

    const onStart = (e: TouchEvent) => {
      stopGlide();
      if (e.touches.length !== 1) {
        tracking = false;
        return;
      }
      const t = e.touches[0];
      startX = lastX = t.clientX;
      startY = lastY = t.clientY;
      lastT = e.timeStamp;
      axis = null;
      velocity = 0;
      tracking = true;
    };

    const onMove = (e: TouchEvent) => {
      // A second finger (pinch) hands the gesture back to the browser.
      if (!tracking || e.touches.length !== 1) {
        tracking = false;
        return;
      }
      const t = e.touches[0];
      if (!axis) {
        const dx = Math.abs(t.clientX - startX);
        const dy = Math.abs(t.clientY - startY);
        if (Math.max(dx, dy) < DECIDE_PX) return;
        axis = dx > dy ? "x" : "y";
      }
      // From here on this swipe is ours: no native (diagonal) scrolling.
      e.preventDefault();
      const delta = axis === "x" ? lastX - t.clientX : lastY - t.clientY;
      if (axis === "x") el.scrollLeft += delta;
      else el.scrollTop += delta;
      const dt = Math.max(1, e.timeStamp - lastT);
      // Smoothed, so one jittery sample doesn't decide the glide.
      velocity = 0.8 * (delta / dt) + 0.2 * velocity;
      lastX = t.clientX;
      lastY = t.clientY;
      lastT = e.timeStamp;
    };

    const onEnd = () => {
      if (!tracking || !axis) return;
      tracking = false;
      const lockedAxis = axis;
      let v = velocity;
      let prev = performance.now();
      const step = (now: number) => {
        const dt = Math.min(64, now - prev);
        prev = now;
        v *= Math.pow(FRICTION, dt / 16);
        if (Math.abs(v) < STOP_SPEED) {
          glide = 0;
          return;
        }
        if (lockedAxis === "x") el.scrollLeft += v * dt;
        else el.scrollTop += v * dt;
        glide = requestAnimationFrame(step);
      };
      glide = requestAnimationFrame(step);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      stopGlide();
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  // overscroll-contain: reaching an edge doesn't drag the page (or pull-to-refresh) along.
  return (
    <div ref={ref} className={`overscroll-contain ${className ?? ""}`}>
      {children}
    </div>
  );
}
