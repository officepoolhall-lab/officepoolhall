"use client";

import { useActionState, type ReactNode } from "react";

export type ActionState = { error?: string; ok?: string } | null;

/**
 * A <form> wired to a server action that returns { error } or { ok }.
 * Shows the message under the form. `children` can be a function to read `pending`.
 */
export function ActionForm({
  action,
  children,
  className = "",
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode | ((pending: boolean) => ReactNode);
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {typeof children === "function" ? children(pending) : children}
      {state?.error && <p className="mt-2 text-sm text-loss" role="alert">{state.error}</p>}
      {state?.ok && <p className="mt-2 text-sm text-win">{state.ok}</p>}
    </form>
  );
}
