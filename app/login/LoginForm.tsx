"use client";

import { useActionState, useEffect } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { openAuthChannel, type AuthMessage } from "@/lib/authChannel";
import { createClient } from "@/lib/supabase/client";
import { sendLink, verifyCode, type LoginState } from "./actions";

/**
 * While the "check your email" screen is up, continue as soon as the player signs in from
 * the link in another tab of this browser: the link's tab announces it on a BroadcastChannel,
 * and polling the session cookie covers browsers without one. (A link opened in a phone's
 * mail-app browser can't reach this tab — that's what the code is for.)
 */
function useContinueWhenSignedIn(waiting: boolean, next: string) {
  useEffect(() => {
    if (!waiting) return;
    const go = () => window.location.assign(next);
    const channel = openAuthChannel();
    if (channel) {
      channel.onmessage = (e: MessageEvent<AuthMessage>) => {
        if (e.data?.type !== "signed-in") return;
        channel.postMessage({ type: "claimed" } satisfies AuthMessage);
        go();
      };
    }
    const supabase = createClient();
    const poll = setInterval(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) go();
    }, 2500);
    return () => {
      clearInterval(poll);
      channel?.close();
    };
  }, [waiting, next]);
}

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [sent, send, sending] = useActionState(sendLink, initialError ? { error: initialError } : null);
  const [verified, verify, verifying] = useActionState<LoginState, FormData>(verifyCode, null);
  useContinueWhenSignedIn(Boolean(sent?.sentTo), next);

  if (sent?.sentTo) {
    return (
      <div className="space-y-4">
        <p className="text-center text-[15px] text-muted">
          Check <strong className="font-semibold text-ink">{sent.sentTo}</strong> and enter the 6-digit code here. Or tap the
          link in the email — this page continues on its own once you&apos;re in.
        </p>
        <form action={verify} className="space-y-3">
          <input type="hidden" name="email" value={sent.sentTo} />
          <input type="hidden" name="next" value={next} />
          <Field label="Code">
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,8}"
              required
              autoFocus
              className={`${inputClass} h-14 text-center text-2xl font-semibold tracking-widest tabular-nums`}
            />
          </Field>
          <Button className="w-full" disabled={verifying}>{verifying ? "Checking…" : "Sign in"}</Button>
          {verified?.error && <p className="text-sm text-loss" role="alert">{verified.error}</p>}
        </form>
        <form action={send} className="text-center">
          <input type="hidden" name="email" value={sent.sentTo} />
          <input type="hidden" name="next" value={next} />
          <button className="h-11 text-sm text-muted hover:text-ink disabled:opacity-40" disabled={sending}>{sending ? "Sending…" : "Send a new link"}</button>
        </form>
      </div>
    );
  }

  return (
    <form action={send} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <Field label="Email">
        <input name="email" type="email" autoComplete="email" required className={inputClass} placeholder="you@example.com" />
      </Field>
      <Button className="w-full" disabled={sending}>{sending ? "Sending…" : "Email me a sign-in link"}</Button>
      {sent?.error && <p className="text-sm text-loss" role="alert">{sent.error}</p>}
      <p className="text-center text-xs text-muted">No password. New here? The same link creates your account.</p>
    </form>
  );
}
