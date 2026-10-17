"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ROLES = [
  { label: "Clinician", href: "/queue" },
  { label: "Patient", href: "/home" },
] as const;

export function RoleSwitcher() {
  const pathname = usePathname();

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
      {ROLES.map((role) => {
        const active = pathname.startsWith(role.href);
        return (
          <Link
            key={role.href}
            href={role.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
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
