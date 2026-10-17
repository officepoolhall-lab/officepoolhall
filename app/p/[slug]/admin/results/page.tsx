import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Empty, StatusText, buttonClass, chipClass } from "@/components/ui";
import { gameTime } from "@/lib/format";
import { getSlateGames, requireCommissioner } from "@/lib/pool";
import { overrideResult, setVoided } from "../actions";

export const metadata: Metadata = { title: "Results" };

export default async function ResultsPage({ params, searchParams }: PageProps<"/p/[slug]/admin/results">) {
  const { slug } = await params;
  const { week } = await searchParams;
  const ctx = await requireCommissioner(slug);
  const { data: slates } = await ctx.supabase
    .from("slates").select("id, week, label, status").eq("pool_id", ctx.pool.id).neq("status", "draft").order("week", { ascending: false });
  const slate = slates?.find((s) => s.week === Number(week)) ?? slates?.[0];
  if (!slate) return <Empty>Results show up here once a week is published.</Empty>;
  const games = await getSlateGames(ctx, slate.id);
  const tz = ctx.settings.timezone;

  return (
    <>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {slates?.map((s) => (
          <Link
            key={s.id}
            href={`/p/${slug}/admin/results?week=${s.week}`}
            aria-current={s.id === slate.id ? "page" : undefined}
            className={chipClass(s.id === slate.id, "min-h-11")}
          >
            {s.label ?? `Week ${s.week}`}{" "}
            {/* Status colors fail contrast on the ink-filled active chip, so it inherits there. */}
            {s.id === slate.id ? <span className="text-xs font-semibold opacity-70">{STATUS_LABEL[s.status] ?? s.status}</span> : <StatusText status={s.status} />}
          </Link>
        ))}
      </div>
      <p className="mb-4 text-sm text-muted">
        Scores come from ESPN every few minutes. Override one here if it&apos;s wrong — your score wins over the feed and
        standings recompute right away. Void a game (postponed, cancelled) to score it 0 for everyone.
      </p>
      <ul className="divide-y divide-line border-t border-line">
        {games.map((g) => (
          <li key={g.id} className={`py-3 ${g.voided ? "opacity-60" : ""}`}>
            <div className="mb-2 min-w-0">
              <div className="truncate text-[15px] font-semibold">
                {g.away.short_name} <span className="font-normal text-muted">{g.neutral ? "vs" : "@"}</span> {g.home.short_name}
              </div>
              <div className="text-xs text-muted tabular-nums">
                {gameTime(g.startAt, tz)} ·{" "}
                {g.voided ? (
                  <span className="font-semibold text-loss">Void</span>
                ) : g.overridden ? (
                  <span className="font-semibold text-ink">Overridden</span>
                ) : (
                  sentence(g.status)
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <ActionForm action={overrideResult.bind(null, slug, slate.id, g.id)} className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  {g.away.abbreviation}
                  <input name="away" type="number" min={0} defaultValue={g.awayScore ?? ""} aria-label={`${g.away.short_name ?? g.away.name} score`} className={scoreInput} />
                </label>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  {g.home.abbreviation}
                  <input name="home" type="number" min={0} defaultValue={g.homeScore ?? ""} aria-label={`${g.home.short_name ?? g.home.name} score`} className={scoreInput} />
                </label>
                <SubmitButton kind="secondary" pending="…" className="!px-4 !text-sm">Save</SubmitButton>
                {g.overridden && (
                  <button name="clear" value="1" className={buttonClass("ghost", "!px-2 !text-sm")}>Use feed</button>
                )}
              </ActionForm>
              <span className="ml-auto">
                <ActionButton action={setVoided.bind(null, slug, slate.id, g.id, !g.voided)} kind={g.voided ? "secondary" : "danger"} className="!px-4 !text-sm">
                  {g.voided ? "Un-void" : "Void"}
                </ActionButton>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

const STATUS_LABEL: Record<string, string> = { draft: "Draft", open: "Open", locked: "Locked", graded: "Final" };

const scoreInput =
  "h-11 w-16 rounded-[10px] bg-surface px-2 text-right text-[15px] font-semibold tabular-nums text-ink outline-none focus:ring-2 focus:ring-accent";

// Feed statuses arrive as snake_case ("in_progress"); show them in sentence case.
function sentence(status: string) {
  const s = status.replaceAll("_", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
