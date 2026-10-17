// Same-browser handoff between the tab waiting on the sign-in screen and the tab the
// magic link opens: the new tab announces "signed-in"; if a waiting tab answers
// "claimed", it carries on there and the new tab just says so.
export const AUTH_CHANNEL = "oph-auth";
export type AuthMessage = { type: "signed-in" } | { type: "claimed" };

export function openAuthChannel(): BroadcastChannel | null {
  return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(AUTH_CHANNEL);
}
