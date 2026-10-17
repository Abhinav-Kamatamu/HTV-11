"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { SourceId } from "@/engine/sources";
import { Citation } from "./flag-card";

// Visit prep summary (T-044): on-demand Gemini bullet summary of a patient's open flags
// (SPEC.md §3.5, "one-click summary ... for the appointment"). On demand, not auto-fetched on page
// load, since each click is a real Gemini call (relay/clinician.md In flight).

type VisitSummaryResult =
  | { status: "ok"; data: { bullets: string[]; citedSourceIds: SourceId[] } }
  | { status: "needs_manual_entry" };

export function VisitSummary({ patientId }: { patientId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [result, setResult] = useState<VisitSummaryResult | null>(null);

  async function generate() {
    setState("loading");
    setResult(null);
    try {
      const res = await fetch(`/api/patients/${patientId}/visit-summary`);
      if (!res.ok) throw new Error(`${res.status}`);
      const extraction = (await res.json()) as VisitSummaryResult;
      setResult(extraction);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">Visit prep summary</h2>
        <Button size="sm" variant="outline" disabled={state === "loading"} onClick={generate}>
          {state === "loading" ? "Generating…" : result ? "Regenerate" : "Generate"}
        </Button>
      </div>

      {state === "error" && (
        <p className="text-xs text-destructive">Couldn&apos;t reach the server — try again.</p>
      )}

      {result?.status === "needs_manual_entry" && (
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t generate a summary from the current flags — try again, or review the flag cards
          below directly.
        </p>
      )}

      {result?.status === "ok" && (
        <>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {result.data.bullets.map((bullet, i) => <li key={i}>{bullet}</li>)}
          </ul>
          {result.data.citedSourceIds.length > 0 && (
            <p className="flex flex-wrap gap-2 border-t border-border pt-2 text-xs">
              {result.data.citedSourceIds.map((id) => <Citation key={id} id={id} />)}
            </p>
          )}
        </>
      )}

      {!result && state === "idle" && (
        <p className="text-sm text-muted-foreground">
          Summarizes the open flags below into a few plain-language bullets for the appointment.
        </p>
      )}
    </div>
  );
}
