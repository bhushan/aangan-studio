"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/calls", label: "Calls" },
];

function Links({ path }: { path: string | null }) {
  return (
    <nav aria-label="Main" className="flex gap-1">
      {LINKS.map((l) => {
        const active = path !== null && (l.href === "/" ? path === "/" : path.startsWith(l.href));
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active ? "bg-stone-100 text-stone-900" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ActiveLinks() {
  return <Links path={usePathname()} />;
}

/** The links render in the static shell; the active highlight fills in once the path is known. */
export function NavLinks() {
  return (
    <Suspense fallback={<Links path={null} />}>
      <ActiveLinks />
    </Suspense>
  );
}
