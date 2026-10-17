"use client";

import { useActionState } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { sendLink, verifyCode, type LoginState } from "./actions";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [sent, send, sending] = useActionState(sendLink, initialError ? { error: initialError } : null);
  const [verified, verify, verifying] = useActionState<LoginState, FormData>(verifyCode, null);

  if (sent?.sentTo) {
    return (
      <div className="space-y-4">
        <p>
          We sent a sign-in link to <strong>{sent.sentTo}</strong>. Tap it on this device, or enter the 6-digit code from the email.
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
              className={`${inputClass} text-center font-display text-2xl tracking-[0.4em] tabular-nums`}
            />
          </Field>
          <Button className="w-full" disabled={verifying}>{verifying ? "Checking…" : "Sign in"}</Button>
          {verified?.error && <p className="text-sm text-loss" role="alert">{verified.error}</p>}
        </form>
        <form action={send}>
          <input type="hidden" name="email" value={sent.sentTo} />
          <input type="hidden" name="next" value={next} />
          <button className="text-sm text-muted underline" disabled={sending}>Send a new link</button>
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
      <p className="text-xs text-muted">No password. New here? The same link creates your account.</p>
    </form>
  );
}
