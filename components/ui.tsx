import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// Shared primitives. See docs/design.md: one font, one accent, hairlines, gray cells.

export function LockIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-label="Locked" role="img" className={className}>
      <path fillRule="evenodd" d="M10 2a4 4 0 0 0-4 4v2H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-1V6a4 4 0 0 0-4-4Zm2 6V6a2 2 0 1 0-4 0v2h4Z" clipRule="evenodd" />
    </svg>
  );
}

export function CheckIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className={className}>
      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
    </svg>
  );
}

export function ChevronIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className={className}>
      <path fillRule="evenodd" d="M7.3 4.3a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4-1.4L11.6 10 7.3 5.7a1 1 0 0 1 0-1.4Z" clipRule="evenodd" />
    </svg>
  );
}

export function TeamLogo({ src, abbr, className = "size-8" }: { src?: string | null; abbr?: string | null; className?: string }) {
  if (!src) {
    return (
      <span className={`${className} grid shrink-0 place-items-center rounded-full bg-surface text-[9px] font-semibold text-muted`}>
        {(abbr ?? "?").slice(0, 4)}
      </span>
    );
  }
  // ESPN publishes a dark-background variant of each logo (e.g. Iowa's black hawk turns gold).
  const dark = src.includes("/teamlogos/ncaa/500/") ? src.replace("/500/", "/500-dark/") : null;
  return (
    <picture className="contents">
      {dark && <source srcSet={dark} media="(prefers-color-scheme: dark)" />}
      <img src={src} alt="" loading="lazy" className={`${className} shrink-0 object-contain`} />
    </picture>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`font-semibold tracking-tight ${className}`}>The Office Pool Hall</span>;
}

/** Live status: small orange dot + label. */
export function LiveDot({ children = "Live" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold text-live">
      <span className="size-1.5 animate-pulse rounded-full bg-live" />
      {children}
    </span>
  );
}

/**
 * The rounded gray "cell" from the reference design: a value in ink, an optional
 * sub-value in accent. Renders a <button> when given onClick, else a <div>.
 */
export function Cell({
  value,
  sub,
  selected = false,
  disabled = false,
  onClick,
  className = "",
  label,
}: {
  value: ReactNode;
  sub?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  label?: string;
}) {
  const classes = `flex min-h-14 flex-col items-center justify-center rounded-[10px] px-2 text-center tabular-nums transition ${
    selected ? "bg-accent/15 ring-1 ring-accent" : "bg-surface"
  } ${onClick && !disabled ? "hover:bg-hover active:scale-[0.98]" : ""} ${disabled && !selected ? "text-muted" : ""} ${className}`;
  const inner = (
    <>
      <span className={`text-[15px] font-medium leading-tight ${selected ? "text-accent" : disabled ? "" : "text-ink"}`}>{value}</span>
      {sub !== undefined && <span className={`text-[15px] font-semibold leading-tight ${disabled && !selected ? "" : "text-accent"}`}>{sub}</span>}
    </>
  );
  if (!onClick) return <div className={classes} aria-label={label}>{inner}</div>;
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={selected} aria-label={label} className={`${classes} disabled:cursor-not-allowed`}>
      {inner}
    </button>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>
      {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
    </div>
  );
}

export function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h2 className={`text-xs font-medium uppercase tracking-wide text-muted ${className}`}>{children}</h2>;
}

/** Filled panel — for forms and small summaries only. Lists stay on the page background. */
export function Panel({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`rounded-2xl bg-surface ${className}`} {...props} />;
}

const BUTTON = {
  primary: "bg-ink text-bg hover:opacity-90",
  secondary: "bg-surface text-ink hover:bg-hover",
  accent: "bg-accent text-white hover:opacity-90 dark:text-black",
  danger: "bg-surface text-loss hover:bg-hover",
  ghost: "text-muted hover:text-ink",
};
export type ButtonKind = keyof typeof BUTTON;

export function buttonClass(kind: ButtonKind = "primary", extra = "") {
  return `inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold transition disabled:opacity-40 ${BUTTON[kind]} ${extra}`;
}

export function Button({ kind = "primary", className = "", ...props }: ComponentProps<"button"> & { kind?: ButtonKind }) {
  return <button className={buttonClass(kind, className)} {...props} />;
}

export function LinkButton({ kind = "primary", className = "", ...props }: ComponentProps<typeof Link> & { kind?: ButtonKind }) {
  return <Link className={buttonClass(kind, className)} {...props} />;
}

/** Horizontal pill tabs / filter chips. Active = ink fill. */
/**
 * "sm" is the compact chip for week pickers above dense views: 28px tall, with the tap area
 * stretched 6px above and below so it stays easy to hit. "xs" (24px, stretched 4px) is the
 * Grid's, where every row of players counts.
 */
export function chipClass(active: boolean, extra = "", size: "md" | "sm" | "xs" = "md") {
  const shape =
    size === "xs"
      ? "relative h-6 px-2 text-[11px] after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']"
      : size === "sm"
        ? "relative h-7 px-2.5 text-xs after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']"
        : "h-9 px-3.5 text-sm";
  return `inline-flex ${shape} shrink-0 items-center gap-1.5 rounded-full font-medium transition ${
    active ? "bg-ink text-bg" : "bg-surface text-ink hover:bg-hover"
  } ${extra}`;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full h-11 rounded-[10px] bg-surface px-3 text-[15px] text-ink outline-none placeholder:text-muted focus:ring-2 focus:ring-accent";

export function StatusText({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "text-muted",
    open: "text-accent",
    locked: "text-muted",
    graded: "text-win",
  };
  const labels: Record<string, string> = { draft: "Draft", open: "Open", locked: "Locked", graded: "Final" };
  return <span className={`text-xs font-semibold ${styles[status] ?? "text-muted"}`}>{labels[status] ?? status}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-sm text-muted">{children}</p>;
}
