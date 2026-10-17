import type { CriterionStatus, MetsCriteria } from "@/engine/cooccurrence";
import { cn } from "cn";

// Metabolic syndrome 3-of-5 chip row (T-046, RISK_ENGINE §4a / SPEC §6: "3 of 5 criteria, 2 unknown,
// flagged as monitor, showing we don't over-alarm"). Unknown is its own state, never folded into
// not-met, so the clinician sees what a lab order would settle.

const LABELS: Record<keyof MetsCriteria, string> = {
  waist: "Waist", triglycerides: "Triglycerides", hdl: "HDL", bp: "Blood pressure", fpg: "Fasting glucose",
};

const STATUS_STYLE: Record<CriterionStatus, string> = {
  met: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
  not_met: "border-border bg-background text-muted-foreground",
  unknown: "border-dashed border-border bg-background text-muted-foreground",
};

const STATUS_LABEL: Record<CriterionStatus, string> = { met: "met", not_met: "not met", unknown: "unknown" };

export function MetsChips({ criteria, metCount, unknownCount, fires }: {
  criteria: MetsCriteria; metCount: number; unknownCount: number; fires: boolean;
}) {
  const keys = Object.keys(LABELS) as (keyof MetsCriteria)[];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight text-muted-foreground">Metabolic syndrome screen</h3>
        <span className="text-xs text-muted-foreground">
          {metCount} of 5 criteria met{unknownCount > 0 ? `, ${unknownCount} unknown` : ""}
          {fires ? " · meets screening threshold" : ""}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {keys.map((k) => {
          const c = criteria[k];
          const byTreatment = "byTreatment" in c && c.byTreatment;
          return (
            <span
              key={k}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                STATUS_STYLE[c.status],
              )}
            >
              {LABELS[k]} · {STATUS_LABEL[c.status]}{byTreatment ? " (treatment)" : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}
