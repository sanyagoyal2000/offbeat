"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode, SVGProps } from "react";
import type { Location } from "@/lib/locations";
import { HomeIcon, SparkleIcon, StarIcon, TicketIcon, UserIcon, UsersIcon } from "./icons";
import { LocationPicker } from "./LocationPicker";

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
const NAV: { href: string; label: string; Icon: Icon; match: (p: string) => boolean }[] = [
  { href: "/", label: "Explore", Icon: HomeIcon, match: (p) => p === "/" || p.startsWith("/events") || p.startsWith("/movies") },
  { href: "/friends", label: "Friends", Icon: UsersIcon, match: (p) => p.startsWith("/friends") || p.startsWith("/boards") },
  { href: "/plan", label: "Plan", Icon: SparkleIcon, match: (p) => p.startsWith("/plan") || p.startsWith("/saved") },
  { href: "/tickets", label: "Tickets", Icon: TicketIcon, match: (p) => p.startsWith("/tickets") },
  { href: "/wishes", label: "Wishes", Icon: StarIcon, match: (p) => p.startsWith("/wishes") },
];

export function AppShell({ explore, account, children }: { explore: Location; account: { username: string; displayName: string } | null; children: ReactNode }) {
  const path = usePathname();
  const organizer = path.startsWith("/organizer");
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-citron focus:px-4 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href={organizer ? "/organizer" : "/"} className="flex-none font-display text-[19px]" aria-label="Offbeat home">
            offbeat<span className="text-citron">*</span>
            {organizer && <span className="ml-2 align-middle font-sans text-[12px] font-semibold text-muted">for organizers</span>}
          </Link>
          {!organizer && <LocationPicker current={explore} />}
          <nav aria-label="Main" className="ml-auto hidden items-center gap-1 md:flex">
            {NAV.map(({ href, label, match }) => (
              <Link
                key={href}
                href={href}
                aria-label={href === "/friends" ? "Plan with friends" : undefined}
                aria-current={match(path) ? "page" : undefined}
                className={`flex h-10 items-center rounded-full px-3.5 text-[14px] font-semibold transition-colors ${
                  match(path) ? "bg-citron text-ink" : "text-ivory/80 hover:bg-card hover:text-ivory"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
          <Link
            href={organizer ? "/" : "/organizer"}
            className="ml-auto hidden h-10 items-center rounded-full border border-ivory/20 px-3.5 text-[13px] font-semibold hover:border-ivory/50 sm:flex md:ml-2"
          >
            {organizer ? "Back to Explore" : "For organizers"}
          </Link>
          {!organizer && !account && (
            <Link href={`/login?next=${encodeURIComponent(path)}`} className="ml-auto flex h-10 flex-none items-center rounded-full bg-citron px-4 text-[13px] font-bold text-ink sm:ml-0">
              Log in
            </Link>
          )}
          <Link
            href="/profile"
            aria-label={account ? `Profile and settings (signed in as ${account.username})` : "Profile and settings"}
            aria-current={path.startsWith("/profile") || path.startsWith("/taste") ? "page" : undefined}
            className={`flex size-10 flex-none items-center justify-center rounded-full hover:text-citron ${account ? "bg-citron/15 font-bold text-citron" : "bg-card text-ivory"} ${!organizer && !account ? "" : "ml-auto sm:ml-0"}`}
          >
            {account ? <span aria-hidden="true" className="text-[15px] uppercase">{account.displayName.slice(0, 1)}</span> : <UserIcon size={20} />}
          </Link>
        </div>
      </header>
      <div id="main" className="flex-1 pb-28 md:pb-12">
        {children}
        <footer className="mx-auto mt-12 max-w-6xl px-4 text-[12px] text-muted sm:px-6">
          Sample listings are fictional. <Link href="/credits" className="underline underline-offset-2 hover:text-ivory">Photo and data credits</Link>
        </footer>
      </div>
      {!organizer && (
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/95 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur md:hidden"
        >
          <ul className="mx-auto flex max-w-md justify-between">
            {NAV.map(({ href, label, Icon, match }) => {
              const on = match(path);
              return (
                <li key={href} className="flex-1">
                  <Link
                    href={href}
                    aria-label={href === "/friends" ? "Plan with friends" : undefined}
                    aria-current={on ? "page" : undefined}
                    className={`mx-auto flex min-h-12 max-w-20 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-semibold ${
                      on ? "text-citron" : "text-ivory/70"
                    }`}
                  >
                    <span className={`flex h-7 w-12 items-center justify-center rounded-full ${on ? "bg-citron text-ink" : ""}`}>
                      <Icon size={19} />
                    </span>
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </>
  );
}
