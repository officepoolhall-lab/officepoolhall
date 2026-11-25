import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { getPoolContext } from "@/lib/pool";
import { isPickX } from "@/lib/pickx";
import { getPickX } from "@/lib/pickxData";
import { blankBracket, getLiveBracket } from "@/lib/tourneyLive";
import { PrintableBracket } from "@/components/pickx/PickXBracket";
import { Wordmark } from "@/components/ui";
import { PrintNow } from "./PrintNow";

export const metadata: Metadata = { title: "Bracket" };

/**
 * The whole NCAA Tournament bracket on one landscape page, to print or save as a PDF: the site's
 * name and logo along the top, then the bracket as it stands (scores, winners, the First Four), or
 * with ?blank=1 an empty one (just the First Round's teams) to fill in.
 * Outside the pool's layout, so nothing but the bracket prints. Opens the print dialog by itself.
 */
export default async function PrintBracketPage({ params, searchParams }: PageProps<"/print/bracket/[slug]">) {
  const { slug } = await params;
  const blank = (await searchParams).blank === "1";
  const ctx = await getPoolContext(slug);
  if (!isPickX(ctx.pool.settings)) notFound();
  const { bracket } = await getPickX(ctx);
  if (!bracket) notFound();
  const tz = (ctx.pool.settings as { timezone?: string } | null)?.timezone ?? "America/Chicago";
  const now = Date.now(); // eslint-disable-line react-hooks/purity -- render-time snapshot
  const year = formatInTimeZone(bracket.lockAt, tz, "yyyy");
  const current = await getLiveBracket(bracket, tz, now);
  const live = blank ? blankBracket(current) : current;
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
        <PrintableBracket b={live} />
      </div>
    </div>
  );
}
