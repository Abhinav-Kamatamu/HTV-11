import { describe, expect, it } from "vitest";
import { medianMs } from "./benchmark";

describe("medianMs", () => {
  it("calls fn exactly 5 times and returns the last call's result", async () => {
    let calls = 0;
    const { result } = await medianMs(async () => {
      calls += 1;
      return calls;
    });
    expect(calls).toBe(5);
    expect(result).toBe(5);
  });

  it("returns a non-negative duration", async () => {
    const { ms } = await medianMs(async () => "x");
    expect(ms).toBeGreaterThanOrEqual(0);
  });
});
