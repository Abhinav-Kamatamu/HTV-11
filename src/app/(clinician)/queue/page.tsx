import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { AlertTriangle, WifiOff } from "lucide-react";
import { getDb } from "@/db/client";
import { listQueue, type QueuePatient } from "@/app/api/_lib/engine-db";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SeverityFilter = "monitor" | "review" | "urgent" | "none";

const FILTERS: { label: string; value: SeverityFilter | null }[] = [
  { label: "All", value: null },
  { label: "Urgent", value: "urgent" },
  { label: "Review", value: "review" },
  { label: "Monitor", value: "monitor" },
  { label: "None", value: "none" },
];

const SEVERITY_BADGE: Record<SeverityFilter, { label: string; className: string }> = {
  urgent: { label: "Urgent", className: "border-transparent bg-destructive/10 text-destructive" },
  review: { label: "Review", className: "border-transparent bg-amber-100 text-amber-900" },
  monitor: { label: "Monitor", className: "border-transparent bg-sky-100 text-sky-900" },
  none: { label: "None", className: "border-border bg-card text-muted-foreground" },
};

function severityKey(p: QueuePatient): SeverityFilter {
  return p.severity ?? "none";
}

function age(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  if (
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())
  ) {
    years -= 1;
  }
  return years;
}

/** Builds a `/queue` href that keeps whichever of `severity`/`silent` isn't being changed. */
function queueHref(params: { severity: SeverityFilter | null; silent: boolean }): string {
  const qs = new URLSearchParams();
  if (params.severity) qs.set("severity", params.severity);
  if (params.silent) qs.set("silent", "1");
  const s = qs.toString();
  return s ? `/queue?${s}` : "/queue";
}

export default function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string; silent?: string }>;
}) {
  return (
    <Suspense fallback={<QueueSkeleton />}>
      <QueueContent searchParams={searchParams} />
    </Suspense>
  );
}

function QueueSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-14 animate-pulse rounded-lg bg-muted/50" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[72px] animate-pulse rounded-xl bg-muted/50" />
        ))}
      </div>
    </div>
  );
}

async function QueueContent({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string; silent?: string }>;
}) {
  await connection();
  const { severity: rawSeverity, silent: rawSilent } = await searchParams;
  const activeFilter = FILTERS.some((f) => f.value === rawSeverity)
    ? (rawSeverity as SeverityFilter | undefined) ?? null
    : null;
  const silentOnly = rawSilent === "1";

  const queue = await listQueue(getDb());
  const bySeverity = activeFilter ? queue.filter((p) => severityKey(p) === activeFilter) : queue;
  const filtered = silentOnly ? bySeverity.filter((p) => p.silence !== null) : bySeverity;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Patient queue</h1>
        <p className="text-base text-muted-foreground">
          Ranked by severity, then priority points. Red-flag symptoms always sort to the top.
        </p>
      </div>

      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {FILTERS.map((f) => {
          const isActive = f.value === activeFilter;
          return (
            <Link
              key={f.label}
              href={queueHref({ severity: f.value, silent: silentOnly })}
              aria-current={isActive ? "true" : undefined}
              className={cn(
                "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted"
              )}
            >
              {f.label}
            </Link>
          );
        })}
        <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />
        <Link
          href={queueHref({ severity: activeFilter, silent: !silentOnly })}
          aria-pressed={silentOnly}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
            silentOnly
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-foreground hover:bg-muted"
          )}
        >
          <WifiOff className="size-4" /> Stopped logging
        </Link>
      </div>

      {filtered.length === 0 ? (
        <div className="flex min-h-[30vh] flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border bg-card text-center text-muted-foreground">
          <p className="text-base font-medium">No patients match this filter</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((p) => {
            const sev = severityKey(p);
            const badge = SEVERITY_BADGE[sev];
            return (
              <li key={p.id}>
                <Link
                  href={`/patients/${p.id}`}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/30 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3 sm:flex-1 sm:justify-start sm:gap-4">
                    <div className="min-w-0">
                      <p className="text-base font-semibold">{p.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {age(p.dob)}y &middot; {p.sex}
                        {p.synthetic ? " · synthetic" : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 sm:order-first sm:items-start">
                      <Badge variant="outline" className={cn("px-2.5 py-1 text-sm", badge.className)}>
                        {p.redFlag && <AlertTriangle />}
                        {badge.label}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex min-w-0 items-start justify-between gap-4 border-t border-border pt-3 sm:flex-1 sm:border-t-0 sm:pt-0">
                    <div className="min-w-0">
                      {p.topFlag ? (
                        <>
                          <p className="text-sm leading-snug sm:line-clamp-2">{p.topFlag.title}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {p.flagCount} open flag{p.flagCount === 1 ? "" : "s"}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">No open flags</p>
                      )}
                      {p.silence && (
                        <Badge variant="outline" className="mt-2 border-border bg-muted px-2.5 py-1 text-sm text-muted-foreground">
                          <WifiOff className="size-3.5" /> Stopped logging · {p.silence.daysSince}d
                        </Badge>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xl font-semibold leading-none">{p.points}</p>
                      <p className="text-sm text-muted-foreground">points</p>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
