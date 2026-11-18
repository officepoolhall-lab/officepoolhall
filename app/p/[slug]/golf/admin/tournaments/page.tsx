import type { Metadata } from "next";
import { formatInTimeZone } from "date-fns-tz";
import { GolfEventAdminRow } from "@/components/GolfEventAdminRow";
import { Empty } from "@/components/ui";
import { tzAbbrev } from "@/lib/format";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Field, Panel, SectionLabel, inputClass } from "@/components/ui";
import { getGolfContext, getGolfEvents, golfFormat, type GolfEvent } from "@/lib/golf";
import { MAJORS, majorsSettings } from "@/lib/golfMajors";
import { addMajor, removeMajor, setMajorPicksOpen, updateGolfEvent } from "../actions";

export const metadata: Metadata = { title: "Tournaments" };

const STATUS: Record<string, string> = { scheduled: "Upcoming", in_progress: "Under Way", final: "Final", canceled: "Canceled" };

/**
 * The season's tournaments. Lock times, status and results come from ESPN every 10 minutes;
 * the commissioner can rename one (the TBD slot), close one under way as final (a tournament
 * cut short by weather), or cancel / restore one.
 */
export default async function GolfTournamentsPage({ params }: PageProps<"/p/[slug]/golf/admin/tournaments">) {
  const { slug } = await params;
  const ctx = await getGolfContext(slug);
  const events = await getGolfEvents(ctx);
  if (golfFormat(ctx.pool) === "majors") return <MajorsTournaments slug={slug} ctx={ctx} events={events} />;
  if (events.length === 0) return <Empty>No tournaments are set up for this pool yet.</Empty>;
  let week = 0;

  return (
    <>
      <p className="mb-3 text-sm text-muted">Lock times, status and results update from ESPN every 10 minutes.</p>
      <ol className="divide-y divide-line border-y border-line">
        {events.map((ev) => {
          if (ev.status !== "canceled") week++;
          return (
            <li key={ev.id} className="grid gap-1 py-3 sm:grid-cols-[3.5rem_minmax(0,1fr)_14rem_6rem] sm:items-center sm:gap-3">
              <span className="text-xs tabular-nums text-muted">{ev.status === "canceled" ? "—" : `Wk ${week}`}</span>
              <GolfEventAdminRow name={ev.name} status={ev.status} action={updateGolfEvent.bind(null, slug, ev.id)} />
              <span className="text-xs tabular-nums text-muted">
                {ev.start_at ? `Locks ${formatInTimeZone(ev.start_at, ctx.displayTz, "EEE MMM d, h:mm a")} ${tzAbbrev(ev.start_at, ctx.displayTz)}` : "Tee Times Not Posted"}
              </span>
              <span className={`text-xs font-semibold ${ev.status === "in_progress" ? "text-live" : ev.status === "canceled" ? "text-loss" : "text-muted"}`}>{STATUS[ev.status]}</span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/**
 * A Majors pool's tournaments: which of the four majors it covers (ESPN's tournament id for
 * each), each one's field (built here, edited on its Field page) and whether picks are open.
 */
async function MajorsTournaments({ slug, ctx, events }: { slug: string; ctx: Awaited<ReturnType<typeof getGolfContext>>; events: GolfEvent[] }) {
  const s = majorsSettings(ctx.pool.settings);
  const ids = events.map((e) => e.id);
  const { data: fieldRows } = ids.length
    ? await ctx.supabase.from("golf_field").select("event_id").in("event_id", ids)
    : { data: [] as { event_id: string }[] };
  const fieldCount = new Map<string, number>();
  for (const r of fieldRows ?? []) fieldCount.set(r.event_id, (fieldCount.get(r.event_id) ?? 0) + 1);
  const missing = MAJORS.filter((m) => !events.some((e) => e.major === m.id));
  // eslint-disable-next-line react-hooks/purity -- server render
  const now = Date.now();
  const isOpen = (e: GolfEvent) =>
    e.status === "scheduled" && !!e.start_at && now < Date.parse(e.start_at) && !!e.picks_open_at && Date.parse(e.picks_open_at) <= now;
  const field = inputClass;

  return (
    <div className="space-y-6">
      {events.length === 0 ? (
        <Empty>Add the majors this pool covers below.</Empty>
      ) : (
        <ol className="divide-y divide-line border-y border-line">
          {events.map((ev) => {
            const n = fieldCount.get(ev.id) ?? 0;
            const started = ev.status !== "scheduled";
            return (
              <li key={ev.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="font-semibold">{ev.name}</div>
                  <div className="text-xs tabular-nums text-muted">
                    {ev.start_at ? `Locks ${formatInTimeZone(ev.start_at, ctx.displayTz, "EEE MMM d, h:mm a")} ${tzAbbrev(ev.start_at, ctx.displayTz)}` : "Tee times not posted"}
                    {" · "}
                    <span className={ev.status === "in_progress" ? "font-semibold text-live" : ""}>{STATUS[ev.status]}</span>
                    {" · "}
                    {n ? `Field of ${n}` : "Field not built"}
                    {!started && (isOpen(ev) ? " · Picks open" : " · Picks not open")}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/p/${slug}/golf/admin/field?event=${ev.id}`} className={buttonLink}>
                    {s.contest === "salary" ? "Field & Salaries" : "Field & Tiers"}
                  </Link>
                  {!started && n > 0 && (
                    <ActionForm action={setMajorPicksOpen.bind(null, slug, ev.id, !isOpen(ev))}>
                      <SubmitButton kind={isOpen(ev) ? "secondary" : "primary"} pending="Saving…" className="!min-h-9 !px-3 !text-sm">
                        {isOpen(ev) ? "Close picks" : "Open picks"}
                      </SubmitButton>
                    </ActionForm>
                  )}
                  {!started && (
                    <ActionForm action={removeMajor.bind(null, slug, ev.id)}>
                      <SubmitButton kind="secondary" pending="Removing…" className="!min-h-9 !px-3 !text-sm">
                        Remove
                      </SubmitButton>
                    </ActionForm>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {missing.length > 0 && (
        <Panel className="p-4">
          <SectionLabel>Add a major</SectionLabel>
          <ActionForm action={addMajor.bind(null, slug)} className="mt-2 grid gap-3 sm:grid-cols-[14rem_minmax(0,1fr)_auto] sm:items-end">
            <Field label="Major">
              <select name="major" className={field.replace("bg-surface", "bg-bg")}>
                {missing.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="ESPN tournament id" hint="The number at the end of its ESPN leaderboard link (…/tournamentId/401811937).">
              <input name="espn_id" inputMode="numeric" required className={`${field.replace("bg-surface", "bg-bg")} tabular-nums`} />
            </Field>
            <SubmitButton kind="primary" pending="Adding…">
              Add
            </SubmitButton>
          </ActionForm>
        </Panel>
      )}
      <p className="text-sm text-muted">
        Tee times, the field and scores update from ESPN every 10 minutes. Build each major&apos;s field once ESPN posts it (usually the week before), check it,
        then open picks. Picks lock at the first tee time.
      </p>
    </div>
  );
}

const buttonLink =
  "inline-flex min-h-9 items-center rounded-full border border-line px-3 text-sm font-semibold text-ink hover:bg-surface";
