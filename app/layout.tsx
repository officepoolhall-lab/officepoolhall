import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { TimeZoneSync } from "@/components/TimeZoneSync";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "The Office Pool Hall", template: "%s · The Office Pool Hall" },
  description: "Season-long college pick'em pools.",
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
