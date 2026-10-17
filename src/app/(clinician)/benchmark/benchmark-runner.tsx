"use client";

import { useState } from "react";
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
  { key: "continuousAggregate", label: "Tiger Data summaries" },
  { key: "rawTable", label: "Tiger Data raw readings" },
  { key: "fetchAndCompute", label: "Pull rows, compute in app" },
];

export function BenchmarkRunner() {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [result, setResult] = useState<BenchmarkResult | null>(null);

  async function run() {
    setState("loading");
    try {
      const res = await fetch("/api/benchmark/run", { method: "POST" });
      if (!res.ok) throw new Error(`${res.status}`);
      setResult((await res.json()) as BenchmarkResult);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  const rows = result
    ? PATH_LABELS.map((p) => ({ ...p, ms: result.paths[p.key].ms }))
    : [];
  const slowest = rows.length ? Math.max(...rows.map((r) => r.ms)) : 1;
  const fastest = rows.length ? Math.min(...rows.map((r) => r.ms)) : 1;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {result
            ? `${result.patientCount.toLocaleString()} patients, ${result.paths.continuousAggregate.rows.toLocaleString()} readings. Median of 5 runs.`
            : "Runs the comparison on the current patients. Takes a few seconds."}
        </p>
        <Button size="sm" disabled={state === "loading"} onClick={run}>
          {state === "loading" ? "Running…" : result ? "Run again" : "Run speed check"}
        </Button>
      </div>

      {state === "error" && <p className="text-sm text-destructive">Couldn&apos;t reach the server, try again.</p>}

      {result && (
        <>
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <li key={r.key} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{r.label}</span>
                  <span className="text-muted-foreground">{Math.round(r.ms)} ms</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-muted">
                  <div
                    className={r.ms === fastest ? "h-full rounded-full bg-primary" : "h-full rounded-full bg-primary/35"}
                    style={{ width: `${Math.max(4, (r.ms / slowest) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="text-sm font-medium">
            Tiger Data is {(slowest / fastest).toFixed(1)}x faster than computing it in the app.
          </p>
          <p className="text-xs text-muted-foreground">
            A full engine re-run for everyone took {(result.engineRerun.ms / 1000).toFixed(1)} s and wrote{" "}
            {result.engineRerun.flagsWritten} flags.
          </p>
        </>
      )}
    </div>
  );
}
