import { describe, expect, it } from "vitest";
import { detectSilence } from "./silence";
import { DAY_MS } from "./types";

const now = Date.UTC(2026, 9, 17);
const at = (daysAgo: number) => now - daysAgo * DAY_MS + 7.5 * 3_600_000;
/** One reading a day for `days` days, the newest `newestDaysAgo` days ago. */
const daily = (days: number, newestDaysAgo: number) => Array.from({ length: days }, (_, i) => at(newestDaysAgo + i));

describe("detectSilence", () => {
  it("flags a patient who logged every day and has nothing for 11 days", () => {
    const s = detectSilence(daily(60, 11), now);
    expect(s).not.toBeNull();
    expect(s!.daysSince).toBe(11);
    expect(s!.activeDays).toBe(30);
    expect(s!.lastTs).toBe(at(11));
  });

  it("flags exactly 7 quiet days but not 6", () => {
    expect(detectSilence(daily(30, 7), now)?.daysSince).toBe(7);
    expect(detectSilence(daily(30, 6), now)).toBeNull();
  });

  it("does not flag a patient who logged yesterday", () => {
    expect(detectSilence(daily(60, 1), now)).toBeNull();
  });

  it("does not flag a patient who was never really active (under half the prior 30 days)", () => {
    expect(detectSilence(daily(14, 10), now)).toBeNull();
    expect(detectSilence(daily(15, 10), now)?.activeDays).toBe(15);
  });

  it("looks at the 30 days ending on the last reading, not the 30 days before today", () => {
    // Active through day 20, silent since: the 30 days before today are mostly empty but she was active before the gap.
    expect(detectSilence(daily(40, 20), now)?.activeDays).toBe(30);
  });

  it("ignores readings in the future and returns null with no readings", () => {
    expect(detectSilence([], now)).toBeNull();
    expect(detectSilence([now + DAY_MS], now)).toBeNull();
  });
});
