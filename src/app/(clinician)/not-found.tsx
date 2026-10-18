import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

// Renders for `notFound()` anywhere under this route group — e.g. an invalid `/patients/[id]`.
// Judges get the live demo URL to try on their own phones (human request, 2026-10-17), so a stray
// or mistyped link needs a real 404 + a friendly page, not Next's default error screen (which the
// patient-detail page was hitting: `getPatientSummary` throws a 404 ApiError that bubbled up
// uncaught instead of calling next/navigation's `notFound()`).

export default function ClinicianNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <SearchX className="size-7" />
      </span>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Patient not found</h1>
        <p className="text-sm text-muted-foreground">
          That link doesn&apos;t match anyone in the demo panel. It may be mistyped, or the patient was
          removed in a reseed.
        </p>
      </div>
      <Button size="sm" render={<Link href="/queue"><ArrowLeft /> Back to queue</Link>} />
    </div>
  );
}
