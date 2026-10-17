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
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-3">
        <Link href="/home" className="flex items-center gap-2 font-semibold tracking-tight">
          <HeartPulse className="size-5" />
          Undertow
        </Link>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
            Synthetic demo data
          </span>
          <Suspense fallback={<div className="h-8 w-44 rounded-lg bg-muted/50" />}>
            <PatientSwitcherSlot />
          </Suspense>
          <Suspense fallback={<div className="h-8 w-[158px] rounded-lg bg-muted/50" />}>
            <RoleSwitcher />
          </Suspense>
        </div>
      </header>
      <main className="flex-1 bg-muted/20 p-6">{children}</main>
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
