// The frame every share-preview image uses (1200 × 630, rendered by next/og): the site's blue,
// the Check Ball logo and the site name along the bottom. Shared by the site's default image and
// the invite-link image.

import type { ReactNode } from "react";

export const OG_SIZE = { width: 1200, height: 630 };

/** The Check Ball (app/icon.svg) as an image the renderer can draw. */
export const LOGO = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0066d6"/><circle cx="32" cy="32" r="22.5" fill="#0a0a0a"/><circle cx="29" cy="28.2" r="10.6" fill="#ffffff"/><path d="M24 28.6 L27.6 32.2 L34.6 24.2" fill="none" stroke="#0066d6" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
)}`;

export function OgFrame({ children, footer = true }: { children: ReactNode; footer?: boolean }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px 64px",
        background: "linear-gradient(135deg, #0066d6 0%, #004a9c 100%)",
        color: "#ffffff",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>{children}</div>
      {footer && (
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered to a PNG by next/og */}
          <img src={LOGO} width={64} height={64} alt="" style={{ borderRadius: 14, border: "2px solid rgba(255,255,255,0.35)" }} />
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>The Office Pool Hall</div>
        </div>
      )}
    </div>
  );
}
