import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { ChevronIcon, Empty, Field, inputClass, PageTitle, SectionLabel } from "@/components/ui";
import { getPoolContext } from "@/lib/pool";
import { createPost } from "./actions";
import { timeAgo } from "./time";

export const metadata: Metadata = { title: "Message Board" };

type Row = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  last_activity_at: string;
  author: { display_name: string } | null;
  board_replies: { count: number }[];
};

/** The pool's Message Board: pinned posts first (League Rules, Payouts), then the latest activity. */
export default async function BoardPage({ params }: PageProps<"/p/[slug]/board">) {
  const { slug } = await params;
  const ctx = await getPoolContext(slug);
  const { data, error } = await ctx.supabase
    .from("board_posts")
    .select("id, title, body, pinned, created_at, last_activity_at, author:profiles!board_posts_author_id_fkey ( display_name ), board_replies ( count )")
    .eq("pool_id", ctx.pool.id)
    .order("pinned", { ascending: false })
    .order("last_activity_at", { ascending: false })
    .limit(200);
  const posts = (data ?? []) as unknown as Row[];
  // eslint-disable-next-line react-hooks/purity -- render-time snapshot for "3h ago"
  const now = Date.now();

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-10">
      <div className="min-w-0">
        <PageTitle>Message Board</PageTitle>
        {error ? (
          <Empty>The Message Board isn&apos;t set up yet. The commissioner needs to run the latest database update.</Empty>
        ) : !posts.length ? (
          <Empty>No posts yet. Start the conversation.</Empty>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {posts.map((p) => {
              const replies = p.board_replies?.[0]?.count ?? 0;
              return (
                <li key={p.id}>
                  <Link href={`/p/${slug}/board/${p.id}`} className="group flex items-center gap-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        {p.pinned && (
                          <span className="shrink-0 rounded-full bg-accent/15 px-2 py-px text-[11px] font-semibold text-accent">Pinned</span>
                        )}
                        <span className="truncate text-[15px] font-semibold text-ink group-hover:underline">{p.title}</span>
                      </span>
                      <span className="mt-0.5 line-clamp-1 text-sm text-muted">{p.body}</span>
                      <span className="mt-0.5 block text-xs text-faint">
                        {p.author?.display_name ?? "Someone"} · {timeAgo(p.created_at, now)} · {replies} {replies === 1 ? "reply" : "replies"}
                        {replies > 0 && <> · last {timeAgo(p.last_activity_at, now)}</>}
                      </span>
                    </span>
                    <ChevronIcon className="size-4 shrink-0 text-faint" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!error && (
        <section className="mt-8 lg:sticky lg:top-[calc(3rem+1px+env(safe-area-inset-top)+1rem)] lg:mt-0">
          <SectionLabel className="mb-2">New post</SectionLabel>
          <ActionForm action={createPost.bind(null, slug)} className="space-y-3">
            <Field label="Title">
              <input name="title" required maxLength={120} className={inputClass} placeholder="Week 8 thoughts" />
            </Field>
            <Field label="Message">
              <textarea name="body" required maxLength={5000} rows={5} className={`${inputClass.replace("h-11", "")} py-2.5`} />
            </Field>
            <SubmitButton pending="Posting…" className="w-full">Post</SubmitButton>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
