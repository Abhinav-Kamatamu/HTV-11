import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { STORY_IDS } from "@/db/seed/ids";
import { SymptomChat } from "./symptom-chat";

// Symptom chat (T-062). Posts to the existing `/api/ingest/symptom` (core, T-005); this page is
// just the patient-side chat UI.

export default function SymptomsPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted/50" />}>
      <SymptomsContent searchParams={searchParams} />
    </Suspense>
  );
}

// T-006: reading `searchParams` outside a Suspense boundary fails `next build` under Cache
// Components/PPR ("uncached or runtime data during prerendering") — same split as `home/page.tsx`.
async function SymptomsContent({ searchParams }: { searchParams: Promise<{ patient?: string }> }) {
  await connection();
  const { patient: patientId = STORY_IDS.A } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/home?patient=${patientId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to timeline
        </Link>
        <h1 className="mt-2 text-lg font-semibold tracking-tight">How are you feeling?</h1>
        <p className="text-sm text-muted-foreground">
          Describe any symptoms in your own words. Your care team will review anything important.
        </p>
      </div>

      <SymptomChat patientId={patientId} />
    </div>
  );
}
