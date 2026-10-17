"use client";

import { useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";

// Benchmark runner (T-048): on demand, not auto-run on page load — same convention as
// `visit-summary.tsx`'s Generate button, here because a cold run against Tiger Cloud is a real,
// user-visible wait, not because it costs money. Hits the existing `POST /api/benchmark/run` (T-010)
// and renders its response untouched: patient/row counts, a bar chart of median ms per data-access
// path, and the moment the result landed (the API itself returns no timestamp).

type BenchmarkResult = {
  patientCount: number;
  paths: {
    continuousAggregate: { ms: number; rows: number };
    rawTable: { ms: number; rows: number };
    fetchAndCompute: { ms: number; rows: number };
  };
  silenceScan: { ms: number; silentPatients: number };
  engineRerun: { ms: number; flagsWritten: number };
};

const PATH_LABELS: { key: keyof BenchmarkResult["paths"]; label: string }[] = [
  { key: "continuousAggregate", label: "Continuous aggregate" },
  { key: "rawTable", label: "Raw table" },
  { key: "fetchAndCompute", label: "Fetch + compute (TS)" },
];

function formatRunTime(d: Date): string {
  return d.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "medium" });
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-background p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

export function BenchmarkRunner() {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [ranAt, setRanAt] = useState<Date | null>(null);

  async function run() {
    setState("loading");
    try {
      const res = await fetch("/api/benchmark/run", { method: "POST" });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json()) as BenchmarkResult;
      setResult(data);
      setRanAt(new Date());
      setState("idle");
    } catch {
      setState("error");
    }
  }

  const chartRows = result
    ? PATH_LABELS.map((p) => ({ label: p.label, ms: Math.round(result.paths[p.key].ms) }))
    : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">Run</h2>
            {ranAt && <p className="text-xs text-muted-foreground">Last run {formatRunTime(ranAt)}</p>}
          </div>
          <Button size="sm" disabled={state === "loading"} onClick={run}>
            {state === "loading" ? "Running…" : result ? "Run again" : "Run"}
          </Button>
        </div>

        {state === "error" && (
          <p className="text-xs text-destructive">Couldn&apos;t reach the server — try again.</p>
        )}
        {!result && state === "idle" && (
          <p className="text-sm text-muted-foreground">
            Times 5 warm runs (median) of the vitals OLS fit three ways, a full silent-patient scan, and
            a full engine re-run, against every patient currently in the database.
          </p>
        )}
      </div>

      {result && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatTile label="Patients" value={result.patientCount.toLocaleString()} />
            <StatTile label="Rows scanned (vitals)" value={result.paths.continuousAggregate.rows.toLocaleString()} />
            <StatTile label="Silent patients found" value={result.silenceScan.silentPatients.toLocaleString()} />
            <StatTile label="Flags written" value={result.engineRerun.flagsWritten.toLocaleString()} />
          </div>

          <div className="rounded-xl border border-border bg-background p-4">
            <h3 className="mb-3 text-sm font-medium">Median ms per path</h3>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartRows} layout="vertical" barSize={20}
                  margin={{ top: 0, right: 64, bottom: 0, left: 0 }}
                >
                  <CartesianGrid horizontal={false} stroke="var(--color-border)" strokeDasharray="3 3" />
                  <XAxis
                    type="number" domain={[0, (max: number) => Math.ceil(max * 1.15)]}
                    stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false}
                  />
                  <YAxis
                    type="category" dataKey="label" stroke="var(--color-muted-foreground)" fontSize={11}
                    tickLine={false} axisLine={false} width={140}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value} ms`, "Median"]}
                    contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="ms" fill="var(--color-chart-5)" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                    <LabelList dataKey="ms" position="right" formatter={(v: ReactNode) => `${v} ms`} fill="var(--color-muted-foreground)" fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Same vitals OLS fit (slope, R², threshold crossing) computed three ways: TimescaleDB
              continuous aggregate, a raw-table SQL scan, and fetching rows to compute in TypeScript.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
