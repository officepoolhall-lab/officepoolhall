"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// Filling a Squares board through its link: no account, so these run with the service role.
// The board's share token (a long random id in the link) is what lets someone in, and the
// database functions check the rest (the board is open to players, the square is free, the
// limit). `holder` is the random id the person's browser keeps.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
const db = () => createAdminClient() as unknown as Rpc;
const ok = (token: string, holder: string) => UUID.test(token) && holder.length >= 8 && holder.length <= 64;
const BAD = { error: "Reload the page and try again." };

/** Hold an open square for three minutes. */
export async function holdSquare(token: string, holder: string, idx: number): Promise<{ error?: string }> {
  if (!ok(token, holder)) return BAD;
  const { error } = await db().rpc("squares_hold", { p_token: token, p_idx: idx, p_holder: holder });
  return error ? { error: error.message } : {};
}

/** Let go of a square that was tapped but not saved. */
export async function unholdSquare(token: string, holder: string, idx: number): Promise<{ error?: string }> {
  if (!ok(token, holder)) return BAD;
  const { error } = await db().rpc("squares_unhold", { p_token: token, p_idx: idx, p_holder: holder });
  return error ? { error: error.message } : {};
}

/** Save every held square under this name. */
export async function saveHeldSquares(token: string, holder: string, name: string): Promise<{ error?: string; saved?: number }> {
  if (!ok(token, holder)) return BAD;
  const { data, error } = await db().rpc("squares_save_holds", { p_token: token, p_holder: holder, p_label: name });
  return error ? { error: error.message } : { saved: Number(data ?? 0) };
}
