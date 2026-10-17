import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db/client";
import { observations } from "@/db/schema";
import { requirePatient } from "@/app/api/_lib/engine-db";
import { STORY_IDS } from "@/db/seed/ids";
import { SleepCheckinForm } from "./sleep-checkin-form";

// Weekly sleep check-in (T-064): fixed form, no Gemini. Feeds the `sleep_snoring`/`sleep_tired`/
// `sleep_observed_apnea` (+ optional `sleep_hours`) observations that the STOP-Bang layer
// (RISK_ENGINE §4b) reads. Neck circumference is "asked once at intake" per §4b, so the form
// only shows that field when the patient has no `neck_cm` observation yet.

export default function SleepCheckinPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  return (
    <Suspense fallback={<SleepSkeleton />}>
      <SleepCheckinContent searchParams={searchParams} />
    </Suspense>
  );
}

function SleepSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-16 animate-pulse rounded-xl bg-muted/50" />
      <div className="h-64 animate-pulse rounded-xl bg-muted/50" />
    </div>
  );
}

// T-006: a bare DB read in an async server component with no Suspense boundary fails `next build`
// under Cache Components/PPR ("uncached or runtime data during prerendering") — same `connection()`
// + Suspense-wrapped-content split `home/page.tsx` already uses, caught only once a real production
// build was run (dev mode and `npm test` don't exercise prerendering).
async function SleepCheckinContent({ searchParams }: { searchParams: Promise<{ patient?: string }> }) {
  await connection();
  const { patient: patientId = STORY_IDS.A } = await searchParams;
  const db = getDb();
  await requirePatient(db, patientId);
  const [neck] = await db
    .select({ value: observations.value })
    .from(observations)
    .where(and(eq(observations.patientId, patientId), eq(observations.metric, "neck_cm")))
    .orderBy(desc(observations.ts))
    .limit(1);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/home?patient=${patientId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to timeline
        </Link>
        <h1 className="mt-2 text-lg font-semibold tracking-tight">Weekly sleep check-in</h1>
        <p className="text-sm text-muted-foreground">A few quick questions about your sleep this week.</p>
      </div>

      <SleepCheckinForm patientId={patientId} needsNeck={!neck} />
    </div>
  );
}
