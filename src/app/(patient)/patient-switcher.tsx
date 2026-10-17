"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { STORY_IDS } from "@/db/seed/ids";

// No real auth (CLAUDE.md §4 scope): "which patient am I" is a `?patient=` query param on `/home`,
// defaulting to Patient A (docs/DECISIONS.md T-060). This lets the demo switch to Patient B's view
// after the clinician validates a flag (SPEC.md §6 beat 3).

export function PatientSwitcher({ patients }: { patients: { id: string; name: string }[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("patient") ?? STORY_IDS.A;

  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      Viewing as
      <select
        value={current}
        onChange={(e) => router.push(`/home?patient=${e.target.value}`)}
        className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
      >
        {patients.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
