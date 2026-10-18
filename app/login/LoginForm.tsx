"use client";

import { useActionState, useEffect, useState } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { openAuthChannel, type AuthMessage } from "@/lib/authChannel";
import { createClient } from "@/lib/supabase/client";
import { sendLink, signInWithPassword, verifyCode, type LoginState } from "./actions";

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
  const [signedIn, signIn, signingIn] = useActionState<LoginState, FormData>(signInWithPassword, null);
  // Password first. A failed emailed link lands here with an error, so show the link form for it.
  const [usePassword, setUsePassword] = useState(!initialError);
  const [email, setEmail] = useState("");
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

  const emailField = (
    <Field label="Email">
      <input
        name="email" type="email" autoComplete={usePassword ? "username" : "email"} required className={inputClass}
        placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)}
      />
    </Field>
  );
  const switchMode = (password: boolean) => (
    <button type="button" onClick={() => setUsePassword(password)} className="min-h-11 w-full text-sm text-muted hover:text-ink">
      {password ? (
        "Sign in with your password instead"
      ) : (
        <>
          New here, or no password? <span className="text-accent">Email me a sign-in link</span>
        </>
      )}
    </button>
  );

  // Password is the default. The emailed link is the alternative, and still the only way to
  // create an account (passwords are set on /account or at sign-up).
  if (usePassword) {
    return (
      <div className="space-y-3">
        <form action={signIn} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          {emailField}
          <Field label="Password">
            <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
          </Field>
          <Button className="w-full" disabled={signingIn}>{signingIn ? "Signing in…" : "Sign in"}</Button>
          {signedIn?.error && <p className="text-sm text-loss" role="alert">{signedIn.error}</p>}
        </form>
        {switchMode(false)}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <form action={send} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        {emailField}
        <Button className="w-full" disabled={sending}>{sending ? "Sending…" : "Email me a sign-in link"}</Button>
        {sent?.error && <p className="text-sm text-loss" role="alert">{sent.error}</p>}
        <p className="text-center text-xs text-muted">New here? The same link creates your account.</p>
      </form>
      {switchMode(true)}
    </div>
  );
}
