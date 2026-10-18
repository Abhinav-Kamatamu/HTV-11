// Demo rehearsal (human request, 2026-10-17): dry-runs the SPEC.md §6 6-beat demo script against a
// running app, timing each beat's actual network/DB work separately from its narration budget, so a
// technical stall doesn't eat into the 3-minute slot without anyone noticing until the real pitch.
//
// Deliberately NOT a Vitest test / not part of `npm test` — same convention as
// `verify-vitals-sql.ts`/`timescale.test.ts`: it needs a live app (and Tiger Cloud behind it), which
// isn't guaranteed in every teammate's environment or CI. Run it by hand before a rehearsal:
//
//   npm run demo:rehearse                       # time it, don't actually wait out loud
//   npm run demo:rehearse -- --live              # also pauses for each beat's narration seconds —
//                                                 # use the terminal as a pacing clock while you talk
//   npm run demo:rehearse -- --base-url=https://cleanbillof.health
//
// Read-only except beat 6's POST /api/benchmark/run, which is the exact "Run speed check" button the
// Population scan page already exposes to a clinician — safe to call repeatedly because
// `runEngineForPatient` only ever touches flags with status "new" (src/app/api/_lib/engine-db.ts),
// never a validated/dismissed one. Beats 3 and 4's mutating steps (validate/dismiss a flag, send a
// patient message, submit a real meal/device photo to Gemini) are NOT automated here — they cost
// money (Gemini), aren't idempotent, and would alter the shared demo data other teammates see.
// Those stay "rehearse live" placeholders; this script only proves the *pages* those beats open load
// fast, not the interactive step inside them.

import { STORY_IDS } from "../src/db/seed/ids";

const BASE_URL = process.argv.find((a) => a.startsWith("--base-url="))?.slice("--base-url=".length) ?? "http://localhost:3000";
const LIVE = process.argv.includes("--live");
const BUDGET_SECONDS = 180; // SPEC.md §6: "3 minutes"

// A technical step slower than this is a stall the audience watches happen, independent of whether
// it still fits inside the narration budget. WARN_MS is roughly the slowest "fine" call seen live in
// this repo's own Gotchas (visit-summary's real Gemini call: 3-6s); FAIL_MS is the old unbatched
// benchmark route's ballpark (~60s was the bug T-012 fixed) scaled down to "clearly broken."
const WARN_MS = 3000;
const FAIL_MS = 10000;

type Beat = {
  label: string;
  explainSeconds: number;
  /** Returns a short description of what it hit, or null if this beat's technical step is skipped
   * (interactive/mutating, rehearsed live instead — see file header). */
  run: () => Promise<string | null>;
};

async function getOk(path: string): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
}

const BEATS: Beat[] = [
  {
    label: "1. Hook — Patient A's six-point HbA1c chart",
    explainSeconds: 20,
    run: async () => { await getOk(`/patients/${STORY_IDS.A}`); return `GET /patients/${STORY_IDS.A}`; },
  },
  {
    label: "2. Clinician dashboard — queue, open Patient A, why panel",
    explainSeconds: 40,
    run: async () => { await getOk("/queue"); await getOk(`/patients/${STORY_IDS.A}`); return "GET /queue + /patients/A"; },
  },
  {
    label: "3. Patient B — eGFR/BP charts, CUSUM marker",
    explainSeconds: 40,
    run: async () => { await getOk(`/patients/${STORY_IDS.B}`); return `GET /patients/${STORY_IDS.B}`; },
  },
  {
    label: "4. Live photo input on stage (meal + BP monitor photos)",
    explainSeconds: 40,
    run: async () => null, // real Gemini calls aren't auto-run here — see file header
  },
  {
    label: "5. Patient C — metabolic syndrome 3-of-5, STOP-Bang",
    explainSeconds: 20,
    run: async () => { await getOk(`/patients/${STORY_IDS.C}`); return `GET /patients/${STORY_IDS.C}`; },
  },
  {
    label: "6. Tiger Data beat — Population scan + speed check",
    explainSeconds: 20,
    run: async () => {
      await getOk("/benchmark");
      const res = await fetch(`${BASE_URL}/api/benchmark/run`, { method: "POST" });
      if (!res.ok) throw new Error(`POST /api/benchmark/run -> ${res.status}`);
      return "GET /benchmark + POST /api/benchmark/run";
    },
  },
];

type Result = { beat: Beat; techMs: number | null; ok: boolean; note: string };

async function main() {
  console.log(`Demo rehearsal against ${BASE_URL}${LIVE ? " (live pacing — will actually pause per beat)" : ""}\n`);

  const results: Result[] = [];
  for (const beat of BEATS) {
    process.stdout.write(`${beat.label} ... `);
    let techMs: number | null = null;
    let ok = true;
    let note: string;
    const t0 = performance.now();
    try {
      const outcome = await beat.run();
      if (outcome === null) {
        note = "skipped (interactive/mutating — rehearse live)";
      } else {
        techMs = performance.now() - t0;
        note = outcome;
        ok = techMs < FAIL_MS;
      }
    } catch (err) {
      ok = false;
      note = err instanceof Error ? err.message : String(err);
    }
    const flag = techMs === null ? "–" : techMs > FAIL_MS ? "FAIL" : techMs > WARN_MS ? "WARN" : "ok";
    console.log(techMs === null ? `n/a [${flag}]` : `${Math.round(techMs)}ms [${flag}]`);
    results.push({ beat, techMs, ok, note });

    if (LIVE) {
      process.stdout.write(`  (explaining for ${beat.explainSeconds}s...)\n`);
      await new Promise((r) => setTimeout(r, beat.explainSeconds * 1000));
    }
  }

  const totalExplain = BEATS.reduce((a, b) => a + b.explainSeconds, 0);
  const totalTechMs = results.reduce((a, r) => a + (r.techMs ?? 0), 0);
  const totalSeconds = totalExplain + totalTechMs / 1000;

  console.log("\n--- Summary ---");
  for (const r of results) {
    console.log(`${r.ok ? "✓" : "✗"} ${r.beat.label}`);
    console.log(
      `    narration budget ${r.beat.explainSeconds}s, technical ${r.techMs === null ? "n/a" : `${Math.round(r.techMs)}ms`} — ${r.note}`,
    );
  }
  console.log(`\nNarration budget (SPEC.md §6): ${totalExplain}s`);
  console.log(`Technical overhead on top of it: ${(totalTechMs / 1000).toFixed(1)}s`);
  console.log(`Estimated total: ${totalSeconds.toFixed(1)}s of a ${BUDGET_SECONDS}s (3:00) budget`);

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.log(`\n${failed.length} beat(s) failed or stalled badly enough to fix before the real demo.`);
    process.exitCode = 1;
  } else if (totalSeconds > BUDGET_SECONDS) {
    console.log(`\nOver budget by ${(totalSeconds - BUDGET_SECONDS).toFixed(1)}s — technical overhead alone is eating into narration time.`);
    process.exitCode = 1;
  } else {
    console.log("\nAll beats within budget.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
