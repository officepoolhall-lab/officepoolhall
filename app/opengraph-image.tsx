import { ImageResponse } from "next/og";
import { LOGO, OG_SIZE, OgFrame } from "@/lib/ogFrame";

// The image a shared link to the site shows (any page without its own).
export const alt = "The Office Pool Hall: all your pools in one place. All your pools in one customizable, zero-hassle space.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <OgFrame footer={false}>
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered to a PNG by next/og */}
          <img src={LOGO} width={168} height={168} alt="" style={{ borderRadius: 36, border: "3px solid rgba(255,255,255,0.35)" }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -2.5, lineHeight: 1 }}>The Office Pool Hall</div>
            <div style={{ marginTop: 20, fontSize: 36, opacity: 0.9 }}>Say goodbye to the spreadsheets.</div>
          </div>
        </div>
        <div style={{ display: "flex", marginTop: 56, fontSize: 34, fontWeight: 600, opacity: 0.9 }}>All your pools in one customizable, zero-hassle space.</div>
      </OgFrame>
    ),
    size,
  );
}
