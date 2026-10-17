import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db/client";
import { getPatientSummary, loadPatientRecord } from "@/app/api/_lib/engine-db";
import { evaluate } from "@/engine/evaluate";
import { buildLabCharts } from "./lab-charts";
import { LabChart } from "./lab-chart";
import { buildVitalsCharts } from "./vitals-charts";
import { VitalsChart } from "./vitals-chart";
import { MetsChips } from "./mets-chips";
import { StopBangLine } from "./stopbang-line";
import { FlagCard, type FlagView } from "./flag-card";
import { VisitSummary } from "./visit-summary";

// Patient detail (T-042/T-043): lab trend charts with Sen projection + threshold bands, and a flag
// "why" panel with the points ledger, evidence and citations. Same Cache Components pattern as
// `/queue` (relay/clinician.md Gotchas): Suspense + `connection()` around the DB-reading subtree.

function age(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
    years -= 1;
  }
  return years;
}

export default function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PatientSkeleton />}>
      <PatientContent params={params} />
    </Suspense>
  );
}

function PatientSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-10 w-40 animate-pulse rounded-lg bg-muted/50" />
      <div className="h-20 animate-pulse rounded-xl bg-muted/50" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-56 animate-pulse rounded-xl bg-muted/50" />
        ))}
      </div>
    </div>
  );
}

async function PatientContent({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const [summary, record] = await Promise.all([getPatientSummary(getDb(), id), loadPatientRecord(getDb(), id)]);
  const evaluation = evaluate(record);
  const charts = buildLabCharts(summary.observations);
  const vitalsCharts = buildVitalsCharts(summary.observations);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/queue" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Back to queue
        </Link>
        <div className="mt-2 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{summary.patient.name}</h1>
            <p className="text-sm text-muted-foreground">
              {age(summary.patient.dob)}y &middot; {summary.patient.sex}
              {summary.patient.synthetic ? " · synthetic" : ""}
            </p>
          </div>
        </div>
      </div>

      <VisitSummary patientId={id} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">Open flags</h2>
        {summary.flags.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open flags.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {summary.flags.map((f) => <FlagCard key={f.id} flag={f as FlagView} />)}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">Lab trends</h2>
        {charts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lab observations yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {charts.map((series) => (
              <div key={series.metric} className="rounded-xl border border-border bg-background p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="text-sm font-medium">{series.label}</h3>
                  <span className="text-xs text-muted-foreground">{series.unit}</span>
                </div>
                <LabChart series={series} />
                {series.trend && !series.trend.passes && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Not enough points, or no significant trend yet (Mann-Kendall p = {series.trend.p.toFixed(3)}).
                  </p>
                )}
                {series.crossing && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Projected to cross in about {Math.round(series.crossing.days / 30.44)} months.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">Vitals</h2>
        {vitalsCharts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No vitals observations yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {vitalsCharts.map((series) => (
              <div key={series.metric} className="rounded-xl border border-border bg-background p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="text-sm font-medium">{series.label}</h3>
                  <span className="text-xs text-muted-foreground">{series.unit}</span>
                </div>
                <VitalsChart series={series} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-background p-4">
          <MetsChips
            criteria={evaluation.mets.criteria} metCount={evaluation.mets.metCount}
            unknownCount={evaluation.mets.unknownCount} fires={evaluation.mets.fires}
          />
        </div>
        <div className="rounded-xl border border-border bg-background p-4">
          <StopBangLine result={evaluation.stopBang} />
        </div>
      </section>
    </div>
  );
}
