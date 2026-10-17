import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function LockIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className={className}>
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

export function TeamLogo({ src, abbr, className = "size-7" }: { src?: string | null; abbr?: string | null; className?: string }) {
  if (!src) {
    return (
      <span className={`${className} grid shrink-0 place-items-center rounded-full bg-raised font-display text-[10px] font-bold text-muted`}>
        {(abbr ?? "?").slice(0, 4)}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- remote team logos; next/image adds config for little gain
  return <img src={src} alt="" loading="lazy" className={`${className} shrink-0 object-contain`} />;
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-sign leading-none tracking-tight ${className}`}>
      The Office <span className="text-brass">Pool Hall</span>
    </span>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="font-display text-3xl font-bold uppercase tracking-wide">{children}</h1>
      {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
    </div>
  );
}

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`rounded-xl border border-border bg-surface ${className}`} {...props} />;
}

const BUTTON = {
  primary: "bg-felt text-white hover:brightness-110",
  brass: "bg-brass text-[#1b1f1d] hover:brightness-105",
  ghost: "border border-border bg-surface hover:bg-raised",
  danger: "border border-loss/40 text-loss hover:bg-loss/10",
};

export function buttonClass(kind: keyof typeof BUTTON = "primary", extra = "") {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 font-display text-base font-semibold uppercase tracking-wide transition disabled:opacity-50 ${BUTTON[kind]} ${extra}`;
}

export function Button({ kind = "primary", className = "", ...props }: ComponentProps<"button"> & { kind?: keyof typeof BUTTON }) {
  return <button className={buttonClass(kind, className)} {...props} />;
}

export function LinkButton({ kind = "primary", className = "", ...props }: ComponentProps<typeof Link> & { kind?: keyof typeof BUTTON }) {
  return <Link className={buttonClass(kind, className)} {...props} />;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full min-h-11 rounded-lg border border-border px-3 text-base outline-none focus:border-felt focus:ring-2 focus:ring-felt/30";

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-raised text-muted",
    open: "bg-brass/20 text-ink",
    locked: "bg-raised text-ink",
    graded: "bg-win/15 text-win",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 font-display text-xs font-semibold uppercase tracking-wide ${styles[status] ?? ""}`}>
      {status}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <Card className="p-6 text-center text-muted">{children}</Card>;
}
