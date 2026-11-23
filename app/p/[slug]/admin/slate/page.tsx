import type { Metadata } from "next";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Field, LinkButton, Panel, StatusText, chipClass, inputClass } from "@/components/ui";
import { dayKey, gameTime, windowLabel } from "@/lib/format";
import { gameDateZone, isGameLocked } from "@/lib/locks";
import { getSlateGames, requireCommissioner } from "@/lib/pool";
import { localDate, nextWindowStartDate } from "@/lib/slateWindow";
import { getTeamRecords } from "@/lib/teamRecords";
import { addOpenWeekGame, createSlate, resolveTeamMatch, saveDeadlines, syncSchedule, updateOpenDeadlines } from "../actions";
import { ActionButton } from "@/components/ActionButton";
import { GameTimeInput, SlateEditor, WeekDates, type Candidate } from "./SlateEditor";
import { Matchup } from "@/components/Matchup";
import { teamSport } from "@/lib/sports";
import { NFL_WEEKS, currentNflWeek, nflWeekLabel, nflWeekWindow } from "@/lib/nflWeeks";
import { poolFormat } from "@/lib/formats";
import { survivorStandings } from "@/lib/survivor";
import { getSurvivor } from "@/lib/survivorData";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Slate editor" };

// Inputs sit on a bg-surface panel here, so they take the page color to stay visible.
const panelInput = `${inputClass.replace("bg-surface", "bg-bg")} ring-1 ring-line`;

// datetime-local input value format.
const LOCAL_INPUT = "yyyy-MM-dd'T'HH:mm";
const STATUS_LABEL: Record<string, string> = { draft: "Draft", open: "Open", locked: "Locked", graded: "Final" };
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Margin around the window when fetching candidates (see DraftEditor).
const EDGE_MS = 6 * 3_600_000;

/** "Mon Nov 2, 3:00 PM" in the pool's time zone. */
const deadline = (at: string, tz: string) => formatInTimeZone(at, tz, "EEE MMM d, h:mm a");

