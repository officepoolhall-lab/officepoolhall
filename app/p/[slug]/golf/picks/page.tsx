import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Empty, Field, inputClass, PageTitle, Panel } from "@/components/ui";
import { gameTime } from "@/lib/format";
import {
  getGolfContext,
  getGolfEvents,
  getGolfMyPicks,
  getGolfResults,
  isOpenForPicks,
  type GolfEvent,
  type GolfPick,
  type GolfResult,
} from "@/lib/golf";
import { saveGolfPick } from "../actions";

export const metadata: Metadata = { title: "My Picks" };

function statusLabel(ev: GolfEvent, open: boolean) {
  if (ev.status === "final") return "Final";
  if (ev.status === "in_progress") return "In progress";
  if (ev.status === "canceled") return "Canceled";
  return open ? "Open" : "Locked";
}

export default async function GolfPicksPage({ params }: PageProps<"/p/[slug]/golf/picks">) {
  const { slug } = await params;
  const ctx = await getGolfContext(slug);
  const [events, myPicks] = await Promise.all([getGolfEvents(ctx), getGolfMyPicks(ctx)]);
  const now = Date.now();

  // The field is only needed for events still open for picks.
  const openEvents = events.filter((ev) => isOpenForPicks(ev, now));
  const fields = new Map<string, GolfResult[]>(
    await Promise.all(openEvents.map(async (ev) => [ev.id, await getGolfResults(ctx, ev.id)] as [string, GolfResult[]])),
  );
  const pickByEvent = new Map<string, GolfPick>(myPicks.map((p) => [p.event_id, p] as [string, GolfPick]));

  return (
    <>
      <PageTitle sub={ctx.managing ? `Co-managing ${ctx.managing.ownerName}'s entry` : "One golfer per event. Each golfer can be used once per season."}>
        My Picks
      </PageTitle>
      {ctx.isGuest && <p className="mb-4 text-sm text-muted">Guests can view picks but can&apos;t make them.</p>}

      {events.length === 0 ? (
        <Empty>No events are set up for this pool yet.</Empty>
      ) : (
        <div className="grid gap-3">
          {events.map((ev) => {
            const open = isOpenForPicks(ev, now);
            const mine = pickByEvent.get(ev.id);
            const field = fields.get(ev.id) ?? [];
            const usedElsewhere = new Set(myPicks.filter((p) => p.event_id !== ev.id).map((p) => p.espn_golfer_id));
            const canPick = open && !ctx.isGuest;

            return (
              <Panel key={ev.id} className="p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-semibold">
                    {ev.sort_order}. {ev.name}
                  </h2>
                  <span className="text-xs text-muted">{statusLabel(ev, open)}</span>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {ev.start_at ? `First tee ${gameTime(ev.start_at, ctx.displayTz)}` : "Tee time not posted yet"}
                </p>
                <p className="mt-2 text-sm">
                  {mine ? (
                    <>
                      <span className="text-muted">Your pick: </span>
                      <span className="font-medium">{mine.golfer_name}</span>
                    </>
                  ) : (
                    <span className="text-muted">No pick{open ? " yet" : ""}.</span>
                  )}
                </p>

                {canPick &&
                  (field.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">The field hasn&apos;t been posted yet.</p>
                  ) : (
                    <ActionForm action={saveGolfPick.bind(null, slug, ev.id)} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                      {ctx.managing && <input type="hidden" name="for" value={ctx.entryUserId} />}
                      <Field label="Golfer">
                        <select name="golfer" defaultValue={mine?.espn_golfer_id ?? ""} className={inputClass} required>
                          <option value="" disabled>
                            Choose a golfer
                          </option>
                          {field.map((g) => {
                            const used = usedElsewhere.has(g.espn_golfer_id);
                            return (
                              <option key={g.espn_golfer_id} value={g.espn_golfer_id} disabled={used}>
                                {g.golfer_name}
                                {used ? " (already used)" : ""}
                              </option>
                            );
                          })}
                        </select>
                      </Field>
                      <SubmitButton>{mine ? "Change pick" : "Save pick"}</SubmitButton>
                    </ActionForm>
                  ))}
              </Panel>
            );
          })}
        </div>
      )}
    </>
  );
}
