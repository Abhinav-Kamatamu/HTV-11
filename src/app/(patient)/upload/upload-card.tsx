"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { metricLabel } from "../home/timeline-data";

// Shared camera-upload card for T-061 (meal + device photo). Posts straight to the existing
// ingest routes (ARCHITECTURE.md): the engine already re-runs server-side on each ingest, but
// its `flags` are intentionally dropped here — CLAUDE.md §4, no risk alert reaches the patient
// directly, only a clinician-validated message (shown on /home instead).

type Kind = "meal" | "device";

type MealResult = {
  meal: { items: { name?: string }[]; kcal: number | null; carbsG: number | null; proteinG: number | null; fatG: number | null };
  extraction: { status: string; data?: { confidence: number } };
};

type DeviceResult = {
  observations: { metric: string; value: number; unit: string }[];
  extraction: { status: string; data?: { confidence: number } };
};

type Result = MealResult | DeviceResult;

const COPY: Record<Kind, { title: string; hint: string; verb: string }> = {
  meal: { title: "Log a meal", hint: "Take a photo of your plate", verb: "meal" },
  device: { title: "Log a device reading", hint: "Take a photo of the screen (BP monitor, scale, fitness tracker)", verb: "reading" },
};

export function UploadCard({ kind, patientId }: { kind: Kind; patientId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const copy = COPY[kind];

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return f ? URL.createObjectURL(f) : null;
    });
  }

  function reset() {
    setFile(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setStatus("idle");
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onSubmit() {
    if (!file) return;
    setStatus("submitting");
    setError(null);
    try {
      const formData = new FormData();
      formData.set("patientId", patientId);
      formData.set("photo", file);
      const res = await fetch(`/api/ingest/${kind}`, { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong");
      setResult(body as Result);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  const needsManualEntry = result?.extraction.status === "needs_manual_entry";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4">
      <div>
        <p className="text-sm font-medium">{copy.title}</p>
        <p className="text-xs text-muted-foreground">{copy.hint}</p>
      </div>

      {status !== "done" && (
        <>
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="max-h-48 w-full rounded-lg border border-border object-cover" />
          ) : (
            <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:bg-muted/40">
              <Camera className="size-5" />
              Take or choose a photo
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={onPick}
              />
            </label>
          )}

          <div className="flex gap-2">
            {file && status !== "submitting" && (
              <Button variant="outline" size="sm" onClick={reset}>
                <RotateCcw /> Retake
              </Button>
            )}
            <Button size="sm" disabled={!file || status === "submitting"} onClick={onSubmit}>
              {status === "submitting" && <Loader2 className="animate-spin" />}
              {status === "submitting" ? "Uploading…" : `Log this ${copy.verb}`}
            </Button>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </>
      )}

      {status === "done" && result && (
        <div className="flex flex-col gap-2">
          {needsManualEntry ? (
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t read that photo clearly. Try retaking it in better light, closer to the screen or plate.
            </p>
          ) : (
            <ResultPreview kind={kind} result={result} />
          )}
          <Button variant="outline" size="sm" onClick={reset} className="self-start">
            <RotateCcw /> Log another
          </Button>
        </div>
      )}
    </div>
  );
}

function ResultPreview({ kind, result }: { kind: Kind; result: Result }) {
  const confidence = result.extraction.data?.confidence ?? 0;
  if (kind === "meal") {
    const meal = (result as MealResult).meal;
    const name = meal.items.map((i) => i.name).filter(Boolean).join(", ") || "Meal";
    const macros = [
      meal.kcal !== null ? `${Math.round(meal.kcal)} kcal` : null,
      meal.carbsG !== null ? `${Math.round(meal.carbsG)}g carbs` : null,
      meal.proteinG !== null ? `${Math.round(meal.proteinG)}g protein` : null,
      meal.fatG !== null ? `${Math.round(meal.fatG)}g fat` : null,
    ].filter(Boolean);
    return (
      <div className="rounded-lg bg-muted/40 p-3">
        <p className="text-sm font-medium">Logged: {name}</p>
        {macros.length > 0 && <p className="text-sm text-muted-foreground">{macros.join(" · ")}</p>}
        {confidence < 0.8 && (
          <Badge variant="outline" className="mt-1.5 border-border bg-muted text-muted-foreground">
            Estimated from photo, review the details
          </Badge>
        )}
      </div>
    );
  }

  const device = result as DeviceResult;
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="text-sm font-medium">Logged reading</p>
      <p className="text-sm text-muted-foreground">
        {device.observations.map((o) => `${metricLabel(o.metric)} ${o.value} ${o.unit}`).join(" · ")}
      </p>
      {confidence < 0.8 && (
        <Badge variant="outline" className="mt-1.5 border-border bg-muted text-muted-foreground">
          Estimated from photo, review the details
        </Badge>
      )}
    </div>
  );
}
