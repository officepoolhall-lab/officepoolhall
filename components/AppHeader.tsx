import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "./ui";

export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 bg-felt text-white shadow-sm pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-12 max-w-3xl items-center gap-3 px-4">
        <Link href="/pools" className="truncate text-lg">
          <Wordmark />
        </Link>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {children}
          <form action="/auth/signout" method="post">
            <button className="text-white/70 hover:text-white">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
