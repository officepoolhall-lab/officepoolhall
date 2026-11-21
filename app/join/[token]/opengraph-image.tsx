import { ImageResponse } from "next/og";
import { getInvitePreview } from "@/lib/invitePreview";
import { OG_SIZE, OgFrame } from "@/lib/ogFrame";

// The image an invite link shows in a text or group chat: the pool's name and type.
export const alt = "Invitation to a pool on The Office Pool Hall";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInvitePreview(token);
  const name = invite?.poolName ?? "a pool";
  // Long names step down so they stay within two lines.
  const fontSize = name.length > 40 ? 64 : name.length > 24 ? 80 : 96;
  return new ImageResponse(
    (
      <OgFrame>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", opacity: 0.85 }}>
          {invite?.guest ? "You're invited to follow" : "You're invited to join"}
        </div>
        <div style={{ marginTop: 16, fontSize, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05, maxWidth: 1040 }}>{name}</div>
        {invite && (
          <div style={{ display: "flex", marginTop: 28 }}>
            <div style={{ display: "flex", padding: "10px 24px", borderRadius: 999, background: "rgba(255,255,255,0.16)", fontSize: 32, fontWeight: 600 }}>
              {invite.poolType}
            </div>
          </div>
        )}
      </OgFrame>
    ),
    size,
  );
}
