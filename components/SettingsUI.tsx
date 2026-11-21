import type { ReactNode } from "react";
import { LockIcon } from "./ui";

// Building blocks for the pool settings pages: one card per topic, each setting a plain
// question with its control beside it, segmented choices instead of dropdowns where there are
// only a few options, and switches for on/off rules.

/** One topic: a title, a line on what it controls, then its settings separated by hairlines. */
export function SettingsSection({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface p-4 sm:p-5">
      <h2 className="text-base font-bold tracking-[-0.01em] text-ink">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      <div className="mt-2 divide-y divide-line">{children}</div>
    </section>
  );
}

/**
 * One setting: the question (and a short hint) on the left, its control on the right (stacked on
 * phones). `locked`: can't change any more (a week has opened), shown with a lock.
 */
export function SettingRow({
  label,
  hint,
  children,
  stack = false,
  locked = false,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  stack?: boolean;
  locked?: boolean;
}) {
  return (
    <fieldset disabled={locked} className={`py-3 ${stack ? "" : "sm:flex sm:items-center sm:justify-between sm:gap-6"}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[15px] font-medium text-ink">
          {label}
          {locked && <LockIcon className="size-3.5 text-muted" />}
        </div>
        {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
      </div>
      <div className={`mt-2 ${stack ? "" : "sm:mt-0 sm:shrink-0"} ${locked ? "opacity-60" : ""}`}>{children}</div>
    </fieldset>
  );
}

/** A few choices side by side; the chosen one is filled. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex max-w-full flex-wrap gap-1 rounded-full bg-bg p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`h-9 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition disabled:cursor-not-allowed ${
              on ? "bg-accent text-white dark:text-black" : "text-muted hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** An on/off switch. */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed ${checked ? "bg-accent" : "bg-faint"}`}
    >
      <span className={`inline-block size-5 rounded-full bg-white shadow transition ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

/** Larger choices with a line of explanation each (one at a time). */
export function OptionCards<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  name,
}: {
  value: T;
  options: { value: T; label: string; text?: string }[];
  onChange?: (v: T) => void;
  ariaLabel: string;
  /** Also submit the choice as a form field. */
  name?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid gap-2 sm:grid-cols-2">
      {name && <input type="hidden" name={name} value={value} />}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange?.(o.value)}
            className={`rounded-xl p-3 text-left transition disabled:cursor-not-allowed ${on ? "bg-accent/10 ring-2 ring-accent" : "bg-bg ring-1 ring-line hover:ring-accent/50"}`}
          >
            <div className={`text-[15px] font-semibold ${on ? "text-accent" : "text-ink"}`}>{o.label}</div>
            {o.text && <div className="mt-0.5 text-xs text-muted">{o.text}</div>}
          </button>
        );
      })}
    </div>
  );
}

/** Inputs inside a settings card sit on the page color so they stand out from the card. */
export const settingInput =
  "h-10 rounded-[10px] bg-bg px-3 text-[15px] text-ink outline-none ring-1 ring-line placeholder:text-muted focus:ring-2 focus:ring-accent disabled:cursor-not-allowed";
