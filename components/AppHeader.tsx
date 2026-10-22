import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "./ui";

export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      {/* Full width: wordmark at the left edge; pool name, Account and Sign out at the right. */}
      <div className="flex h-12 items-center gap-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
        <Link href="/pools" className="flex h-11 min-w-0 items-center truncate text-ink">
          <Wordmark className="text-[19px]" />
        </Link>
        <div className="ml-auto flex items-center gap-4 text-sm text-muted">
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
