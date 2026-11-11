"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, type ActionState } from "./ActionForm";
import { inputClass } from "./ui";

/** "Edit email" under a roster entry: the commissioner's contact email for them in this pool. */
export function ContactEmailForm({ action, current }: { action: (state: ActionState, form: FormData) => Promise<ActionState>; current: string | null }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="-mx-1 inline-flex min-h-8 items-center px-1 text-xs text-muted hover:text-ink">
        {current ? "Edit contact email" : "Set contact email"}
      </button>
    );
  }
  return (
    <ActionForm action={action} className="mt-1 flex flex-wrap items-center gap-2">
      <input
        name="email"
        type="email"
        defaultValue={current ?? ""}
        placeholder="name@example.com"
        aria-label="Contact email for this pool"
        autoFocus
        className={`${inputClass} h-9 min-w-0 flex-1 basis-48 text-sm`}
      />
      <SubmitButton className="!h-9 !px-3 !text-sm">Save</SubmitButton>
      <button type="button" onClick={() => setOpen(false)} className="h-9 px-2 text-sm text-muted hover:text-ink">
        Cancel
      </button>
      <span className="basis-full text-[11px] text-faint">Used for this pool only. Leave blank to use the email they sign in with.</span>
    </ActionForm>
  );
}
