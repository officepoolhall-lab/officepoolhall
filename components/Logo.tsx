/**
 * The Office Pool Hall logo: an 8-ball with a check mark where the 8 would be ("make your
 * picks"), and the "officepoolhall" wordmark. In dark mode the ball flips to light so it
 * doesn't vanish into the black background; the check is always the accent blue.
 */
export function LogoMark({ className = "size-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="var(--ink)" />
      <circle cx="44" cy="42" r="21" fill="var(--bg)" />
      <path d="M34 43 L41 50 L55 34" fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M70 22 A30 30 0 0 1 80 40" fill="none" strokeWidth="4" strokeLinecap="round" stroke="var(--bg)" strokeOpacity="0.35" />
    </svg>
  );
}

export function LogoWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`leading-none tracking-[-0.03em] text-ink ${className}`}>
      <span className="font-normal">office</span>
      <span className="font-extrabold">poolhall</span>
    </span>
  );
}

/** Mark over the wordmark (sign-in), or side by side (`inline`). */
export function Logo({ inline = false, className = "" }: { inline?: boolean; className?: string }) {
  return inline ? (
    <span role="img" aria-label="Office Pool Hall" className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className="size-9" />
      <LogoWordmark className="text-[26px]" />
    </span>
  ) : (
    <span role="img" aria-label="Office Pool Hall" className={`flex flex-col items-center gap-4 ${className}`}>
      <LogoMark className="size-24" />
      <LogoWordmark className="text-[40px]" />
    </span>
  );
}
