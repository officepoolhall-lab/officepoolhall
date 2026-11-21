import "server-only";

// Emails to the site's creator (new pool requests, and whatever else comes up), sent through
// Resend's API with RESEND_API_KEY. NOTIFY_EMAIL_FROM sets the sender (an address on a domain
// verified in Resend); without it, Resend's onboarding sender, which can only reach the Resend
// account's own inbox.

const TO = "officepoolhall@gmail.com";

/** True if the email went out. A failure is logged, never thrown: the caller's work is already saved. */
export async function notifyCreator(subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("notifyCreator: RESEND_API_KEY is not set; email not sent:", subject);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.NOTIFY_EMAIL_FROM || "Office Pool Hall <onboarding@resend.dev>",
        to: [TO],
        subject,
        text,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error("notifyCreator: Resend refused:", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (e) {
    console.error("notifyCreator: send failed:", e);
    return false;
  }
}
