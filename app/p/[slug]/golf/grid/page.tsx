import type { Metadata } from "next";
import { AutoRefresh } from "@/components/AutoRefresh";
import { GolfGrid, type GridRow, type GridWeek } from "@/components/GolfGrid";
import { Empty, PageTitle } from "@/components/ui";
import { getGolfContext } from "@/lib/golf";
import { getGolfStandingsData } from "@/lib/golfStandings";

export const metadata: Metadata = { title: "League Grid" };

// How golf fans say these, where the rule below would read oddly.
const SHORT: Record<string, string> = {
  "the open": "The Open",
  "go by raymond james": "Raymond James",
  "texas children's houston open": "Houston Open",
  "the cj cup byron nelson": "Byron Nelson",
  "valero texas open": "Valero",
  "wm phoenix open": "Phoenix",
  "at&t pebble beach pro-am": "Pebble Beach",
  "the american express": "AmEx",
  "farmers insurance open": "Farmers",
  "cognizant classic in the palm beaches": "Cognizant",
};

/** "Arnold Palmer Invitational pres. by Mastercard" → "Arnold Palmer"; "Masters Tournament" → "Masters". */
function shortName(name: string) {
  const known = SHORT[name.toLowerCase()];
  if (known) return known;
  let n = name.replace(/\s+(pres\.|presented)\s+by\s+.*$/i, "").replace(/^the\s+/i, "");
  const trimmed = n.replace(/\s+(Tournament|Championship|Invitational|Classic|Pro-Am)$/i, "");
  // Keep "U.S. Open"-style names whole; otherwise the first two words are enough.
  if (trimmed.split(" ").length > 1 || trimmed.length > 6) n = trimmed;
  const words = n.split(" ");
  return words.length > 2 ? words.slice(0, 2).join(" ") : n;
}

/**
 * Entries down the left in standings order, tournaments across the top through the current
 * week. Others' picks for the open week stay hidden until the lock (the database doesn't send
 * them); during play each pick shows its golfer's live place.
 */
export default async function GolfGridPage({ params }: PageProps<"/p/[slug]/golf/grid">) {
  const { slug } = await params;
  const ctx = await getGolfContext(slug);
  // eslint-disable-next-line react-hooks/purity
  const data = await getGolfStandingsData(ctx, Date.now());

  const weekList = [...data.played];
  if (data.current && !weekList.some((w) => w.week === data.current!.week)) weekList.push({ week: data.current.week, name: data.current.name, final: false });

  const rows: GridRow[] = data.rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    isMe: r.isMe,
    place: r.place,
    tied: r.tied,
    total: r.total,
    cells: weekList.map((w) => {
      const isCurrent = data.current?.week === w.week;
      const l = r.log.find((x) => x.week === w.week);
      const golfer = isCurrent ? (r.thisWeek?.golfer ?? l?.golfer ?? null) : (l?.golfer ?? null);
      return {
        golfer,
        hidden: isCurrent ? !!r.thisWeek?.hidden : false,
        finish: isCurrent && !w.final ? (r.thisWeek?.live ?? l?.finish ?? "") : (l?.finish ?? ""),
        earned: l?.earned ?? 0,
        final: w.final,
        won: w.final && l?.finish === "1",
        topOfWeek: false,
      };
    }),
  }));

  // The week's top pick (ties all marked) and the most-picked golfer.
  const weeks: GridWeek[] = weekList.map((w, i) => {
    const top = w.final ? Math.max(0, ...rows.map((r) => r.cells[i].earned)) : 0;
    if (top > 0) for (const r of rows) if (r.cells[i].earned === top) r.cells[i].topOfWeek = true;
    const counts = new Map<string, number>();
    for (const r of rows) {
      const c = r.cells[i];
      if (c.golfer && !c.hidden) counts.set(c.golfer, (counts.get(c.golfer) ?? 0) + 1);
    }
    // Only for a locked week: during an open week only the viewer's own pick is known.
    const open = data.current?.week === w.week && data.current.open;
    const [golfer, count] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? [];
    return {
      week: w.week,
      short: shortName(w.name),
      name: w.name,
      final: w.final,
      live: data.current?.week === w.week && data.current.live,
      open,
      popular: !open && golfer ? { golfer, count: count! } : null,
    };
  });

  return (
    <div data-wide>
      <PageTitle>League Grid</PageTitle>
      <AutoRefresh active={!!data.current?.live} seconds={120} />
      {weeks.length === 0 || rows.length === 0 ? (
        <Empty>The grid fills in once the first tournament is under way.</Empty>
      ) : (
        <GolfGrid rows={rows} weeks={weeks} />
      )}
    </div>
  );
}
