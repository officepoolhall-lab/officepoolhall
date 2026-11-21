import type { PoolKind } from "@/lib/poolType";

/** Simple line icons drawn in currentColor: a football, a basketball, a golf flag. */
export function SportIcon({ kind, className }: { kind: PoolKind; className?: string }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className };
  if (kind === "basketball")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3v18M5.6 5.6c2.6 2.6 2.6 10.2 0 12.8M18.4 5.6c-2.6 2.6-2.6 10.2 0 12.8" />
      </svg>
    );
  if (kind === "golf")
    return (
      <svg {...common}>
        <path d="M8 20V3.5l9 4-9 4" />
        <ellipse cx="9" cy="20" rx="6" ry="1.6" />
      </svg>
    );
  return (
    <svg {...common}>
      <ellipse cx="12" cy="12" rx="10" ry="6" transform="rotate(-40 12 12)" />
      <path d="M9.2 14.8l5.6-5.6M10.4 11.2l2.4 2.4M11.8 9.8l2.4 2.4M9 12.6l2.4 2.4" />
    </svg>
  );
}
