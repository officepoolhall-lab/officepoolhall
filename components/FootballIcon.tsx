/** A small football: marks the team with the ball in a live game. */
export function FootballIcon({ className = "h-3 w-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 16" className={`inline-block shrink-0 align-[-1px] ${className}`} role="img" aria-label="Has the ball">
      <ellipse cx="12" cy="8" rx="11" ry="7" fill="#8B4A1F" />
      <path d="M8 8h8M10 6.5v3M12 6.5v3M14 6.5v3" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M3.2 4.2c.8 1.2.8 6.4 0 7.6M20.8 4.2c-.8 1.2-.8 6.4 0 7.6" stroke="#fff" strokeWidth="1" fill="none" opacity="0.7" />
    </svg>
  );
}
