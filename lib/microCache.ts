// A few seconds' memory for live data from ESPN, shared by every request this server instance
// handles: during a game dozens of page views a minute (and each open page's own refresh) read
// the same scoreboard. Unlike a timed fetch cache, it never hands back anything older than its
// few seconds (a timed cache serves the old copy to the first visitor after a quiet spell), and
// requests that arrive together share one fetch.

type Entry<T> = { at: number; value: Promise<T> };
const store = new Map<string, Entry<unknown>>();

/** `fn()`'s result for `key`, reused for `ttlMs`; a failure (throw or null) isn't kept. */
export function fresh<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && now - hit.at < ttlMs) return hit.value;
  const value = fn().then(
    (v) => {
      if (v === null || v === undefined) store.delete(key);
      return v;
    },
    (e) => {
      store.delete(key);
      throw e;
    },
  );
  store.set(key, { at: now, value });
  // Keep the map small: drop anything well past its time.
  if (store.size > 200) for (const [k, e] of store) if (now - e.at > 60_000) store.delete(k);
  return value;
}

/** ESPN's scoreboard JSON for one sport and day, fresh within 15 seconds (shared by My Picks' live overlay and Scores). */
export function espnScoreboardJson(url: string): Promise<any | null> {
  return fresh(`sb:${url}`, 15_000, () =>
    fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  );
}