export default async function SlateAdminPage({ params, searchParams }: PageProps<"/p/[slug]/admin/slate">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireCommissioner(slug);
  const tz = ctx.settings.timezone;

  const { data: slates } = await ctx.supabase.from("slates").select("*").eq("pool_id", ctx.pool.id).order("week", { ascending: false });
  const wantNew = sp.new === "1" || !slates?.length;
  const slate = wantNew
    ? null
    : (slates?.find((s) => s.week === Number(sp.week)) ?? slates?.find((s) => s.status === "draft") ?? slates?.[0] ?? null);

  // NFL pools: weeks are the league's (dates and games set automatically); the next one to add.
  const nfl = ctx.pool.sport === "nfl";
  const nextNfl = nfl ? (NFL_WEEKS.find((w) => w >= Math.max((slates?.[0]?.week ?? 0) + 1, currentNflWeek(ctx.pool.season))) ?? null) : null;
  // Suggest the window after the latest slate, or the next one from today.
  const after = slates?.[0] ? new Date(slates[0].window_end) : new Date();
  const suggestedStart = nextWindowStartDate(new Date(after.getTime() - 1), ctx.settings);

  return (
    <>
      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
        {slates?.map((s) => (
          <Link
            key={s.id}
            href={`/p/${slug}/admin/slate?week=${s.week}`}
            aria-current={s.id === slate?.id ? "page" : undefined}
            className={chipClass(s.id === slate?.id, "min-h-11")}
          >
            {s.label ?? `Week ${s.week}`}{" "}
            {/* Status colors fail contrast on the ink-filled active chip, so it inherits there. */}
            {s.id === slate?.id ? <span className="text-xs font-semibold opacity-70">{STATUS_LABEL[s.status] ?? s.status}</span> : <StatusText status={s.status} />}
          </Link>
        ))}
        <Link href={`/p/${slug}/admin/slate?new=1`} aria-current={wantNew ? "page" : undefined} className={chipClass(wantNew, "min-h-11")}>
          + New week
        </Link>
      </div>

      {(wantNew || !slate) && nfl ? (
        <Panel className="p-4 sm:p-5">
          {nextNfl === null ? (
            <p className="text-sm text-muted">The NFL season is over.</p>
          ) : (
            <>
              <h2 className="text-base font-bold tracking-[-0.01em] text-ink">{nflWeekLabel(nextNfl)}</h2>
              <p className="mb-4 mt-0.5 text-sm text-muted">
                {windowLabel(nflWeekWindow(ctx.pool.season, nextNfl).start.toISOString(), nflWeekWindow(ctx.pool.season, nextNfl).end.toISOString(), tz)} · every NFL game that
                week is added automatically. Players don&apos;t see it until you publish.
              </p>
              <div className="flex flex-wrap items-start gap-2">
                <ActionForm action={createSlate.bind(null, slug)}>
                  <SubmitButton kind="accent" pending="Creating…">Create {nflWeekLabel(nextNfl)}</SubmitButton>
                </ActionForm>
                {/* No games for that week yet: pull ESPN's schedule first. */}
                <ActionButton action={syncSchedule.bind(null, slug)} pendingLabel="Syncing…" kind="secondary">
                  Sync ESPN schedule
                </ActionButton>
              </div>
            </>
          )}
        </Panel>
      ) : wantNew || !slate ? (
        <Panel className="p-4 sm:p-5">
          <h2 className="text-base font-bold tracking-[-0.01em] text-ink">New week</h2>
          <p className="mb-4 mt-0.5 text-sm text-muted">Pick the week&apos;s dates, then add games to the draft. Players don&apos;t see it until you publish.</p>
          <ActionForm action={createSlate.bind(null, slug)} className="space-y-4">
            <WeekDates
              defaultStart={suggestedStart}
              settings={{ timezone: tz, window: ctx.settings.window, lock: ctx.settings.lock }}
              inputClass={panelInput}
            />
            <Field label="Label (optional)">
              <input name="label" placeholder={`Week ${(slates?.[0]?.week ?? 0) + 1}`} className={panelInput} />
            </Field>
            <SubmitButton kind="accent" pending="Creating…">Create the week</SubmitButton>
          </ActionForm>
        </Panel>
      ) : slate.status === "draft" ? (
        <DraftEditor slug={slug} slateId={slate.id} />
      ) : (
        <PublishedSummary slug={slug} slate={slate} />
      )}
    </>
  );

  async function DraftEditor({ slug, slateId }: { slug: string; slateId: string }) {
    const s = slate!;
    const firstDay = WEEKDAYS[ctx.settings.window.start_weekday];
    const firstDayGroup = Boolean(ctx.settings.lock.weekly?.first_day_time) || s.first_day_lock_at !== null;
    const onSlate = await getSlateGames(ctx, slateId);
    const onSlateIds = new Set(onSlate.map((g) => g.id));

    const [{ data: games }, { data: lines }, { data: teams }, { data: queue }] = await Promise.all([
      ctx.supabase
        .from("games")
        .select(`id, espn_id, start_at, time_tbd, tv_network, home_rank, away_rank, neutral_site, venue,
          home:teams!games_home_team_id_fkey ( espn_id, name, short_name, abbreviation, conference, logo_url ),
          away:teams!games_away_team_id_fkey ( espn_id, name, short_name, abbreviation, conference, logo_url )`)
        .eq("sport", ctx.pool.sport)
        // Widened by a few hours: a TBD game's placeholder (midnight Eastern) sits outside
        // the window's Central edges. The exact day filter is below.
        .gte("start_at", new Date(new Date(s.window_start).getTime() - EDGE_MS).toISOString())
        .lt("start_at", new Date(new Date(s.window_end).getTime() + EDGE_MS).toISOString())
        .order("start_at")
        .limit(1000),
      ctx.supabase.from("latest_game_lines").select("game_id, home_spread").eq("bookmaker", ctx.settings.lines.bookmaker),
      ctx.supabase.from("teams").select("id, name").eq("sport", ctx.pool.sport).order("name"),
      ctx.supabase.from("team_match_queue").select("*").eq("sport", ctx.pool.sport).eq("resolved", false).order("last_seen_at", { ascending: false }),
    ]);
    const lineByGame = new Map((lines ?? []).map((l) => [l.game_id, l.home_spread === null ? null : Number(l.home_spread)]));

    // In the window by the game's own date (TBD games by their Eastern date), and not yet
    // locked: a real tip in the future, or for a TBD game, its deadline ahead.
    const firstDate = localDate(new Date(s.window_start), tz);
    const lastDate = localDate(new Date(new Date(s.window_end).getTime() - 1), tz);
    const now = Date.now();
    // The demo pool's made-up games ("demo-…") never show up anywhere else.
    const isDemoPool = ctx.pool.slug === "hoops-demo";
    const candidates: Candidate[] = (games ?? [])
      .filter((g) => {
        if (onSlateIds.has(g.id)) return false;
        if (!isDemoPool && g.espn_id?.startsWith("demo-")) return false;
        // College: Division I against Division I only. ESPN's D-I scoreboard also lists D-I
        // teams' games against non-D-I schools (e.g. Mount Marty at South Dakota); those
        // opponents have no D-I conference, so a game needs a conference on both sides. NFL
        // teams have no conference in our data, so this never applies to the NFL.
        if (ctx.pool.sport !== "nfl" && (!g.home?.conference || !g.away?.conference)) return false;
        const date = dayKey(g.start_at, gameDateZone(g.time_tbd, tz));
        if (date < firstDate || date > lastDate) return false;
        const lock = g.time_tbd ? (s.lock_at ?? g.start_at) : g.start_at;
        return new Date(lock).getTime() > now;
      })
      .map((g) => ({
        id: g.id,
        startAt: g.start_at,
        timeTbd: g.time_tbd,
        tv: g.tv_network,
        homeRank: g.home_rank,
        awayRank: g.away_rank,
        neutral: g.neutral_site,
        venue: g.venue,
        home: g.home,
        away: g.away,
        line: lineByGame.get(g.id) ?? null,
      }));
    // Teams' current records (ESPN), for every game on the slate or available to add.
    const records = await getTeamRecords(teamSport(ctx.pool.sport), [
      ...onSlate.map((g) => g.startAt),
      ...candidates.map((c) => c.startAt),
    ]);

    return (
      <>
        <p className="mb-4 text-sm text-muted">
          {s.label} · {windowLabel(s.window_start, s.window_end, tz)}
        </p>
        {ctx.settings.lock.mode === "weekly" && (
          <Panel className="mb-6 p-4 sm:p-5">
            <h2 className="mb-1 text-base font-bold tracking-[-0.01em] text-ink">Deadlines</h2>
            {firstDayGroup ? (
              // TODO(brooks): all first-day games lock together at the first tip that day (RULES.md Q4).
              <p className="mb-3 text-sm text-muted">
                {firstDay} games lock together at the earlier of this time and the first {firstDay} tip. Any game that tips
                earlier locks at tip-off.
              </p>
            ) : (
              <p className="mb-3 text-sm text-muted">
                The whole week locks at this deadline. A game that tips before it locks at its own tip-off.
              </p>
            )}
            <ActionForm action={saveDeadlines.bind(null, slug, slateId)} className="grid gap-3 sm:grid-cols-2">
              {/* Only pools with a first-day deadline in their rules (or a slate that already has one, so it can be cleared). */}
              {firstDayGroup && (
                <Field label={`${firstDay} games`} hint="Blank = everything locks at one deadline.">
                  <input
                    type="datetime-local" name="first_day_lock_at" className={`${panelInput} tabular-nums`}
                    defaultValue={s.first_day_lock_at ? formatInTimeZone(s.first_day_lock_at, tz, LOCAL_INPUT) : ""}
                  />
                </Field>
              )}
              <Field label={firstDayGroup ? "Everything else" : "Week locks"} hint={`${tz.replace("America/", "").replace("_", " ")} time`}>
                <input
                  type="datetime-local" name="lock_at" required className={`${panelInput} tabular-nums`}
                  defaultValue={s.lock_at ? formatInTimeZone(s.lock_at, tz, LOCAL_INPUT) : ""}
                />
              </Field>
              <SubmitButton kind="secondary" pending="Saving…" className="!px-4 !text-sm sm:col-span-2 sm:justify-self-start">
                Save deadlines
              </SubmitButton>
            </ActionForm>
          </Panel>
        )}
        <SlateEditor
          slug={slug}
          slateId={slateId}
          onSlate={onSlate.map((g) => ({ ...g, line: lineByGame.get(g.id) ?? null }))}
          candidates={candidates}
          records={records}
          showFilters={ctx.pool.sport !== "nfl"}
          // NFL weeks hold every game of the week: nothing to add or remove.
          fixed={nfl}
          teams={teams ?? []}
          settings={{
            pickType: ctx.settings.pick_type,
            picksPerSlate: ctx.settings.picks_per_slate,
            picksMode: ctx.settings.picks_mode,
            confidence: Boolean(ctx.settings.confidence),
            forceHalfPoint: ctx.settings.lines.force_half_point,
            timezone: tz,
            bookmaker: ctx.settings.lines.bookmaker,
            weeklyLock: ctx.settings.lock.mode === "weekly",
          }}
          defaultManualStart={`${localDate(new Date(s.window_start), tz)}T19:00`}
        />
        {/* Unmatched names come from the line feed, which only against-the-spread pools use. */}
        {ctx.settings.pick_type === "ats" && Boolean(queue?.length) && (
          <Panel className="mt-6 p-4 sm:p-5">
            <h2 className="mb-1 text-base font-bold tracking-[-0.01em] text-ink">Unmatched team names</h2>
            <p className="mb-3 text-sm text-muted">The line feed used these names. Match each to a team so its lines come through.</p>
            <ul className="space-y-2">
              {queue!.map((q) => (
                <li key={q.id}>
                  <ActionForm action={resolveTeamMatch.bind(null, slug)} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="queue_id" value={q.id} />
                    <span className="min-w-40 text-[15px] font-medium">{q.raw_name}</span>
                    <select name="team_id" required className={`${panelInput} max-w-64 flex-1`}>
                      <option value="">Choose team…</option>
                      {teams?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <SubmitButton kind="primary" pending="…" className="!px-4 !text-sm">Match</SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </>
    );
  }

  async function PublishedSummary({ slug, slate }: { slug: string; slate: NonNullable<typeof slates>[number] }) {
    const [games, { data: allProgress }] = await Promise.all([
      getSlateGames(ctx, slate.id),
      ctx.supabase.rpc("slate_progress", { p_slate_id: slate.id }),
    ]);
    // Survivor: one pick a week (in survivor_picks), from the entries still in this week. Here,
    // on Commissioner → Slate, is where a commissioner makes or fixes someone's pick.
    const survivor = poolFormat(ctx.pool.settings) === "survivor";
    let progress = allProgress;
    if (survivor && allProgress) {
      const sv = await getSurvivor(ctx);
      const svRows = survivorStandings(sv.weeks, sv.picks, sv.members, sv.settings, sv.split);
      const inWeek = new Set(
        svRows.filter((r) => r.cells.some((c) => c.slateId === slate.id && c.state !== "out" && c.state !== "before")).map((r) => r.userId),
      );
      const db = ctx.supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
      const { data: svPicks } = await db.from("survivor_picks").select("user_id").eq("slate_id", slate.id);
      const has = new Set(((svPicks ?? []) as { user_id: string }[]).map((p) => p.user_id));
      progress = allProgress.filter((p) => inWeek.has(p.user_id)).map((p) => ({ ...p, picks: has.has(p.user_id) ? 1 : 0 }));
    }
    const need = survivor ? 1 : ctx.settings.picks_per_slate;
    // This week's tournament champion picks (college basketball): how many each entry has in.
    // Read with the service role (the page is the commissioner's) since picks stay private until
    // each tournament locks.
    const admin = createAdminClient() as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data: weekTourneys } = survivor ? { data: [] } : await admin.from("tournaments").select("id").eq("pool_id", ctx.pool.id).eq("week", slate.week);
    const tourneyIds = ((weekTourneys ?? []) as { id: string }[]).map((t) => t.id);
    const champPicks = new Map<string, number>();
    if (tourneyIds.length) {
      const { data: tp } = await admin.from("tournament_picks").select("user_id").in("tournament_id", tourneyIds);
      for (const r of (tp ?? []) as { user_id: string }[]) champPicks.set(r.user_id, (champPicks.get(r.user_id) ?? 0) + 1);
    }
    const firstDay = WEEKDAYS[ctx.settings.window.start_weekday];
    // publish_slate pulls the first-day group's deadline to that day's first tip when it's
    // earlier; any deadline before both slate-level ones is that group's.
    const before = (at: string, than: string | null) => than === null || new Date(at) < new Date(than);
    const groupLock = games
      .map((g) => g.lockAt)
      .filter((at): at is string => at !== null && slate.first_day_lock_at !== null && before(at, slate.first_day_lock_at) && before(at, slate.lock_at))
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
    // Tip times are often announced after publish, so TBD games (and ones the commissioner
    // timed) can still be set until they lock. The database re-checks.
    const now = Date.now();
    const timeable =
      slate.status === "open" ? games.filter((g) => !g.voided && (g.timeTbd || g.manualTime) && !isGameLocked(g, now)) : [];
    // Games a commissioner can add to an open week: scheduled, not started, in the next two
    // weeks, and not on any week in this pool yet.
    async function addableGames() {
      const { data: used } = await ctx.supabase
        .from("slate_games").select("game_id, slates!inner(pool_id)").eq("slates.pool_id", ctx.pool.id);
      const taken = new Set((used ?? []).map((r) => r.game_id));
      const { data } = await ctx.supabase
        .from("games")
        .select(`id, start_at, home:teams!games_home_team_id_fkey ( name ), away:teams!games_away_team_id_fkey ( name )`)
        .eq("sport", ctx.pool.sport)
        .eq("status", "scheduled")
        .not("espn_id", "is", null)
        .gt("start_at", new Date(now).toISOString())
        .lt("start_at", new Date(now + 14 * 86_400_000).toISOString())
        .order("start_at")
        .limit(300);
      return (data ?? [])
        .filter((g) => !taken.has(g.id))
        .map((g) => ({ id: g.id, label: `${g.away.name} @ ${g.home.name} · ${gameTime(g.start_at, tz)}` }));
    }
    const addable = slate.status === "open" && !nfl ? await addableGames() : [];
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-surface p-4 sm:p-5">
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-bold tracking-[-0.01em] text-ink">{slate.label}</h2>
            <StatusText status={slate.status} />
          </div>
          <p className="mt-0.5 text-sm text-muted tabular-nums">
            {windowLabel(slate.window_start, slate.window_end, tz)} · {games.length} games · published{" "}
            {slate.published_at && new Date(slate.published_at).toLocaleString("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" })}
          </p>
          {slate.lock_at && (
            <p className="mt-0.5 text-sm text-muted tabular-nums">
              {slate.first_day_lock_at && (
                <>
                  {firstDay} games due {deadline(groupLock ?? slate.first_day_lock_at, tz)}
                  {groupLock && " (first tip)"} ·{" "}
                </>
              )}
              {slate.first_day_lock_at ? "everything else" : "Picks due"} {deadline(slate.lock_at, tz)}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <LinkButton href={`/p/${slug}/admin/results?week=${slate.week}`} kind="secondary" className="!bg-bg ring-1 ring-line">Fix a result</LinkButton>
            {/* Survivor's grid is its Standings page. */}
            <LinkButton href={survivor ? `/p/${slug}/standings` : `/p/${slug}/grid/${slate.week}`} kind="secondary" className="!bg-bg ring-1 ring-line">League Grid</LinkButton>
            {/* Pull new games and time changes from ESPN (also fills in NFL weeks not yet published). */}
            <ActionButton action={syncSchedule.bind(null, slug)} pendingLabel="Syncing…" kind="secondary" className="!bg-bg ring-1 ring-line">
              Sync ESPN schedule
            </ActionButton>
          </div>
        </div>
        {slate.status === "open" && ctx.settings.lock.mode === "weekly" && slate.lock_at && (
          <section className="rounded-2xl bg-surface p-4 sm:p-5">
            <h2 className="text-base font-bold tracking-[-0.01em] text-ink">Change the deadline</h2>
            <p className="mt-0.5 text-sm text-muted">
              Games already locked stay locked; every other game moves to the new deadline (or locks at tip-off if that&apos;s earlier).
            </p>
            {/* datetime-local's value has to change for the form to reset after a save, so key it. */}
            <ActionForm key={`${slate.lock_at}-${slate.first_day_lock_at}`} action={updateOpenDeadlines.bind(null, slug, slate.id)} className="mt-3 grid gap-3 sm:grid-cols-2">
              {slate.first_day_lock_at && (
                <Field label={`${firstDay} games`} hint="Leave as is once it has passed.">
                  <input
                    type="datetime-local" name="first_day_lock_at" className={`${panelInput} tabular-nums`}
                    defaultValue={formatInTimeZone(slate.first_day_lock_at, tz, LOCAL_INPUT)}
                  />
                </Field>
              )}
              <Field label={slate.first_day_lock_at ? "Everything else" : "Week locks"} hint={`${tz.replace("America/", "").replace("_", " ")} time`}>
                <input
                  type="datetime-local" name="lock_at" required className={`${panelInput} tabular-nums`}
                  defaultValue={formatInTimeZone(slate.lock_at, tz, LOCAL_INPUT)}
                />
              </Field>
              <SubmitButton kind="secondary" pending="Saving…" className="!px-4 !text-sm sm:col-span-2 sm:justify-self-start">
                Save deadline
              </SubmitButton>
            </ActionForm>
          </section>
        )}
        {slate.status === "open" && !nfl && (
          <section className="rounded-2xl bg-surface p-4 sm:p-5">
            <h2 className="text-base font-bold tracking-[-0.01em] text-ink">Add a game to this week</h2>
            <p className="mt-0.5 text-sm text-muted">Players can pick it until its deadline. Picks already in stay as they are.</p>
            {addable.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No scheduled games in the next two weeks are off a week yet.</p>
            ) : (
              <ActionForm action={addOpenWeekGame.bind(null, slug, slate.id)} className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Game">
                  <select name="game" required className={panelInput}>
                    <option value="">Choose…</option>
                    {addable.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                  </select>
                </Field>
                {ctx.settings.pick_type === "ats" && (
                  <Field label="Home team's spread (e.g. -3.5)">
                    <input name="spread" inputMode="decimal" placeholder="-3.5" className={panelInput} />
                  </Field>
                )}
                <SubmitButton kind="accent" pending="Adding…" className="sm:col-start-2">Add to this week</SubmitButton>
              </ActionForm>
            )}
          </section>
        )}
        {timeable.length > 0 && (
          <section className="rounded-2xl bg-surface p-4 sm:p-5">
            <h2 className="text-base font-bold tracking-[-0.01em] text-ink">Tip times to set</h2>
            <ul className="divide-y divide-line">
              {timeable.map((g) => (
                <li key={g.id} className="py-2">
                  <Matchup away={g.away} home={g.home} neutral={g.neutral} />
                  <div className="text-xs text-muted tabular-nums">
                    {g.timeTbd ? (
                      <>
                        {formatInTimeZone(g.startAt, "America/New_York", "EEE")} <span className="font-semibold text-ink">Time TBD</span>
                      </>
                    ) : (
                      <>{gameTime(g.startAt, tz)} (set by you)</>
                    )}
                  </div>
                  <GameTimeInput slug={slug} slateId={slate.id} game={g} timezone={tz} />
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="rounded-2xl bg-surface p-4 sm:p-5">
          <h2 className="text-base font-bold tracking-[-0.01em] text-ink">Pick progress</h2>
          <p className="mt-0.5 text-sm text-muted tabular-nums">
            {survivor
              ? `${(progress ?? []).filter((p) => p.picks >= need).length} of ${(progress ?? []).length} entries still in have a pick. Tap an entry to make or fix their pick.`
              : `${(progress ?? []).filter((p) => p.picks >= need).length} of ${(progress ?? []).length} entries have all ${need} picks in. Tap an entry to enter or fix their picks.`}
          </p>
          {tourneyIds.length > 0 && (
            <p className="mt-0.5 text-sm text-muted tabular-nums">
              {(progress ?? []).filter((p) => (champPicks.get(p.user_id) ?? 0) >= tourneyIds.length).length} of {(progress ?? []).length} have all {tourneyIds.length} tournament champion pick{tourneyIds.length === 1 ? "" : "s"} in.
            </p>
          )}
          {tourneyIds.length > 0 && (
            <div className="mt-2 flex items-center gap-3 border-b border-line pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              <span className="flex-1">Entry</span>
              <span className="w-14 text-right">Games</span>
              <span className="w-14 text-right">Champs</span>
              <span className="w-[5.5rem]" />
            </div>
          )}
          <ul className={`divide-y divide-line ${tourneyIds.length ? "" : "mt-2"}`}>
            {progress?.map((p) => (
              <li key={p.user_id} className="flex min-h-12 items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{p.display_name}</span>
                <span className={`text-[15px] font-semibold tabular-nums ${tourneyIds.length ? "w-14 text-right" : ""} ${p.picks < need ? "text-loss" : "text-win"}`}>
                  {p.picks}/{need}
                </span>
                {tourneyIds.length > 0 && (
                  <span
                    title="Tournament champion picks"
                    className={`w-14 text-right text-[15px] font-semibold tabular-nums ${(champPicks.get(p.user_id) ?? 0) < tourneyIds.length ? "text-loss" : "text-win"}`}
                  >
                    {champPicks.get(p.user_id) ?? 0}/{tourneyIds.length}
                  </span>
                )}
                {/* Past the deadline too: the commissioner can fix picks, and the change is marked. */}
                <Link href={`/p/${slug}/picks?week=${slate.week}&for=${p.user_id}`} className="-my-1 inline-flex min-h-11 items-center pl-2 text-sm font-medium text-accent">
                  {survivor ? (p.picks ? "Edit pick" : "Enter pick") : slate.status === "open" ? "Enter picks" : "Edit picks"}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }
}
