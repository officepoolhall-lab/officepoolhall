import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Card, Field, LinkButton, StatusBadge, inputClass } from "@/components/ui";
import { windowLabel } from "@/lib/format";
import { getSlateGames, requireCommissioner } from "@/lib/pool";
import { localDate, nextWindowStartDate } from "@/lib/slateWindow";
import { createSlate, resolveTeamMatch } from "../actions";
import { SlateEditor, type Candidate } from "./SlateEditor";

export const metadata: Metadata = { title: "Slate editor" };

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

  // Suggest the window after the latest slate, or the next one from today.
  const after = slates?.[0] ? new Date(slates[0].window_end) : new Date();
  const suggestedStart = nextWindowStartDate(new Date(after.getTime() - 1), ctx.settings);

  return (
    <>
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {slates?.map((s) => (
          <Link
            key={s.id}
            href={`/p/${slug}/admin/slate?week=${s.week}`}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${s.id === slate?.id ? "border-felt bg-felt text-white" : "border-border"}`}
          >
            {s.label ?? `Week ${s.week}`} <StatusBadge status={s.status} />
          </Link>
        ))}
        <Link href={`/p/${slug}/admin/slate?new=1`} className={`shrink-0 rounded-full border border-dashed px-3 py-1 text-sm ${wantNew ? "border-felt" : "border-border"}`}>
          + New week
        </Link>
      </div>

      {wantNew || !slate ? (
        <Card className="p-4">
          <h2 className="mb-3 font-display text-xl font-bold uppercase">New week</h2>
          <ActionForm action={createSlate.bind(null, slug)} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First day" hint={`${ctx.settings.window.length_days}-day window from midnight (${tz.replace("America/", "")})`}>
                    <input type="date" name="start_date" required defaultValue={suggestedStart} className={inputClass} />
                  </Field>
                  <Field label="Label (optional)">
                    <input name="label" placeholder={`Week ${(slates?.[0]?.week ?? 0) + 1}`} className={inputClass} />
                  </Field>
                </div>
                <SubmitButton pending="Creating…">Create draft</SubmitButton>
          </ActionForm>
        </Card>
      ) : slate.status === "draft" ? (
        <DraftEditor slug={slug} slateId={slate.id} />
      ) : (
        <PublishedSummary slug={slug} slate={slate} />
      )}
    </>
  );

  async function DraftEditor({ slug, slateId }: { slug: string; slateId: string }) {
    const s = slate!;
    const onSlate = await getSlateGames(ctx, slateId);
    const onSlateIds = new Set(onSlate.map((g) => g.id));

    const [{ data: games }, { data: lines }, { data: teams }, { data: queue }] = await Promise.all([
      ctx.supabase
        .from("games")
        .select(`id, start_at, time_tbd, tv_network, home_rank, away_rank, neutral_site,
          home:teams!games_home_team_id_fkey ( name, short_name, abbreviation, conference, logo_url ),
          away:teams!games_away_team_id_fkey ( name, short_name, abbreviation, conference, logo_url )`)
        .eq("sport", ctx.pool.sport)
        .gte("start_at", new Date(Math.max(Date.now(), new Date(s.window_start).getTime())).toISOString())
        .lt("start_at", s.window_end)
        .order("start_at")
        .limit(1000),
      ctx.supabase.from("latest_game_lines").select("game_id, home_spread").eq("bookmaker", ctx.settings.lines.bookmaker),
      ctx.supabase.from("teams").select("id, name").eq("sport", ctx.pool.sport).order("name"),
      ctx.supabase.from("team_match_queue").select("*").eq("sport", ctx.pool.sport).eq("resolved", false).order("last_seen_at", { ascending: false }),
    ]);
    const lineByGame = new Map((lines ?? []).map((l) => [l.game_id, l.home_spread === null ? null : Number(l.home_spread)]));

    const candidates: Candidate[] = (games ?? [])
      .filter((g) => !onSlateIds.has(g.id))
      .map((g) => ({
        id: g.id,
        startAt: g.start_at,
        timeTbd: g.time_tbd,
        tv: g.tv_network,
        homeRank: g.home_rank,
        awayRank: g.away_rank,
        neutral: g.neutral_site,
        home: g.home,
        away: g.away,
        line: lineByGame.get(g.id) ?? null,
      }));

    return (
      <>
        <p className="mb-3 text-sm text-muted">
          {s.label} · {windowLabel(s.window_start, s.window_end, tz)}
          {s.lock_at && ` · weekly lock ${new Date(s.lock_at).toLocaleString("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" })}`}
        </p>
        <SlateEditor
          slug={slug}
          slateId={slateId}
          onSlate={onSlate.map((g) => ({ ...g, line: lineByGame.get(g.id) ?? null }))}
          candidates={candidates}
          teams={teams ?? []}
          settings={{
            pickType: ctx.settings.pick_type,
            picksPerSlate: ctx.settings.picks_per_slate,
            picksMode: ctx.settings.picks_mode,
            timezone: tz,
            bookmaker: ctx.settings.lines.bookmaker,
          }}
          defaultManualStart={`${localDate(new Date(s.window_start), tz)}T19:00`}
        />
        {Boolean(queue?.length) && (
          <Card className="mt-6 p-4">
            <h2 className="mb-1 font-display text-lg font-bold uppercase">Unmatched team names</h2>
            <p className="mb-3 text-sm text-muted">The line feed used these names. Match each to a team so its lines come through.</p>
            <ul className="space-y-2">
              {queue!.map((q) => (
                <li key={q.id}>
                  <ActionForm action={resolveTeamMatch.bind(null, slug)} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="queue_id" value={q.id} />
                    <span className="min-w-40 font-medium">{q.raw_name}</span>
                    <select name="team_id" required className={`${inputClass} max-w-64 flex-1`}>
                      <option value="">Choose team…</option>
                      {teams?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <SubmitButton kind="ghost" pending="…">Match</SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </>
    );
  }

  async function PublishedSummary({ slug, slate }: { slug: string; slate: NonNullable<typeof slates>[number] }) {
    const [games, { data: progress }] = await Promise.all([
      getSlateGames(ctx, slate.id),
      ctx.supabase.rpc("slate_progress", { p_slate_id: slate.id }),
    ]);
    const need = ctx.settings.picks_per_slate;
    return (
      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl font-bold uppercase">{slate.label}</h2>
            <StatusBadge status={slate.status} />
          </div>
          <p className="text-sm text-muted">
            {windowLabel(slate.window_start, slate.window_end, tz)} · {games.length} games · published{" "}
            {slate.published_at && new Date(slate.published_at).toLocaleString("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <LinkButton href={`/p/${slug}/admin/results?week=${slate.week}`} kind="ghost">Results &amp; voids</LinkButton>
            <LinkButton href={`/p/${slug}/grid/${slate.week}`} kind="ghost">Grid</LinkButton>
          </div>
        </Card>
        <Card>
          <h3 className="border-b border-border px-4 py-2 font-display text-lg font-bold uppercase">Pick progress</h3>
          <ul className="divide-y divide-border">
            {progress?.map((p) => (
              <li key={p.user_id} className="flex min-h-11 items-center gap-3 px-4">
                <span className="flex-1">{p.display_name}</span>
                <span className={`font-display text-lg font-bold tabular-nums ${p.picks < need ? "text-live" : "text-win"}`}>
                  {p.picks}/{need}
                </span>
                {slate.status === "open" && (
                  <Link href={`/p/${slug}/picks?for=${p.user_id}`} className="text-sm text-felt">Enter picks</Link>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    );
  }
}
