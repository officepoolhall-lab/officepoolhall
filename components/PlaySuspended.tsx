import { getEventStatus, suspendedLine } from "@/lib/golfLive";

/**
 * A note while play is stopped (weather, darkness), from ESPN's own status line, so a board
 * that isn't moving doesn't look broken. Renders nothing while play is on.
 */
export async function PlaySuspended({ tournamentId, className = "" }: { tournamentId: string | null; className?: string }) {
  if (!tournamentId) return null;
  const line = suspendedLine(await getEventStatus(tournamentId));
  if (!line) return null;
  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-ink ${className}`}
    >
      <svg aria-hidden viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 fill-amber-500">
        <rect x="5" y="4" width="3.5" height="12" rx="1" />
        <rect x="11.5" y="4" width="3.5" height="12" rx="1" />
      </svg>
      <div className="min-w-0">
        <div className="font-semibold">{line}</div>
        <div className="text-xs text-muted">Scores and tee times update here once play resumes.</div>
      </div>
    </div>
  );
}
