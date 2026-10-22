import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { ChevronIcon, inputClass } from "@/components/ui";
import { getPoolContext } from "@/lib/pool";
import { createReply, deletePost, deleteReply, setPinned } from "../actions";
import { timeAgo } from "../time";

export const metadata: Metadata = { title: "Message Board" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Post = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  author: { display_name: string } | null;
};
type Reply = { id: string; author_id: string; body: string; created_at: string; author: { display_name: string } | null };

/** One post with its replies, a reply box, and delete/pin controls for whoever may use them. */
export default async function PostPage({ params }: PageProps<"/p/[slug]/board/[postId]">) {
  const { slug, postId } = await params;
  if (!UUID.test(postId)) notFound();
  const ctx = await getPoolContext(slug);
  const [{ data: postRow }, { data: replyRows }] = await Promise.all([
    ctx.supabase
      .from("board_posts")
      .select("id, author_id, title, body, pinned, created_at, author:profiles!board_posts_author_id_fkey ( display_name )")
      .eq("id", postId)
      .eq("pool_id", ctx.pool.id)
      .maybeSingle(),
    ctx.supabase
      .from("board_replies")
      .select("id, author_id, body, created_at, author:profiles!board_replies_author_id_fkey ( display_name )")
      .eq("post_id", postId)
      .order("created_at"),
  ]);
  const post = postRow as unknown as Post | null;
  if (!post) return notFound();
  const replies = (replyRows ?? []) as unknown as Reply[];
  const me = ctx.user.id;
  // eslint-disable-next-line react-hooks/purity -- render-time snapshot for "3h ago"
  const now = Date.now();
  const canDelete = (authorId: string) => authorId === me || ctx.isCommissioner;
  const smallButton = "min-h-11 text-sm text-muted hover:text-ink hover:underline";

  return (
    <div className="max-w-3xl">
      <Link href={`/p/${slug}/board`} className="-ml-1 mb-2 inline-flex h-9 items-center gap-0.5 px-1 text-sm font-medium text-accent">
        <ChevronIcon className="size-4 rotate-180" /> Message Board
      </Link>

      <article className="border-b border-line pb-4">
        <div className="flex items-start gap-2">
          <h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight">
            {post.pinned && (
              <span className="mr-2 inline-block translate-y-[-2px] rounded-full bg-accent/15 px-2 py-px align-middle text-xs font-semibold text-accent">Pinned</span>
            )}
            {post.title}
          </h1>
        </div>
        <p className="mt-1 text-xs text-muted">
          {post.author?.display_name ?? "Someone"} · {timeAgo(post.created_at, now)}
        </p>
        {/* Plain text: line breaks kept, nothing rendered as HTML. */}
        <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink">{post.body}</p>
        <div className="mt-2 flex gap-4">
          {ctx.isCommissioner && (
            <form action={setPinned.bind(null, slug, post.id, !post.pinned)}>
              <button className={smallButton}>{post.pinned ? "Unpin" : "Pin to top"}</button>
            </form>
          )}
          {canDelete(post.author_id) && (
            <form action={deletePost.bind(null, slug, post.id)}>
              <button className="min-h-11 text-sm text-loss hover:underline">Delete post</button>
            </form>
          )}
        </div>
      </article>

      <section aria-label="Replies">
        <h2 className="mt-5 text-xs font-medium uppercase tracking-wide text-muted">
          {replies.length} {replies.length === 1 ? "reply" : "replies"}
        </h2>
        {replies.length > 0 && (
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {replies.map((r) => (
              <li key={r.id} className="py-3">
                <p className="text-xs text-muted">
                  <span className="font-semibold text-ink">{r.author?.display_name ?? "Someone"}</span> · {timeAgo(r.created_at, now)}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-[15px] text-ink">{r.body}</p>
                {canDelete(r.author_id) && (
                  <form action={deleteReply.bind(null, slug, post.id, r.id)}>
                    <button className="min-h-9 text-xs text-muted hover:text-loss hover:underline">Delete</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {!ctx.isGuest && (
        <ActionForm action={createReply.bind(null, slug, post.id)} className="mt-4 space-y-2">
          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">Reply</span>
            <textarea name="body" required maxLength={2000} rows={3} className={`${inputClass.replace("h-11", "")} py-2.5`} />
          </label>
          <SubmitButton pending="Posting…" kind="secondary">Reply</SubmitButton>
        </ActionForm>
        )}
      </section>
    </div>
  );
}
