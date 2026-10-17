import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Camera } from "lucide-react";
import { getDb } from "@/db/client";
import { getPatientSummary, listMessages } from "@/app/api/_lib/engine-db";
import { STORY_IDS } from "@/db/seed/ids";
import { Button } from "@/components/ui/button";
import { buildTimeline } from "./timeline-data";
import { Timeline } from "./timeline";
import { MessagesPanel } from "./messages-panel";

// Patient home (T-060): own timeline (meals, device readings, lab reports, symptom chats) and
// messages from the care team. No risk scores or flags here (CLAUDE.md §4: the patient never
// receives a risk alert directly from the AI, only a clinician-validated message).

function age(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
    years -= 1;
  }
  return years;
}

export default function PatientHomePage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent searchParams={searchParams} />
    </Suspense>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-16 animate-pulse rounded-xl bg-muted/50" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="h-64 animate-pulse rounded-xl bg-muted/50" />
        <div className="h-64 animate-pulse rounded-xl bg-muted/50" />
      </div>
    </div>
  );
}

async function HomeContent({ searchParams }: { searchParams: Promise<{ patient?: string }> }) {
  await connection();
  const { patient: patientId = STORY_IDS.A } = await searchParams;
  const db = getDb();
  const [summary, messages] = await Promise.all([
    getPatientSummary(db, patientId),
    listMessages(db, patientId),
  ]);
  const timeline = buildTimeline(summary);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Hi, {summary.patient.name.split(" ")[0]}</h1>
          <p className="text-sm text-muted-foreground">
            {age(summary.patient.dob)}y &middot; {summary.patient.sex}
            {summary.patient.synthetic ? " · synthetic" : ""}
          </p>
        </div>
        <Button
          size="sm"
          render={
            <Link href={`/upload?patient=${patientId}`}>
              <Camera /> Log a meal or reading
            </Link>
          }
        />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Messages from your care team</h2>
        <MessagesPanel messages={messages} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Your timeline</h2>
        <Timeline items={timeline} />
      </section>
    </div>
  );
}
