import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { GolfEventSelect } from "@/components/GolfEventSelect";
import { MajorFieldEditor } from "@/components/MajorFieldEditor";
import { Empty } from "@/components/ui";
import { tzAbbrev } from "@/lib/format";
import { getGolfContext, getGolfEvents, golfFormat } from "@/lib/golf";
import { oddsKeyFor } from "@/lib/golfMajors";
import { getMajorField, getMajorsSettings, getStoredOdds } from "@/lib/golfMajorsData";
import { buildMajorField, saveMajorField } from "../actions";

export const metadata: Metadata = { title: "Field" };

/**
 * A major's field for a Majors pool: build it from ESPN's posted field with world rank and
 * DraftKings odds (tiers or salaries by the pool's rules), then move golfers between tiers or
 * edit salaries. Fixed once the major starts.
 */
export default async function MajorFieldPage({ params, searchParams }: PageProps<"/p/[slug]/golf/admin/field">) {
  const { slug } = await params;
  const { event: eventParam } = await searchParams;
  const ctx = await getGolfContext(slug);
  if (golfFormat(ctx.pool) !== "majors") notFound();
  const events = await getGolfEvents(ctx);
  if (!events.length) return <Empty>Add a major on the Tournaments tab first.</Empty>;
  // eslint-disable-next-line react-hooks/purity -- server render
  const now = Date.now();
  const event = events.find((e) => e.id === eventParam) ?? events.find((e) => e.status === "scheduled") ?? events[0];
  const s = getMajorsSettings(ctx);
  const oddsKey = oddsKeyFor(event);
  const [golfers, odds, { count: espnCount }] = await Promise.all([
    getMajorField(ctx, event.id),
    oddsKey ? getStoredOdds(ctx, oddsKey) : Promise.resolve({ odds: new Map(), updatedAt: null }),
    ctx.supabase.from("golf_results").select("*", { count: "exact", head: true }).eq("event_id", event.id),
  ]);
  const locked = event.status !== "scheduled" || (!!event.start_at && Date.parse(event.start_at) <= now);
  const sourceLabel =
    s.contest === "salary"
      ? `salaries from the formula (${Math.round(s.salary.rankWeight * 100)}% world rank, ${100 - Math.round(s.salary.rankWeight * 100)}% DraftKings odds)`
      : `tiers from ${s.tiers.source === "odds" ? "DraftKings odds" : s.tiers.source === "blend" ? "world rank and DraftKings odds" : "world rank"}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{event.name}</h2>
          <p className="text-xs text-muted">
            {espnCount ? `ESPN field: ${espnCount} golfers` : "ESPN hasn't posted the field yet"}
            {" · "}
            {odds.updatedAt ? `DraftKings odds as of ${formatInTimeZone(odds.updatedAt, ctx.displayTz, "MMM d, h:mm a")} ${tzAbbrev(odds.updatedAt, ctx.displayTz)}` : "No odds stored"}
          </p>
        </div>
        <GolfEventSelect basePath={`/p/${slug}/golf/admin/field`} value={event.id} events={events.map((e) => ({ id: e.id, label: e.name }))} />
      </div>

      {!locked && (
        <ActionForm action={buildMajorField.bind(null, slug, event.id)} className="flex flex-wrap items-center gap-3">
          <SubmitButton kind={golfers.length ? "secondary" : "primary"} pending="Building…" disabled={!espnCount}>
            {golfers.length ? "Rebuild the field" : "Build the field"}
          </SubmitButton>
          <span className="text-xs text-muted">
            Uses ESPN&apos;s field with {sourceLabel}.{golfers.length ? " Rebuilding replaces your edits." : ""}
          </span>
        </ActionForm>
      )}

      {golfers.length === 0 ? (
        <Empty>No field yet.</Empty>
      ) : (
        <MajorFieldEditor
          golfers={golfers}
          contest={s.contest}
          tierCount={s.tiers.count}
          picks={s.tiers.picks}
          budget={s.salary.budget}
          roster={s.salary.roster}
          locked={locked}
          save={saveMajorField.bind(null, slug, event.id)}
        />
      )}
    </div>
  );
}
