import type { ReactNode } from "react";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { HeartPulse } from "lucide-react";
import { getDb } from "@/db/client";
import { patients } from "@/db/schema";
import { RoleSwitcher } from "@/components/role-switcher";
import { PatientSwitcher } from "./patient-switcher";

export default function PatientLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div
          className="h-1 w-full"
          style={{ background: "linear-gradient(90deg, oklch(0.35 0.08 290), oklch(0.6 0.16 45), oklch(0.78 0.16 55))" }}
        />
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Link href="/home" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-primary">
            <HeartPulse className="size-5" />
            <span className="bg-gradient-to-r from-primary to-[oklch(0.6_0.16_45)] bg-clip-text text-transparent">
              Ripple
            </span>
          </Link>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Suspense fallback={<div className="h-10 w-full rounded-lg bg-muted sm:w-48" />}>
              <PatientSwitcherSlot />
            </Suspense>
            <Suspense fallback={<div className="h-11 w-full rounded-xl bg-muted sm:h-10 sm:w-[170px]" />}>
              <RoleSwitcher />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-3 py-4 sm:px-6 sm:py-8">
        <div className="rounded-3xl bg-background/95 p-4 shadow-xl sm:p-8">{children}</div>
      </main>
      <footer className="px-4 py-5 text-center text-xs text-white/80">
        This is synthetic demo data, not a real person&apos;s record.
      </footer>
    </div>
  );
}

async function PatientSwitcherSlot() {
  await connection();
  const rows = await getDb()
    .select({ id: patients.id, name: patients.name })
    .from(patients)
    .orderBy(patients.name);
  return <PatientSwitcher patients={rows} />;
}
