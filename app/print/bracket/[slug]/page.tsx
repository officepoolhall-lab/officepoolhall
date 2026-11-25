import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { getPoolContext } from "@/lib/pool";
import { isPickX } from "@/lib/pickx";
import { getPickX } from "@/lib/pickxData";
import { getLiveBracket } from "@/lib/tourneyLive";
import { PrintableBracket } from "@/components/pickx/PickXBracket";
import { Wordmark } from "@/components/ui";
import { PrintNow } from "./PrintNow";

export const metadata: Metadata = { title: "Bracket" };

/**
 * The whole NCAA Tournament bracket on one landscape page, to print or save as a PDF: the site's
 * name and logo along the top, then the bracket as it stands (scores, winners, the First Four).
 * Outside the pool's layout, so nothing but the bracket prints. Opens the print dialog by itself.
 */
export default async function PrintBracketPage({ params }: PageProps<"/print/bracket/[slug]">) {
  const { slug } = await params;
  const ctx = await getPoolContext(slug);
  if (!isPickX(ctx.pool.settings)) notFound();
  const { bracket, entries } = await getPickX(ctx);
  if (!bracket) notFound();
  const tz = (ctx.pool.settings as { timezone?: string } | null)?.timezone ?? "America/Chicago";
  const now = Date.now(); // eslint-disable-line react-hooks/purity -- render-time snapshot
  const year = formatInTimeZone(bracket.lockAt, tz, "yyyy");
  const live = await getLiveBracket(bracket, tz, now);
  const mine = entries.find((e) => e.userId === ctx.entryUserId)?.teamIds ?? [];
  return (
    // Always the light colors, on screen and on paper.
    <div
      className="bracket-print min-h-screen bg-white p-6 text-[#0a0a0a]"
      style={{ ["--bg" as string]: "#ffffff", ["--surface" as string]: "#f2f2f5", ["--hover" as string]: "#e8e8ed", ["--ink" as string]: "#0a0a0a", ["--muted" as string]: "#6e6e73", ["--faint" as string]: "#aeaeb2", ["--line" as string]: "#d9d9de", ["--accent" as string]: "#0066d6", ["--live" as string]: "#c2410c", colorScheme: "light" }}
    >
      <style>{`
        @page { size: landscape; margin: 0.25in; }
        @media print {
          html, body { background: #fff !important; }
          .bracket-print { padding: 0 !important; zoom: 0.66; }
          /* Tighter on paper so the whole bracket fits one page: shorter lines, no clocks or tip times. */
          .bracket-print [data-line] { height: 19px; font-size: 11.5px; }
          .bracket-print [data-detail] { display: none; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <PrintNow />
      <div className="mx-auto w-[1500px]">
        <header className="mb-4 grid grid-cols-[1fr_auto_1fr] items-end border-b-4 border-[#1d4ed8] pb-2">
          <Wordmark className="text-2xl" />
          <h1 className="text-center text-3xl font-extrabold tracking-[-0.03em]">{year} NCAA Tournament Bracket</h1>
          <div className="text-right text-sm text-[#6e6e73]">theofficepoolhall.com</div>
        </header>
        <PrintableBracket b={live} mine={mine} />
        {mine.length > 0 && <p className="mt-3 text-[11px] text-[#6e6e73]">Teams highlighted are your picks.</p>}
      </div>
    </div>
  );
}
