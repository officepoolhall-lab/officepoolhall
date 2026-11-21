import "server-only";
import { cache } from "react";
import { poolTypeLabel } from "./poolType";
import { createAdminClient } from "./supabase/admin";

export type InvitePreview = { poolName: string; poolType: string; guest: boolean; usable: boolean };

/**
 * What an invite link shows before anyone signs in: the pool's name and type (for the link
 * preview in a text or group chat, and the sign-in prompt). Only someone holding the link's
 * token sees it; nothing else about the pool. Read with the service role because the visitor
 * (or the app fetching the preview) isn't signed in.
 */
export const getInvitePreview = cache(async (token: string): Promise<InvitePreview | null> => {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(token)) return null;
  try {
    const { data } = await createAdminClient()
      .from("invites")
      .select("guest, expires_at, max_uses, uses, pool:pools!inner ( name, sport, settings )")
      .eq("token", token)
      .maybeSingle();
    if (!data) return null;
    const pool = (Array.isArray(data.pool) ? data.pool[0] : data.pool) as { name: string; sport: string; settings: unknown } | null;
    if (!pool) return null;
    const expired = !!data.expires_at && Date.parse(data.expires_at) <= Date.now();
    const usedUp = data.max_uses !== null && data.uses >= data.max_uses;
    return { poolName: pool.name, poolType: poolTypeLabel(pool), guest: !!data.guest, usable: !expired && !usedUp };
  } catch {
    return null;
  }
});
