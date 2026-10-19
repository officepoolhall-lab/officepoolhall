"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/ActionForm";
import { getPoolContext } from "@/lib/pool";

const clean = (v: FormDataEntryValue | null) => String(v ?? "").replace(/\r\n/g, "\n").trim();

/** A new post, as the signed-in player; opens it once saved. */
export async function createPost(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getPoolContext(slug);
  const title = clean(form.get("title")).replace(/\s+/g, " ");
  const body = clean(form.get("body"));
  if (!title) return { error: "Give your post a title." };
  if (title.length > 120) return { error: "Titles can be up to 120 characters." };
  if (!body) return { error: "Write something to post." };
  if (body.length > 5000) return { error: "Posts can be up to 5,000 characters." };
  const { data, error } = await ctx.supabase.from("board_posts").insert({ pool_id: ctx.pool.id, title, body }).select("id").single();
  if (error || !data) return { error: error?.message ?? "Couldn't post. Try again." };
  revalidatePath(`/p/${slug}/board`);
  return redirect(`/p/${slug}/board/${data.id}`);
}

export async function createReply(slug: string, postId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getPoolContext(slug);
  const body = clean(form.get("body"));
  if (!body) return { error: "Write a reply first." };
  if (body.length > 2000) return { error: "Replies can be up to 2,000 characters." };
  const { error } = await ctx.supabase.from("board_replies").insert({ post_id: postId, body });
  if (error) return { error: error.message };
  revalidatePath(`/p/${slug}/board/${postId}`);
  revalidatePath(`/p/${slug}/board`);
  return { ok: "Reply posted." };
}

/** The author or the commissioner (RLS decides; a refused delete just changes nothing). */
export async function deletePost(slug: string, postId: string) {
  const ctx = await getPoolContext(slug);
  await ctx.supabase.from("board_posts").delete().eq("id", postId);
  revalidatePath(`/p/${slug}/board`);
  redirect(`/p/${slug}/board`);
}

export async function deleteReply(slug: string, postId: string, replyId: string) {
  const ctx = await getPoolContext(slug);
  await ctx.supabase.from("board_replies").delete().eq("id", replyId);
  revalidatePath(`/p/${slug}/board/${postId}`);
}

/** Commissioner only (set_post_pinned checks). */
export async function setPinned(slug: string, postId: string, pinned: boolean) {
  const ctx = await getPoolContext(slug);
  await ctx.supabase.rpc("set_post_pinned", { p_post_id: postId, p_pinned: pinned });
  revalidatePath(`/p/${slug}/board`);
  revalidatePath(`/p/${slug}/board/${postId}`);
}
