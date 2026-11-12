"use client";

import { useEffect } from "react";

/**
 * Stops the page behind a pop-up from scrolling while it's open. `overflow: hidden` alone isn't
 * enough on iPhone and some Android browsers, so the body is also pinned in place (and put back
 * at the same scroll position on close).
 */
export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    const { documentElement: html, body } = document;
    const y = window.scrollY;
    const saved = { htmlOverflow: html.style.overflow, position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${y}px`;
    body.style.width = "100%";
    return () => {
      html.style.overflow = saved.htmlOverflow;
      body.style.overflow = saved.overflow;
      body.style.position = saved.position;
      body.style.top = saved.top;
      body.style.width = saved.width;
      window.scrollTo(0, y);
    };
  }, [active]);
}
