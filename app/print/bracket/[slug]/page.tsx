import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { getPoolContext } from "@/lib/pool";
import { isPickX } from "@/lib/pickx";
import { getPickX } from "@/lib/pickxData";
import { blankBracket, getLiveBracket, picksBracket } from "@/lib/tourneyLive";
import { getBracket, getBracketEntries } from "@/lib/brackets";
import { PrintableBracket } from "@/components/pickx/PickXBracket";
import { Wordmark } from "@/components/ui";
import { PrintNow } from "./PrintNow";

export const metadata: Metadata = { title: "Bracket" };

/**
 * The whole NCAA Tournament bracket on one landscape page, to print or save as a PDF: the site's
 * name and logo along the top, then an empty bracket (the First Round's teams, the First Four) to
 * fill in by hand. In a pool where players fill out brackets, ?user=<id> prints that entry's
 * bracket instead (its picks, champion and name; others' only once brackets lock). Pick X pools
 * print only the empty one.
 * Outside the pool's layout, so nothing but the bracket prints. Opens the print dialog by itself.
 */
export default async function PrintBracketPage({ params, searchParams }: PageProps<"/print/bracket/[slug]">) {
  const { slug } = await params;
  const { user } = await searchParams;
  const ctx = await getPoolContext(slug);
  const pickX = isPickX(ctx.pool.settings);
  const bracket = pickX ? (await getPickX(ctx)).bracket : await getBracket(ctx);
  if (!bracket) notFound();
  const tz = (ctx.pool.settings as { timezone?: string } | null)?.timezone ?? "America/Chicago";
  const now = Date.now(); // eslint-disable-line react-hooks/purity -- render-time snapshot
  const year = formatInTimeZone(bracket.lockAt, tz, "yyyy");
  const empty = blankBracket(await getLiveBracket(bracket, tz, now));
  // An entry's bracket (not in Pick X pools): its picks; nothing if it can't be seen yet.
  let live = empty;
  let filled: { champion: string | null; name: string } | undefined;
  if (!pickX && typeof user === "string") {
    const [[entry], { data: profile }] = await Promise.all([
      getBracketEntries(ctx, bracket.id, user),
      ctx.supabase.from("profiles").select("display_name").eq("id", user).maybeSingle(),
    ]);
    if (!entry) notFound();
    const p = picksBracket(empty, entry.picks);
    live = p.b;
    filled = { champion: p.champion, name: profile?.display_name ?? "" };
  }
  return (
    // Always the light colors, on screen and on paper.
    <div
      className="bracket-print min-h-screen bg-white p-6 text-[#0a0a0a]"
      style={{ ["--bg" as string]: "#ffffff", ["--surface" as string]: "#f2f2f5", ["--hover" as string]: "#e8e8ed", ["--ink" as string]: "#0a0a0a", ["--muted" as string]: "#6e6e73", ["--faint" as string]: "#aeaeb2", ["--line" as string]: "#d9d9de", ["--accent" as string]: "#0066d6", ["--live" as string]: "#c2410c", colorScheme: "light" }}
    >
      <style>{`
        @page { size: landscape; margin: 0.25in; }
        /* Games still to be decided show as blank lines (to fill in by hand), on screen and on paper. */
        .bracket-print [data-tbd] { visibility: hidden; }
        /* Each game's day and city under it, on screen as on paper (no clocks, tip times or TV). */
        .bracket-print [data-detail] { display: none; }
        .bracket-print [data-meta] { display: flex; }
        .bracket-print { --g-off: -6px; }
        @media print {
          html, body { background: #fff !important; }
          .bracket-print { padding: 0 !important; zoom: 0.61; }
          /* Tighter on paper so the whole bracket fits one page: shorter lines. */
          .bracket-print [data-line] { height: 21px; font-size: 13px; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <PrintNow />
      <div className="mx-auto w-[1500px]">
        {/* A navy banner with the logo (in white), the title and the site's address, over a gold rule. */}
        <header
          className="mb-1 grid grid-cols-[1fr_auto_1fr] items-center rounded-t-xl bg-[#0b2a5b] px-5 py-2 text-white"
          style={{ ["--ink" as string]: "#ffffff", ["--bg" as string]: "#0b2a5b", ["--accent" as string]: "#f2c14e" }}
        >
          <Wordmark className="text-2xl" />
          <h1 className="text-center leading-none">
            <span className="block text-[34px] font-extrabold tracking-[-0.02em] uppercase">
              <span className="text-[#f2c14e]">{year}</span> NCAA Tournament
            </span>
          </h1>
          <div className="text-right text-sm font-semibold text-white/85">officepoolhall.com</div>
        </header>
        <div className="mb-3 h-1.5 rounded-b-xl bg-[#f2c14e]" />
        <PrintableBracket b={live} filled={filled} />
      </div>
    </div>
  );
}
