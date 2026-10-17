import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Database, TrendingUp, WifiOff } from "lucide-react";
import { getDb } from "@/db/client";
import { patients } from "@/db/schema";
import { olsFitBatchSql } from "@/db/vitals";
import { listSilenceSql } from "@/db/silence";
import { crossingDays, fitAt, slopePerYear, VITALS_GATE } from "@/engine/trends";
import { DAY_MS } from "@/engine/types";
import { BenchmarkRunner } from "./benchmark-runner";

// Population scan: what Tiger Data does for the product, shown on live data. The two lists below are
// each one database query across every patient (continuous aggregate `stats_agg` for vitals trends,
// `heartbeat_agg` for patients who stopped logging), timed as they run. The speed check at the bottom
// is the old benchmark (T-048), kept as the evidence for why the work lives in the database.

const BP_THRESHOLD = 130;
const WINDOW_DAYS = 90;

export default function PopulationScanPage() {
  return (
    <Suspense fallback={<ScanSkeleton />}>
      <ScanContent />
    </Suspense>
  );
}

function ScanSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="h-16 animate-pulse rounded-2xl bg-muted" />
      <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      <div className="h-40 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

type TrendRow = { id: string; name: string; perYear: number; now: number; r2: number; days: number | null };

async function loadScan() {
  const db = getDb();
  const now = Date.now();
  const all = await db.select({ id: patients.id, name: patients.name }).from(patients);
  const names = new Map(all.map((p) => [p.id, p.name]));
  const ids = all.map((p) => p.id);

  const t0 = performance.now();
  const fits = await olsFitBatchSql(db, {
    patientIds: ids,
    metrics: ["bp_systolic"],
    sinceMs: now - WINDOW_DAYS * DAY_MS,
  });
  const trendMs = performance.now() - t0;

  const t1 = performance.now();
  const silent = await listSilenceSql(db, now);
  const silenceMs = performance.now() - t1;

  let readings = 0;
  const trends: TrendRow[] = [];
  for (const [id, byMetric] of fits) {
    const fit = byMetric.get("bp_systolic");
    if (!fit) continue;
    readings += fit.n;
    if (fit.n < VITALS_GATE.minPoints || fit.r2 < VITALS_GATE.minR2) continue;
    const perYear = slopePerYear(fit);
    const current = fitAt(fit, now);
    const days = crossingDays(fit, BP_THRESHOLD, now);
    // Worth a clinician's attention: climbing, and either already past the line or reaching it inside the horizon.
    const soon = days !== null && days <= VITALS_GATE.horizonDays;
    if (perYear > 0 && (current >= BP_THRESHOLD || soon)) {
      trends.push({ id, name: names.get(id) ?? "Unknown", perYear, now: current, r2: fit.r2, days });
    }
  }
  trends.sort((a, b) => (a.days ?? -1) - (b.days ?? -1) || b.now - a.now);

  const silentRows = [...silent.entries()]
    .map(([id, s]) => ({ id, name: names.get(id) ?? "Unknown", daysSince: s.daysSince }))
    .sort((a, b) => b.daysSince - a.daysSince);

  return { patientCount: all.length, readings, trends, silentRows, trendMs, silenceMs };
}

async function ScanContent() {
  await connection();
  const { patientCount, readings, trends, silentRows, trendMs, silenceMs } = await loadScan();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Population scan</h1>
        <p className="text-base text-muted-foreground">
          Every patient&apos;s trend, checked at once. This is the work Tiger Data does behind the queue.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Patients scanned" value={patientCount.toLocaleString()} />
        <Stat label="BP readings (90 days)" value={readings.toLocaleString()} />
        <Stat label="Trend query" value={`${Math.round(trendMs)} ms`} />
        <Stat label="Silence query" value={`${Math.round(silenceMs)} ms`} />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Blood pressure heading up</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Systolic trend over the last {WINDOW_DAYS} days for everyone with enough readings, flagged if it is
          rising toward or past {BP_THRESHOLD} mmHg. Fitted inside the database, no patient data pulled into the app.
        </p>
        {trends.length === 0 ? (
          <Empty text="No one is trending toward the BP threshold right now." />
        ) : (
          <ul className="flex flex-col gap-2">
            {trends.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/patients/${t.id}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/30"
                >
                  <div className="min-w-0">
                    <p className="text-base font-semibold">{t.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Systolic about {Math.round(t.now)} mmHg, rising {t.perYear.toFixed(1)} a year
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold">
                      {t.now >= BP_THRESHOLD ? "Above 130" : `Reaches 130 in ~${Math.max(1, Math.round((t.days ?? 0) / 7))} wk`}
                    </p>
                    <p className="text-xs text-muted-foreground">fit R² {t.r2.toFixed(2)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <WifiOff className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Stopped logging</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Patients who used to log regularly and have gone quiet, found with one database query. The same list drives the
          &ldquo;Stopped logging&rdquo; filter in the queue.
        </p>
        {silentRows.length === 0 ? (
          <Empty text="Nobody has gone quiet." />
        ) : (
          <ul className="flex flex-col gap-2">
            {silentRows.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/patients/${s.id}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/30"
                >
                  <p className="text-base font-semibold">{s.name}</p>
                  <p className="text-sm text-muted-foreground">No readings for {s.daysSince} days</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Database className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Why do this in the database?</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          The same trend fit three ways. Tiger Data&apos;s pre-computed summaries read far less data than scanning raw
          readings, and both beat pulling every row into the app. The gap widens as patients and readings grow.
        </p>
        <BenchmarkRunner />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card px-4 py-6 text-center text-base text-muted-foreground">
      {text}
    </div>
  );
}
