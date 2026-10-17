"use client";

import { useActionState, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "./ui";

export type ActionState = { error?: string; ok?: string } | null;

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
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
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
  const { pending } = useFormStatus();
  return (
    <button {...props} disabled={pending || props.disabled} className={buttonClass(kind, className)}>
      {pending ? pendingLabel : children}
    </button>
  );
}
