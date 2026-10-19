"use client";

import { useState } from "react";

/**
 * A story's thumbnail. Requested without a referrer, since some image hosts (Yahoo's among
 * them) refuse pictures linked from other sites; if it still fails, or there's no image,
 * the source's name stands in.
 */
export function NewsThumb({ src, source }: { src: string | null; source: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="grid h-14 w-24 shrink-0 place-items-center rounded-lg bg-surface px-1 text-center text-[11px] font-semibold leading-tight text-muted" aria-hidden>
        {source}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote thumbnails, sized by CSS
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-14 w-24 shrink-0 rounded-lg bg-surface object-cover"
    />
  );
}
