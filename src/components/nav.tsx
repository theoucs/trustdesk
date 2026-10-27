"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Questionnaire" },
  { href: "/knowledge", label: "Knowledge base" },
  { href: "/evaluation", label: "Quality" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex h-full items-stretch gap-1 text-[13px]">
      {LINKS.map(({ href, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center border-b-2 px-2.5 ${
              active ? "border-accent font-medium text-text" : "border-transparent text-muted hover:text-text"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
