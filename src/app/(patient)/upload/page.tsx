import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { STORY_IDS } from "@/db/seed/ids";
import { UploadCard } from "./upload-card";

// Camera upload for meal + device photo (T-061), plus lab report upload (T-063, photo or PDF).
// Posts to the existing `/api/ingest/{meal,device,labs}` routes (core, T-005); this page is just
// the patient-side capture + preview UI.

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const { patient: patientId = STORY_IDS.A } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/home?patient=${patientId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to timeline
        </Link>
        <h1 className="mt-2 text-lg font-semibold tracking-tight">Log something</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <UploadCard kind="meal" patientId={patientId} />
        <UploadCard kind="device" patientId={patientId} />
        <UploadCard kind="labs" patientId={patientId} />
      </div>
    </div>
  );
}
