"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ROLES = [
  { label: "Clinician", href: "/queue", prefixes: ["/queue", "/patients", "/benchmark"] },
  { label: "Patient", href: "/home", prefixes: ["/home", "/symptoms", "/sleep", "/upload"] },
] as const;

export function RoleSwitcher() {
  const pathname = usePathname();

  return (
    <div className="flex w-full items-center gap-1 rounded-xl border border-border bg-muted p-1 sm:inline-flex sm:w-auto">
      {ROLES.map((role) => {
        const active = role.prefixes.some((p) => pathname.startsWith(p));
        return (
          <Link
            key={role.href}
            href={role.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex-1 rounded-lg px-4 py-2 text-center text-sm font-medium transition-colors sm:flex-none sm:py-1.5",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {role.label}
          </Link>
        );
      })}
    </div>
  );
}
