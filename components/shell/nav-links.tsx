"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// The shell's places. Later phases fill them and add pages under them; they
// don't move them.
const PLACES = [
  { href: "/playground", label: "Playground", localOnly: true },
  { href: "/tasks", label: "Tasks", localOnly: false },
  { href: "/runs", label: "Runs", localOnly: false },
  { href: "/compare", label: "Compare", localOnly: false },
  { href: "/labelling", label: "Labelling", localOnly: true },
  { href: "/review", label: "Review", localOnly: true },
  { href: "/failures", label: "Failures", localOnly: false },
  { href: "/gates", label: "Gates", localOnly: false },
  { href: "/improvement", label: "Improvement", localOnly: false },
] as const;

export function NavLinks({ showLocalOnly }: { showLocalOnly: boolean }) {
  return <NavList showLocalOnly={showLocalOnly} pathname={usePathname()} />;
}

// The same links with nothing marked: what the shell shows while a page with
// a run id in its address, unknown until it's asked for, works out where it is.
export function NavList({ showLocalOnly, pathname }: { showLocalOnly: boolean; pathname: string | null }) {
  return (
    <nav aria-label="Main" className="flex items-stretch gap-4 self-stretch">
      {PLACES.filter((place) => showLocalOnly || !place.localOnly).map(({ href, label }) => {
        const active = pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center border-b-2 border-transparent text-muted-foreground no-underline hover:text-foreground hover:no-underline",
              active && "border-foreground text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
