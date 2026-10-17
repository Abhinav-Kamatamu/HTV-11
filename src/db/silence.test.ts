import { describe, expect, it } from "vitest";
import { dayOf } from "../engine/types";

// src/db/silence.ts hits a live database for everything else (parity-tested against the engine's
// detectSilence in scripts/verify-silence-sql.ts, same no-DB-in-the-suite convention as
// timescale.test.ts). This guards the one piece of pure arithmetic that's easy to get wrong: daysSince
// must be a calendar-day difference (dayOf(now) - dayOf(lastTs)), not floor(continuous ms / DAY_MS) —
// found while building T-008, when an earlier draft used the latter and silently gave the wrong answer
// whenever `now` and `lastTs` fall at different times of day.
describe("calendar-day vs continuous-duration daysSince", () => {
  it("diverges exactly when now is earlier in the day than lastTs", () => {
    const DAY_MS = 86_400_000;
    // lastTs: day 8 at 23:00. now: day 10 at 01:00. Calendar days apart: 2. Continuous duration: ~26h.
    const lastTs = 8 * DAY_MS + 23 * 60 * 60 * 1000;
    const now = 10 * DAY_MS + 1 * 60 * 60 * 1000;

    const calendarDays = dayOf(now) - dayOf(lastTs);
    const continuousDays = Math.floor((now - lastTs) / DAY_MS);

    expect(calendarDays).toBe(2);
    expect(continuousDays).toBe(1);
    expect(calendarDays).not.toBe(continuousDays);
  });
});
