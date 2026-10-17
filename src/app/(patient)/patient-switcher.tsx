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
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      Viewing as
      <select
        value={current}
        onChange={(e) => router.push(`/home?patient=${e.target.value}`)}
        className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-foreground sm:flex-none"
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
