// Tags beside a tournament's name: "Major" in gold for the four majors, "FedEx Cup" in purple
// for the three FedExCup Playoffs events, "Signature" (accent) for other Signature Events.
// Majors and playoffs are known by name; Signature status comes from ESPN.

const MAJORS = [/^masters( tournament)?$/i, /^pga championship$/i, /^u\.?s\.? open$/i, /^the open( championship)?$/i];
const PLAYOFFS = [/^fedex st\.? jude championship$/i, /^bmw championship$/i, /^tour championship$/i];

export function eventKind(name: string, signature: boolean): "major" | "playoff" | "signature" | null {
  const n = name.trim();
  if (MAJORS.some((r) => r.test(n))) return "major";
  if (PLAYOFFS.some((r) => r.test(n))) return "playoff";
  return signature ? "signature" : null;
}

const STYLE = {
  // Gold and purple chosen to read on both light and dark backgrounds.
  major: { label: "Major", title: "One of golf's four majors", cls: "bg-[#b8860b]/15 text-[#946c00] dark:text-[#e3bd52]" },
  playoff: { label: "FedEx Cup", title: "FedExCup Playoffs event", cls: "bg-[#6d28d9]/15 text-[#5b21b6] dark:text-[#b69cf7]" },
  signature: { label: "Signature", title: "PGA Tour Signature Event", cls: "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-accent" },
} as const;

export function EventTag({ name, signature, className = "" }: { name: string; signature: boolean; className?: string }) {
  const kind = eventKind(name, signature);
  if (!kind) return null;
  const s = STYLE[kind];
  return (
    <span title={s.title} className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${s.cls} ${className}`}>
      {s.label}
    </span>
  );
}
