/** "Signature" tag for a PGA Tour Signature Event (bigger purse, smaller field). */
export function SignatureTag({ className = "" }: { className?: string }) {
  return (
    <span
      title="PGA Tour Signature Event"
      className={`inline-flex shrink-0 items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-accent ${className}`}
    >
      Signature
    </span>
  );
}
