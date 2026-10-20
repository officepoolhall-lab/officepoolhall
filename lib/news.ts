import "server-only";
import { parseRss } from "./rss";

// Top stories, mixed from several free sources and sorted newest first. Each source is
// fetched on its own and cached 15 minutes; one that fails or changes shape is skipped and
// the rest still show. To add a site, add an entry to RSS_FEEDS.

const REVALIDATE_SECONDS = 900;
const HEADERS = { Accept: "application/json, application/rss+xml, application/xml;q=0.9, */*;q=0.8", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" };

export type NewsStory = {
  id: string;
  headline: string;
  description: string | null;
  url: string;
  published: string | null;
  image: string | null;
  video: boolean;
  /** Who published it: "ESPN", "CBS Sports", "Fox Sports", "NBC Sports", "The Field of 68". */
  source: string;
};

type Sport = "ncaaf" | "ncaab";

/** Public RSS feeds per sport (checked Oct 2026). The Athletic: see docs/data-sources.md. */
type Feed = { source: string; url: string; /** Keep only stories whose link matches. */ only?: RegExp };

const RSS_FEEDS: Record<Sport, Feed[]> = {
  ncaaf: [
    { source: "CBS Sports", url: "https://www.cbssports.com/rss/headlines/college-football/" },
    // Fox Sports' public college football feed (the key is the one foxsports.com itself uses).
    { source: "Fox Sports", url: "https://api.foxsports.com/v2/content/optimized-rss?partnerKey=MB0Wehpmuj2lUhuRhQaafhBjAJqaPU244mlTDK1i&size=30&tags=fs/cfb" },
  ],
  ncaab: [
    { source: "CBS Sports", url: "https://www.cbssports.com/rss/headlines/college-basketball/" },
    // Fox Sports' college basketball tag also carries some general college sports stories.
    { source: "Fox Sports", url: "https://api.foxsports.com/v2/content/optimized-rss?partnerKey=MB0Wehpmuj2lUhuRhQaafhBjAJqaPU244mlTDK1i&size=30&tags=fs/cbk", only: /\/college-basketball\// },
    { source: "NBC Sports", url: "https://www.nbcsports.com/mens-college-basketball.rss" },
    // The Field of 68's Substack; paid-only posts open to a preview.
    { source: "The Field of 68", url: "https://thefieldof68.substack.com/feed" },
  ],
};

const ESPN_PATH: Record<Sport, string> = { ncaaf: "football/college-football", ncaab: "basketball/mens-college-basketball" };

type EspnArticle = {
  id?: number | string;
  type?: string;
  headline?: string;
  description?: string;
  published?: string;
  premium?: boolean;
  images?: { url?: string; type?: string }[];
  links?: { web?: { href?: string } };
};

async function espn(sport: Sport): Promise<NewsStory[]> {
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${ESPN_PATH[sport]}/news?limit=20`, {
    headers: HEADERS,
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { articles?: EspnArticle[] };
  return (body.articles ?? [])
    // Only stories anyone can open (no ESPN+), with somewhere to send the reader.
    .filter((a) => a.headline && a.links?.web?.href && !a.premium)
    .map((a) => ({
      id: `espn:${a.id ?? a.links!.web!.href}`,
      headline: a.headline!,
      description: a.description?.trim() || null,
      url: a.links!.web!.href!,
      published: a.published ?? null,
      image: (a.images?.find((i) => i.type === "header") ?? a.images?.[0])?.url ?? null,
      video: a.type === "Media",
      source: "ESPN",
    }));
}

async function rss(feed: Feed): Promise<NewsStory[]> {
  const res = await fetch(feed.url, { headers: HEADERS, next: { revalidate: REVALIDATE_SECONDS } });
  if (!res.ok) return [];
  return parseRss(await res.text())
    .filter((i) => !feed.only || feed.only.test(i.link))
    .map((i) => ({
    id: `${feed.source}:${i.guid ?? i.link}`,
    headline: i.title,
    description: i.description,
    url: i.link,
    published: i.published,
    image: i.image,
    video: /\/video[s]?\//i.test(i.link),
    source: feed.source,
  }));
}

/**
 * The newest `limit` stories across sources. No source gets more than `perSource`, so one
 * busy feed can't crowd the others out; a repeated headline shows once.
 */
export async function getNews(sport: Sport, limit = 12, perSource = 4): Promise<NewsStory[]> {
  const results = await Promise.allSettled([espn(sport), ...RSS_FEEDS[sport].map(rss)]);
  const bySource = results.map((r) =>
    (r.status === "fulfilled" ? r.value : [])
      .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""))
      .slice(0, perSource),
  );
  const seen = new Set<string>();
  return bySource
    .flat()
    .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""))
    .filter((s) => {
      const key = s.headline.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
