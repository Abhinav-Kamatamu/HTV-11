"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Layer } from "@/engine/points";
import { SOURCES, type SourceId } from "@/engine/sources";
import { cn } from "cn";

// Flag card with the points-ledger "why" panel (T-043/T-045): one row per contribution with layer,
// +points, reason, and citation. Validate/dismiss call the existing API routes directly (ARCHITECTURE.md).

type Contribution = {
  layer: Layer;
  points: number;
  reason: string;
  sourceIds: SourceId[];
  stale?: boolean;
  unconfirmed?: boolean;
};

export type FlagView = {
  id: string;
  condition: string;
  title: string;
  severity: "monitor" | "review" | "urgent";
  points: number;
  contributions: Contribution[];
  label: string | null;
  status: "new" | "validated" | "dismissed";
};

const SEVERITY_BADGE: Record<FlagView["severity"], { label: string; className: string }> = {
  urgent: { label: "Urgent", className: "border-transparent bg-destructive/10 text-destructive" },
  review: { label: "Review", className: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  monitor: { label: "Monitor", className: "border-transparent bg-blue-500/15 text-blue-700 dark:text-blue-400" },
};

const LAYER_LABEL: Record<Layer, string> = {
  threshold: "Threshold", score: "Score", trend: "Trend", changepoint: "Change point",
  cooccurrence: "Co-occurrence", sleep: "Sleep screen", symptom: "Symptom", gap: "Engagement",
};

function Citation({ id }: { id: SourceId }) {
  const source = SOURCES[id];
  return (
    <a
      href={source.url} target="_blank" rel="noreferrer"
      className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
      title={`${source.publisher} ${source.year} (${source.verification})`}
    >
      {source.title.length > 40 ? `${source.title.slice(0, 40)}…` : source.title}
    </a>
  );
}

export function FlagCard({ flag }: { flag: FlagView }) {
  const router = useRouter();
  const badge = SEVERITY_BADGE[flag.severity];
  const [pending, setPending] = useState<"validate" | "dismiss" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function resolve(action: "validate" | "dismiss") {
    setPending(action);
    setError(null);
    try {
      const res = await fetch(`/api/flags/${flag.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "validate" ? { note: note || undefined } : { reason: note || undefined }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      router.refresh();
    } catch {
      setError("Couldn't reach the server — try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
            <span className="text-xs text-muted-foreground uppercase">{flag.condition}</span>
            {flag.status === "validated" && <Badge variant="secondary">Validated</Badge>}
          </div>
          <p className="mt-1 text-sm font-medium">{flag.title}</p>
          {flag.label && <p className="text-xs text-muted-foreground">{flag.label}</p>}
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold">{flag.points}</p>
          <p className="text-xs text-muted-foreground">priority points</p>
        </div>
      </div>

      <ul className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3">
        {flag.contributions.map((c, i) => (
          <li key={i} className="flex flex-col gap-0.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{LAYER_LABEL[c.layer]}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {c.points > 0 ? `+${c.points}` : c.points} pt{Math.abs(c.points) === 1 ? "" : "s"}
                {c.stale ? " · stale" : ""}{c.unconfirmed ? " · unconfirmed" : ""}
              </span>
            </div>
            <p className="text-muted-foreground">{c.reason}</p>
            {c.sourceIds.length > 0 && (
              <p className="flex flex-wrap gap-2 text-xs">
                {c.sourceIds.map((id) => <Citation key={id} id={id} />)}
              </p>
            )}
          </li>
        ))}
      </ul>

      {flag.status === "new" && (
        <div className="flex flex-col gap-2">
          <textarea
            value={note} onChange={(e) => setNote(e.target.value)} placeholder="Clinical note (optional)"
            className={cn(
              "min-h-16 w-full resize-none rounded-md border border-input bg-background p-2 text-sm",
              "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none",
            )}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={pending !== null} onClick={() => resolve("validate")}>
              {pending === "validate" ? "Validating…" : "Validate"}
            </Button>
            <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => resolve("dismiss")}>
              {pending === "dismiss" ? "Dismissing…" : "Dismiss"}
            </Button>
            {error && <span className="text-xs text-destructive">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
