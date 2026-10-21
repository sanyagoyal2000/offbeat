"use client";

import Link from "next/link";
import { ChevronLeftIcon } from "./icons";

/** Returns to where the user came from (keeping their filters), else to a sensible fallback. */
export function BackLink({ href, label = "Back" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="inline-flex h-11 items-center gap-1 rounded-full pr-3 text-[14px] font-semibold text-ivory/80 hover:text-ivory">
      <ChevronLeftIcon size={20} />
      {label}
    </Link>
  );
}
