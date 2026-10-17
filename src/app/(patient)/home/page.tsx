import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Camera, Moon, MessageCircle } from "lucide-react";
import { getDb } from "@/db/client";
import { getPatientSummary, listMessages } from "@/app/api/_lib/engine-db";
import { STORY_IDS } from "@/db/seed/ids";
import { buildTimeline } from "./timeline-data";
import { Timeline } from "./timeline";
import { MessagesPanel } from "./messages-panel";

// Patient home (T-060): own timeline (meals, device readings, lab reports, symptom chats) and
// messages from the care team. No risk scores or flags here (CLAUDE.md §4: the patient never
// receives a risk alert directly from the AI, only a clinician-validated message).

export default function PatientHomePage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent searchParams={searchParams} />
    </Suspense>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-16 animate-pulse rounded-xl bg-muted/50" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="h-64 animate-pulse rounded-xl bg-muted/50" />
        <div className="h-64 animate-pulse rounded-xl bg-muted/50" />
      </div>
    </div>
  );
}

async function HomeContent({ searchParams }: { searchParams: Promise<{ patient?: string }> }) {
  await connection();
  const { patient: patientId = STORY_IDS.A } = await searchParams;
  const db = getDb();
  const [summary, messages] = await Promise.all([
    getPatientSummary(db, patientId),
    listMessages(db, patientId),
  ]);
  const timeline = buildTimeline(summary);

  const firstName = summary.patient.name.split(" ")[0];
  const unread = messages.filter((m) => !m.readAt).length;
  const q = `?patient=${patientId}`;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Welcome back, {firstName}</h1>
        <p className="text-base text-muted-foreground">
          {unread > 0
            ? `You have ${unread} new message${unread === 1 ? "" : "s"} from your care team.`
            : "Your care team is keeping an eye on the long game. Log anything you like below."}
        </p>
      </div>

      <section aria-label="Quick actions" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ActionTile href={`/upload${q}`} icon={<Camera className="size-6" />} title="Log a meal or reading" hint="Snap a photo" primary />
        <ActionTile href={`/symptoms${q}`} icon={<MessageCircle className="size-6" />} title="How I'm feeling" hint="Tell us in your own words" />
        <ActionTile href={`/sleep${q}`} icon={<Moon className="size-6" />} title="Sleep check-in" hint="Three quick taps" />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Messages from your care team</h2>
        <MessagesPanel messages={messages} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Your timeline</h2>
        <Timeline items={timeline} />
      </section>
    </div>
  );
}

function ActionTile({
  href,
  icon,
  title,
  hint,
  primary = false,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  hint: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "flex items-center gap-4 rounded-2xl border p-4 shadow-sm transition-colors sm:flex-col sm:items-start sm:gap-3 " +
        (primary
          ? "border-transparent bg-primary text-primary-foreground hover:bg-primary/90"
          : "border-border bg-card hover:border-primary/40 hover:bg-accent/40")
      }
    >
      <span
        className={
          "flex size-11 shrink-0 items-center justify-center rounded-xl " +
          (primary ? "bg-white/15" : "bg-secondary text-secondary-foreground")
        }
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-base font-semibold leading-snug">{title}</span>
        <span className={"block text-sm " + (primary ? "text-primary-foreground/80" : "text-muted-foreground")}>{hint}</span>
      </span>
    </Link>
  );
}
