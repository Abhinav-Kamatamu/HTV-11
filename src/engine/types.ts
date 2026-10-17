// Shared engine types. Timestamps are epoch milliseconds so every module is pure and timezone free.

export const DAY_MS = 86_400_000;
export const DAYS_PER_YEAR = 365.25;

/** A single reading of one metric. */
export type Pt = { ts: number; value: number };

export type Sex = "female" | "male";

export type Condition = "t2d" | "ckd" | "htn" | "masld" | "mets" | "osa" | "engagement";

export const dayOf = (ts: number): number => Math.floor(ts / DAY_MS);
