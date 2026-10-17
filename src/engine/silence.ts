import { dayOf } from "./types";

// Patients who stopped logging (RISK_ENGINE §8). The database version is a Tiger Data heartbeat_agg query
// (T-008); this pure version is the engine's fallback and the oracle that query must agree with.

export const SILENCE = {
  /** No reading for at least this many days. */
  quietDays: 7,
  /** The activity check looks at this many days ending on the last reading. */
  lookbackDays: 30,
  /** Active means logged on at least this share of those days. */
  activeShare: 0.5,
} as const;

/** Daily self-logged series. Labs, tape measures and intake are not heartbeats. */
export const HEARTBEAT_METRICS: ReadonlySet<string> = new Set([
  "bp_systolic", "bp_diastolic", "weight_kg", "resting_hr", "steps", "sleep_hours",
]);

export type Silence = {
  /** Timestamp of the last reading. */
  lastTs: number;
  /** Calendar days from the last reading to `now`. */
  daysSince: number;
  /** Distinct days with a reading in the 30 days ending on the last reading. */
  activeDays: number;
};

/** Silent when active before, then nothing for 7 or more days. Null means not silent (or never active). */
export function detectSilence(timestamps: number[], now: number): Silence | null {
  const usable = timestamps.filter((t) => t <= now);
  if (usable.length === 0) return null;
  const lastTs = Math.max(...usable);
  const daysSince = dayOf(now) - dayOf(lastTs);
  if (daysSince < SILENCE.quietDays) return null;
  const from = dayOf(lastTs) - (SILENCE.lookbackDays - 1);
  const activeDays = new Set(usable.map(dayOf).filter((d) => d >= from)).size;
  if (activeDays < SILENCE.lookbackDays * SILENCE.activeShare) return null;
  return { lastTs, daysSince, activeDays };
}
