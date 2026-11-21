import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/Landing";
import { getUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: { absolute: "The Office Pool Hall · Pick'em pools for football, basketball and golf" },
};

/** Signed in: straight to My Pools. Signed out: the landing page (what the site is, start or sign in). */
export default async function Home() {
  if (await getUser()) redirect("/pools");
  return <Landing />;
}
