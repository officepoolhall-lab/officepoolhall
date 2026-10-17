"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "./ui";

export type ActionState = { error?: string; ok?: string } | null;

// <form action> resets every field once the action finishes, even on an error. ActionForm
// submits through onSubmit instead, so a rejected form keeps what was typed; SubmitButton
// reads the pending state from here because useFormStatus no longer sees the submit.
const Pending = createContext(false);

/** A <form> wired to a server action that returns { error } or { ok }; shows the message under the form. */
export function ActionForm({
  action,
  children,
  className = "",
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const form = useRef<HTMLFormElement>(null);
  // Clear the fields after a success, as a plain form action would.
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <form
      ref={form}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        // Pass the submitter so a button's own name/value (e.g. "Use feed") is sent too.
        const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(data));
      }}
    >
      <Pending.Provider value={pending}>{children}</Pending.Provider>
      {state?.error && <p className="mt-2 text-sm text-loss sm:col-span-2" role="alert">{state.error}</p>}
      {state?.ok && <p className="mt-2 text-sm text-win sm:col-span-2">{state.ok}</p>}
    </form>
  );
}

/** Submit button that disables itself and swaps its label while the form's action runs. */
export function SubmitButton({
  children,
  pending: pendingLabel = "Saving…",
  kind = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { pending?: string; kind?: Parameters<typeof buttonClass>[0] }) {
  const formPending = useFormStatus().pending;
  const pending = useContext(Pending) || formPending;
  return (
    <button {...props} disabled={pending || props.disabled} className={buttonClass(kind, className)}>
      {pending ? pendingLabel : children}
    </button>
  );
}
