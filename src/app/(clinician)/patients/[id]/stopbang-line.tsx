import type { StopBangItemKey, StopBangResult } from "@/engine/stopbang";
import { cn } from "cn";

// STOP-Bang line (T-046, RISK_ENGINE §4b): a 0-8 track shaded by band (low/intermediate/high, Chung
// 2016) with a marker at the lower-bound score, plus the per-item breakdown so the clinician can see
// which inputs (if any) are missing rather than assumed.

const MAX_SCORE = 8;
const BAND_STOPS = [
  { from: 0, to: 3, className: "bg-blue-500/20" },
  { from: 3, to: 5, className: "bg-amber-500/25" },
  { from: 5, to: 8, className: "bg-destructive/25" },
];

const BAND_LABEL: Record<StopBangResult["band"], { label: string; className: string }> = {
  low: { label: "Low", className: "text-blue-700 dark:text-blue-400" },
  intermediate: { label: "Intermediate", className: "text-amber-700 dark:text-amber-400" },
  high: { label: "High", className: "text-destructive" },
};

const ITEM_LABEL: Record<StopBangItemKey, string> = {
  snoring: "Snoring", tired: "Tired", observedApnea: "Observed apnea", pressure: "Pressure (treated BP)",
  bmi: "BMI > 35", age: "Age > 50", neck: "Neck > 40cm", male: "Male",
};

export function StopBangLine({ result }: { result: StopBangResult }) {
  const band = BAND_LABEL[result.band];
  const markerPct = (result.score / MAX_SCORE) * 100;
  const missing = (Object.entries(result.items) as [StopBangItemKey, { known: boolean }][])
    .filter(([, v]) => !v.known).map(([k]) => ITEM_LABEL[k]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight text-muted-foreground">STOP-Bang screen</h3>
        <span className="text-xs">
          <span className={cn("font-medium", band.className)}>{band.label}</span>
          <span className="text-muted-foreground">
            {" "}· score {result.score}{result.lowerBound ? " (lower bound)" : ""} of {MAX_SCORE}
          </span>
        </span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full border border-border">
        <div className="absolute inset-0 flex">
          {BAND_STOPS.map((b) => (
            <div key={b.from} className={b.className} style={{ width: `${((b.to - b.from) / MAX_SCORE) * 100}%` }} />
          ))}
        </div>
        <div
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground"
          style={{ left: `${markerPct}%` }}
          title={`Score ${result.score}`}
        />
      </div>
      {missing.length > 0 && (
        <p className="text-xs text-muted-foreground">Not recorded: {missing.join(", ")} (counted as 0).</p>
      )}
    </div>
  );
}
