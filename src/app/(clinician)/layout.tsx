import type { ReactNode } from "react";
import { Suspense } from "react";
import Link from "next/link";
import { Gauge } from "lucide-react";
import { RoleSwitcher } from "@/components/role-switcher";

const NAV = [
  { label: "Queue", href: "/queue", ready: true },
  { label: "Benchmark", href: "/benchmark", ready: true },
] as const;

export default function ClinicianLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/queue" className="flex items-center gap-2 font-semibold tracking-tight">
            <Gauge className="size-5" />
            Undertow
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {NAV.map((item) =>
              item.ready ? (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  key={item.href}
                  title="Coming soon"
                  className="rounded-md px-3 py-1.5 font-medium text-muted-foreground/50"
                >
                  {item.label}
                </span>
              )
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
            Synthetic demo data
          </span>
          <Suspense fallback={<div className="h-8 w-[158px] rounded-lg bg-muted/50" />}>
            <RoleSwitcher />
          </Suspense>
        </div>
      </header>
      <main className="flex-1 bg-muted/20 p-6">{children}</main>
    </div>
  );
}
