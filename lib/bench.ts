import "server-only";
import { cache } from "react";

// Benched entries (pool_member_bench): still in the pool and on the roster, but out of the
// standings, the Grid and the counts, and they can't pick (a trigger in the database stops that).

type Db = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The pool's benched entries. Empty if none, or before the bench migration is in. */
export const getBenchedIds = cache(async (supabase: Db, poolId: string): Promise<Set<string>> => {
  const { data, error } = await supabase.from("pool_member_bench").select("user_id").eq("pool_id", poolId);
  if (error) return new Set();
  return new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id));
});

/** Every entry that's playing (not benched), with names: who Standings, the Grid and the rest list. */
export const getActiveMembers = cache(async (supabase: Db, poolId: string) => {
  const [{ data }, benched] = await Promise.all([
    supabase.from("pool_members").select("user_id, profile:profiles!inner ( display_name )").eq("pool_id", poolId),
    getBenchedIds(supabase, poolId),
  ]);
  const rows = (data ?? []) as { user_id: string; profile: { display_name: string } }[];
  return { data: rows.filter((m) => !benched.has(m.user_id)) };
});
