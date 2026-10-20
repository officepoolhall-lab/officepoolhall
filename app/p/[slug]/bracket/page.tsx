import type { Metadata } from "next";
import Link from "next/link";
import { ChevronIcon, Empty, PageTitle } from "@/components/ui";
import { getBracket, getBracketEntries } from "@/lib/brackets";
import { getPoolContext } from "@/lib/pool";
import { BracketBoard } from "./BracketBoard";

export const metadata: Metadata = { title: "NCAA Bracket" };

/**
 * The NCAA Tournament bracket. Your own (or the entry you co-manage) to fill out until the
 * lock; ?user=<id> shows another player's once brackets lock (from Standings);
 * ?for=<id> lets the commissioner fill one out for a player, even after the lock.
 */
export default async function BracketPage({ params, searchParams }: PageProps<"/p/[slug]/bracket">) {
  const { slug } = await params;
  const { user: userParam, for: forParam } = await searchParams;
  const ctx = await getPoolContext(slug);
  const bracket = await getBracket(ctx);
  if (!bracket) {
    return (
      <>
        <PageTitle>NCAA Bracket</PageTitle>
        <Empty>The NCAA Tournament bracket shows up here once the field is set.</Empty>
      </>
    );
  }

  const forUserId = ctx.isCommissioner && typeof forParam === "string" && forParam !== ctx.entryUserId ? forParam : undefined;
  const viewing = forUserId ?? (typeof userParam === "string" ? userParam : ctx.entryUserId);
  const mine = viewing === ctx.entryUserId;
  // eslint-disable-next-line react-hooks/purity -- render-time snapshot; the database enforces the lock
  const locked = new Date(bracket.lockAt).getTime() <= Date.now();

  const [[entry], { data: profile }] = await Promise.all([
    getBracketEntries(ctx, bracket.id, viewing),
    mine ? Promise.resolve({ data: null }) : ctx.supabase.from("profiles").select("display_name").eq("id", viewing).maybeSingle(),
  ]);
  const name = profile?.display_name ?? "Player";

  // Someone else's bracket stays private until the lock (RLS returns nothing before then).
  if (!mine && !forUserId && !locked) {
    return (
      <>
        <PageTitle>NCAA Bracket</PageTitle>
        <Empty>Other players&apos; brackets show once brackets lock.</Empty>
      </>
    );
  }

  const editable = forUserId ? true : mine && !locked;
  const title = forUserId
    ? `${name}'s bracket (editing)`
    : mine
      ? ctx.managing
        ? `${ctx.managing.ownerName}'s bracket`
        : "My Bracket"
      : `${name}'s bracket`;

  return (
    <>
      {!mine && (
        <Link href={`/p/${slug}/standings`} className="-ml-1 mb-2 inline-flex h-9 items-center gap-0.5 px-1 text-sm font-medium text-accent">
          <ChevronIcon className="size-4 rotate-180" /> Standings
        </Link>
      )}
      <BracketBoard
        // A fresh board per entry: its picks belong to one player.
        key={viewing}
        slug={slug}
        bracketId={bracket.id}
        regions={bracket.regions}
        field={bracket.field}
        results={bracket.results}
        initialPicks={entry?.picks ?? {}}
        editable={editable}
        lockAt={bracket.lockAt}
        timezone={ctx.displayTz}
        forUserId={forUserId ?? (mine && ctx.managing ? ctx.entryUserId : undefined)}
        title={title}
      />
    </>
  );
}
