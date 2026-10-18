// Timing harness for T-010 (ARCHITECTURE.md benchmark route): run `fn` `times` times, discard
// nothing but report the median wall-clock ms (warm — the first call of a path can pay a one-off
// connection/plan cost, but running the real patient/row counts through it a few times already
// amortizes that like the UI's "run" button would).
//
// `times` defaults to 5 for the fast OLS/silence-scan paths, where 5 samples is cheap and smooths
// out noise. The caller passes 1 for anything whose own single run already costs seconds (the full
// engine re-run): a demo-rehearsal script (scripts/demo-rehearsal.ts, human request 2026-10-17)
// caught that this route was taking ~11.6s end to end in dev — not the ~2s the page's "median"
// number implied — because the request blocks until all 5 engine-rerun samples finish even though
// only the median is ever shown. The engine re-run is also deterministic given the same data (same
// evaluate() over the same observations each time), so a second sample was never adding signal the
// way it does for the OLS paths' connection/plan-cache noise.

export async function medianMs<T>(fn: () => Promise<T>, times = 5): Promise<{ ms: number; result: T }> {
  const durations: number[] = [];
  let result: T;
  for (let i = 0; i < times; i++) {
    const start = performance.now();
    result = await fn();
    durations.push(performance.now() - start);
  }
  const sorted = [...durations].sort((a, b) => a - b);
  const ms = sorted[Math.floor(sorted.length / 2)];
  return { ms, result: result! };
}
