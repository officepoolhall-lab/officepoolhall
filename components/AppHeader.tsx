import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "./ui";

export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      {/* Full width, left-aligned on wider screens; phones keep Account and Sign out on the right. */}
      <div className="flex h-12 items-center gap-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:gap-6">
        <Link href="/pools" className="flex h-11 min-w-0 items-center truncate text-ink">
          <Wordmark className="text-[15px]" />
        </Link>
        <div className="ml-auto flex items-center gap-4 text-sm text-muted sm:ml-0">
          {children}
          <Link href="/account" className="flex h-11 items-center hover:text-ink">Account</Link>
          <form action="/auth/signout" method="post">
            <button className="h-11 hover:text-ink">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
