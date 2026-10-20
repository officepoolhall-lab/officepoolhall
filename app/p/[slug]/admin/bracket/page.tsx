import type { Metadata } from "next";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Field, Panel, SectionLabel, inputClass } from "@/components/ui";
import { ROUNDS, SEED_ORDER, gameKey, gameTeams, gamesIn } from "@/lib/bracket";
import { getBracket, getBracketEntries } from "@/lib/brackets";
import { windowLabel } from "@/lib/format";
import { requireCommissioner } from "@/lib/pool";
import { deleteBracket, saveBracket, saveBracketResults } from "../actions";

export const metadata: Metadata = { title: "Bracket" };

const LOCAL_INPUT = "yyyy-MM-dd'T'HH:mm";
const panelInput = `${inputClass} !bg-bg`;
const DEFAULT_REGIONS = ["East", "West", "South", "Midwest"];

/**
 * The NCAA Tournament: set the 64-team field (after the First Four) by region and seed, then
 * enter each game's winner as the tournament goes. Every bracket re-scores on each save.
 */
export default async function BracketAdminPage({ params }: PageProps<"/p/[slug]/admin/bracket">) {
  const { slug } = await params;
  const ctx = await requireCommissioner(slug);
  const tz = ctx.settings.timezone;
  const [bracket, { data: teams }, { data: slates }] = await Promise.all([
    getBracket(ctx),
    ctx.supabase.from("teams").select("id, name").eq("sport", ctx.pool.sport).order("name"),
    ctx.supabase.from("slates").select("week, label, window_start, window_end").eq("pool_id", ctx.pool.id).order("week"),
  ]);
  const entries = bracket ? await getBracketEntries(ctx, bracket.id) : [];
  // eslint-disable-next-line react-hooks/purity -- render-time snapshot of the lock
  const locked = bracket ? new Date(bracket.lockAt).getTime() <= Date.now() : false;

  const known = new Map<number, string>((slates ?? []).map((s) => [s.week, `${s.label ?? `Week ${s.week}`} · ${windowLabel(s.window_start, s.window_end, tz)}`]));
  const lastWeek = Math.max(0, ...known.keys());
  const weeks = Array.from({ length: lastWeek + 8 }, (_, i) => i + 1);
  const regions = bracket?.regions ?? DEFAULT_REGIONS;
  const ids = bracket ? bracket.field.map((t) => t?.id ?? null) : [];
  const nameOf = (id: string | null) => (id ? bracket?.field.find((t) => t?.id === id)?.name ?? "" : "");
  const seedOfTeam = (id: string) => SEED_ORDER[(bracket?.field.findIndex((t) => t?.id === id) ?? 0) % 16];

  const setup = (
    <ActionForm action={saveBracket.bind(null, slug, bracket?.id ?? null)} className="space-y-4">
      <datalist id="bracket-teams">
        {(teams ?? []).map((t) => (
          <option key={t.id} value={t.name} />
        ))}
      </datalist>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name">
          <input name="name" defaultValue={bracket?.name ?? "NCAA Tournament"} className={panelInput} />
        </Field>
        <Field label="Week">
          <select name="week" defaultValue={bracket?.week ?? lastWeek + 1} className={panelInput}>
            {weeks.map((w) => (
              <option key={w} value={w}>{known.get(w) ?? `Week ${w}`}</option>
            ))}
          </select>
        </Field>
        <Field label="Brackets lock" hint="The first First Round tip (pool time).">
          <input name="lock_at" type="datetime-local" required defaultValue={bracket ? formatInTimeZone(bracket.lockAt, tz, LOCAL_INPUT) : ""} className={`${panelInput} tabular-nums`} />
        </Field>
      </div>
      <p className="text-xs text-muted">
        Regions in Final Four order: the first two meet in one national semifinal, the last two in the other. Type each team&apos;s name and
        pick it from the list. For a First Four spot, enter the winner once it&apos;s played (before the lock).
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((r) => (
          <fieldset key={r} className="space-y-1.5">
            <input name={`region_${r}`} required defaultValue={regions[r]} aria-label={`Region ${r + 1} name`} className={`${panelInput} font-semibold`} />
            {Array.from({ length: 16 }, (_, i) => i + 1).map((seed) => {
              const slot = r * 16 + SEED_ORDER.indexOf(seed as (typeof SEED_ORDER)[number]);
              return (
                <label key={seed} className="flex items-center gap-2">
                  <span className="w-5 text-right text-xs tabular-nums text-muted">{seed}</span>
                  <input
                    name={`team_${slot}`}
                    list="bracket-teams"
                    defaultValue={bracket?.field[slot]?.name ?? ""}
                    autoComplete="off"
                    aria-label={`${regions[r]} ${seed} seed`}
                    className={`${panelInput} !h-9 !py-0 !text-sm`}
                  />
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
      <SubmitButton pending="Saving…" className="!px-5">{bracket ? "Save field" : "Create bracket"}</SubmitButton>
      {bracket && <p className="text-xs text-muted">Changing a team removes picks on the old one (and the picks after them); the rest of every bracket stays.</p>}
    </ActionForm>
  );

  if (!bracket) {
    return (
      <div className="space-y-4 lg:max-w-6xl">
        <p className="text-sm text-muted">
          Set up the NCAA Tournament once the field is announced. Players fill out a bracket from the First Round on; points grow by round and
          by seed, so upsets pay more.
        </p>
        <Panel className="p-4">{setup}</Panel>
      </div>
    );
  }

  // The first round still being played opens by default.
  const openRound = ROUNDS.find((r) => Array.from({ length: gamesIn(r.round) }, (_, g) => bracket.results[gameKey(r.round, g)]).some((w) => !w))?.round ?? 6;

  return (
    <div className="space-y-6 lg:max-w-6xl">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{bracket.name}</h2>
        <span className="text-sm text-muted">
          {locked ? "Locked" : "Locks"} {formatInTimeZone(bracket.lockAt, tz, "EEE MMM d, h:mm a")}
          {locked && <> · {entries.length} bracket{entries.length === 1 ? "" : "s"}</>}
        </span>
        <Link href={`/p/${slug}/bracket`} className="text-sm font-medium text-accent">Open my bracket</Link>
        <span className="ml-auto">
          <ActionButton action={deleteBracket.bind(null, slug, bracket.id)} kind="danger" className="!px-3 !text-sm" pendingLabel="Deleting…">
            Delete bracket
          </ActionButton>
        </span>
      </div>

      {/* Results: each game's winner, round by round. A later round lists its teams once the games before it have winners. */}
      <Panel className="p-4">
        <SectionLabel className="mb-2">Results</SectionLabel>
        <ActionForm action={saveBracketResults.bind(null, slug, bracket.id)} className="space-y-3">
          {ROUNDS.map(({ round, name }) => {
            const done = Array.from({ length: gamesIn(round) }, (_, g) => bracket.results[gameKey(round, g)]).filter(Boolean).length;
            return (
              <details key={round} open={round === openRound} className="group rounded-lg border border-line">
                <summary className="flex cursor-pointer list-none items-baseline gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
                  <span className="text-[15px] font-semibold">{name}</span>
                  <span className="text-xs text-muted tabular-nums">{done}/{gamesIn(round)} in</span>
                </summary>
                <ul className="grid gap-x-6 gap-y-1.5 px-3 pb-3 sm:grid-cols-2 lg:grid-cols-4">
                  {Array.from({ length: gamesIn(round) }, (_, g) => {
                    const [a, b] = gameTeams(round, g, ids, bracket.results);
                    const key = gameKey(round, g);
                    return (
                      <li key={key}>
                        <select
                          name={`result_${key}`}
                          defaultValue={bracket.results[key] ?? ""}
                          disabled={!a || !b}
                          aria-label={`${name} game ${g + 1} winner`}
                          className={`${panelInput} !h-9 !py-0 !text-sm`}
                        >
                          <option value="">{a && b ? `${nameOf(a)} vs ${nameOf(b)}` : "Waiting on earlier games"}</option>
                          {[a, b].filter((t): t is string => Boolean(t)).map((t) => (
                            <option key={t} value={t}>({seedOfTeam(t)}) {nameOf(t)} won</option>
                          ))}
                        </select>
                        {/* Disabled selects don't submit; keep a decided winner when its game can't be changed here. */}
                        {(!a || !b) && bracket.results[key] && <input type="hidden" name={`result_${key}`} value={bracket.results[key]} />}
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
          <SubmitButton kind="secondary" pending="Saving…" className="!px-4 !text-sm">Save results</SubmitButton>
        </ActionForm>
      </Panel>

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-accent">Edit the field, regions or lock time</summary>
        <Panel className="mt-3 p-4">{setup}</Panel>
      </details>
    </div>
  );
}
