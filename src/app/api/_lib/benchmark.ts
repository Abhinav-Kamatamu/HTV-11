// Timing harness for T-010 (ARCHITECTURE.md benchmark route): run `fn` 5 times, discard nothing but
// report the median wall-clock ms (warm — the first call of a path can pay a one-off connection/plan
// cost, but running the real patient/row counts through it 5x already amortizes that like the UI's
// "run" button would).

export async function medianMs<T>(fn: () => Promise<T>): Promise<{ ms: number; result: T }> {
  const durations: number[] = [];
  let result: T;
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    result = await fn();
    durations.push(performance.now() - start);
  }
  const sorted = [...durations].sort((a, b) => a - b);
  const ms = sorted[Math.floor(sorted.length / 2)];
  return { ms, result: result! };
}
