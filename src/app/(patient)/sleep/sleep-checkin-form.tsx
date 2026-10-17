"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { submitSleepCheckin } from "./actions";

// Fixed form for T-064 (no Gemini). The three STOP-Bang items (RISK_ENGINE §4b) are required;
// hours slept and neck circumference are optional extras on the same observations.

type Bit = 0 | 1;
type QuestionKey = "snoring" | "tired" | "observedApnea";

const QUESTIONS: { key: QuestionKey; label: string }[] = [
  { key: "snoring", label: "Do you snore loudly?" },
  { key: "tired", label: "Are you often tired during the day?" },
  { key: "observedApnea", label: "Has anyone seen you stop breathing in your sleep?" },
];

export function SleepCheckinForm({ patientId, needsNeck }: { patientId: string; needsNeck: boolean }) {
  const [answers, setAnswers] = useState<Record<QuestionKey, Bit | null>>({
    snoring: null,
    tired: null,
    observedApnea: null,
  });
  const [sleepHours, setSleepHours] = useState("");
  const [neckCm, setNeckCm] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<"ok" | "error" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allAnswered = QUESTIONS.every((q) => answers[q.key] !== null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allAnswered || pending) return;
    setResult(null);
    setError(null);
    startTransition(async () => {
      const res = await submitSleepCheckin({
        patientId,
        snoring: answers.snoring!,
        tired: answers.tired!,
        observedApnea: answers.observedApnea!,
        sleepHours: sleepHours.trim() ? Number(sleepHours) : null,
        neckCm: needsNeck && neckCm.trim() ? Number(neckCm) : null,
      });
      if (res.ok) {
        setResult("ok");
        setAnswers({ snoring: null, tired: null, observedApnea: null });
        setSleepHours("");
        setNeckCm("");
      } else {
        setResult("error");
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-background p-4">
        {QUESTIONS.map((q) => (
          <div key={q.key} className="flex flex-col gap-1.5">
            <p className="text-sm">{q.label}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={answers[q.key] === 1 ? "default" : "outline"}
                onClick={() => setAnswers((a) => ({ ...a, [q.key]: 1 }))}
              >
                Yes
              </Button>
              <Button
                type="button"
                size="sm"
                variant={answers[q.key] === 0 ? "default" : "outline"}
                onClick={() => setAnswers((a) => ({ ...a, [q.key]: 0 }))}
              >
                No
              </Button>
            </div>
          </div>
        ))}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">Hours slept last night (optional)</span>
          <input
            type="number"
            min={0}
            max={24}
            step={0.5}
            value={sleepHours}
            onChange={(e) => setSleepHours(e.target.value)}
            className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>

        {needsNeck && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted-foreground">Neck circumference in cm (optional, asked once)</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={neckCm}
              onChange={(e) => setNeckCm(e.target.value)}
              className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>
        )}
      </div>

      <Button type="submit" disabled={!allAnswered || pending}>
        {pending && <Loader2 className="animate-spin" />}
        Submit
      </Button>

      {result === "ok" && <p className="text-sm text-muted-foreground">Thanks, logged for this week.</p>}
      {result === "error" && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
