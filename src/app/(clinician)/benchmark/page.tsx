import { BenchmarkRunner } from "./benchmark-runner";

// "Synthetic scale test" (T-048, SPEC §6): proves the Tiger Data story (continuous aggregates vs a
// raw-table scan vs fetching rows and computing in TS) with real numbers, not a claim. No DB read at
// render time — the run is an explicit client click against `POST /api/benchmark/run` (T-010) — so
// this page needs none of the Suspense/`connection()` dynamic-route handling `/queue` and
// `/patients/[id]` need (relay/clinician.md Gotchas).

export default function BenchmarkPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Synthetic scale test</h1>
        <p className="text-sm text-muted-foreground">
          Median of 5 warm runs, timed live against the current seed. Nothing here is hard-coded.
        </p>
      </div>
      <BenchmarkRunner />
    </div>
  );
}
