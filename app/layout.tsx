import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { TimeZoneSync } from "@/components/TimeZoneSync";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

const description = "Office pools for the common man. Customize every rule, invite your group, and let the picks, scores and standings run themselves. No spreadsheets required.";

export const metadata: Metadata = {
  // Absolute links for the share previews (the image and page URLs a shared link shows).
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://theofficepoolhall.com"),
  title: { default: "The Office Pool Hall", template: "%s · The Office Pool Hall" },
  description,
  // What a shared link shows in texts, group chats, Slack, email and social apps. Pages
  // without their own (most are behind sign-in) show this; invite links show the pool.
  openGraph: { siteName: "The Office Pool Hall", title: "The Office Pool Hall", description, type: "website", locale: "en_US" },
  twitter: { card: "summary_large_image", title: "The Office Pool Hall", description },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        {children}
        {/* Game times show in the viewer's own time zone (lib/viewerTime.ts). */}
        <TimeZoneSync />
      </body>
    </html>
  );
}
