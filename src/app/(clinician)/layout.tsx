import type { ReactNode } from "react";
import { Suspense } from "react";
import Link from "next/link";
import { HeartPulse } from "lucide-react";
import { RoleSwitcher } from "@/components/role-switcher";

const NAV = [
  { label: "Queue", href: "/queue", ready: true },
  { label: "Population scan", href: "/benchmark", ready: true },
] as const;

export default function ClinicianLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div
          className="h-1 w-full"
          style={{ background: "linear-gradient(90deg, oklch(0.35 0.08 290), oklch(0.6 0.16 45), oklch(0.78 0.16 55))" }}
        />
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center justify-between gap-4 sm:justify-start sm:gap-8">
            <Link href="/queue" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-primary">
              <HeartPulse className="size-5" />
              <span className="bg-gradient-to-r from-primary to-[oklch(0.6_0.16_45)] bg-clip-text text-transparent">
                Ripple
              </span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              {NAV.map((item) =>
                item.ready ? (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-lg px-3 py-2 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    key={item.href}
                    title="Coming soon"
                    className="rounded-lg px-3 py-2 font-medium text-muted-foreground/50"
                  >
                    {item.label}
                  </span>
                )
              )}
            </nav>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Suspense fallback={<div className="h-11 w-full rounded-xl bg-muted sm:h-10 sm:w-[170px]" />}>
              <RoleSwitcher />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-8">{children}</main>
      <footer className="border-t border-border px-4 py-4 text-center text-xs text-muted-foreground">
        All patients shown are synthetic demo data.
      </footer>
    </div>
  );
}
