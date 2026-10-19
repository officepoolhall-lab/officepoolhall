import "server-only";

// Top stories from ESPN's undocumented site API (same source as scores and the AP poll; shape
// checked Oct 2026). Cached 15 minutes, so the list stays fresh without a job or a table.

const PATH = { ncaaf: "football/college-football", ncaab: "basketball/mens-college-basketball" } as const;
const REVALIDATE_SECONDS = 900;

export type NewsStory = {
  id: string;
  headline: string;
  description: string | null;
  url: string;
  published: string | null;
  image: string | null;
  video: boolean;
  byline: string | null;
};

type EspnArticle = {
  id?: number | string;
  type?: string;
  headline?: string;
  description?: string;
  published?: string;
  byline?: string;
  premium?: boolean;
  images?: { url?: string; type?: string }[];
  links?: { web?: { href?: string } };
};

/** The latest stories, newest first, or [] if ESPN is unreachable. */
export async function getNews(sport: "ncaaf" | "ncaab", limit = 12): Promise<NewsStory[]> {
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${PATH[sport]}/news?limit=${limit + 8}`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { articles?: EspnArticle[] };
    return (body.articles ?? [])
      // Only stories anyone can open, with somewhere to send the reader.
      .filter((a) => a.headline && a.links?.web?.href && !a.premium)
      .map((a) => ({
        id: String(a.id ?? a.links!.web!.href),
        headline: a.headline!,
        description: a.description?.trim() || null,
        url: a.links!.web!.href!,
        published: a.published ?? null,
        image: (a.images?.find((i) => i.type === "header") ?? a.images?.[0])?.url ?? null,
        video: a.type === "Media",
        byline: a.byline ?? null,
      }))
      .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""))
      .slice(0, limit);
  } catch {
    return [];
  }
}
