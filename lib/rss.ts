// A small RSS 2.0 reader for news feeds: just the fields the Home page shows. No dependency;
// feeds are trusted to be RSS but not to be tidy (CDATA, entities, HTML in descriptions).

export type RssItem = {
  title: string;
  link: string;
  description: string | null;
  published: string | null;
  image: string | null;
  guid: string | null;
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

function decode(text: string) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z#0-9]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function unwrap(raw: string) {
  const cdata = raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return cdata ? cdata[1] : decode(raw);
}

/** Text content of the first <tag>…</tag> (namespaced tags like dc:creator work too). */
function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? unwrap(m[1]).trim() : null;
}

/** An attribute of the first self-closing or open <tag ...>. */
function attr(block: string, name: string, attribute: string): string | null {
  const m = block.match(new RegExp(`<${name}\\s[^>]*?${attribute}=["']([^"']+)["']`, "i"));
  return m ? decode(m[1]) : null;
}

function stripHtml(html: string) {
  return decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  for (const m of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const block = m[1];
    const title = tag(block, "title");
    const link = tag(block, "link");
    if (!title || !link || !/^https?:\/\//.test(link)) continue;

    const description = tag(block, "description");
    const pub = tag(block, "pubDate") ?? tag(block, "dc:date");
    const date = pub ? new Date(pub) : null;
    // Image: <media:content|media:thumbnail url>, an image <enclosure>, or the first <img> in the body.
    const enclosureType = attr(block, "enclosure", "type");
    const image =
      attr(block, "media:content", "url") ??
      attr(block, "media:thumbnail", "url") ??
      (!enclosureType || enclosureType.startsWith("image/") ? attr(block, "enclosure", "url") : null) ??
      (tag(block, "content:encoded") ?? description ?? "").match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ??
      null;

    items.push({
      title: stripHtml(title),
      link: link.trim(),
      description: description ? stripHtml(description) || null : null,
      published: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
      image: image && /^https?:\/\//.test(image) ? image : null,
      guid: tag(block, "guid"),
    });
  }
  return items;
}
