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
  review: { label: "Review", className: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  monitor: { label: "Monitor", className: "border-transparent bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  none: { label: "None", className: "border-border bg-background text-muted-foreground" },
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Patient queue</h1>
          <p className="text-sm text-muted-foreground">
            Ranked by severity, then priority points. Red-flag symptoms always sort to the top.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <nav className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
            {FILTERS.map((f) => {
              const isActive = f.value === activeFilter;
              const href = queueHref({ severity: f.value, silent: silentOnly });
              return (
                <Link
                  key={f.label}
                  href={href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                </Link>
              );
            })}
          </nav>
          <Link
            href={queueHref({ severity: activeFilter, silent: !silentOnly })}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              silentOnly
                ? "border-transparent bg-foreground text-background"
                : "border-border bg-muted/50 text-muted-foreground hover:text-foreground"
            )}
          >
            <WifiOff className="size-3.5" /> Stopped logging
          </Link>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-center text-muted-foreground">
          <p className="text-sm font-medium">No patients match this filter</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((p) => {
            const sev = severityKey(p);
            const badge = SEVERITY_BADGE[sev];
            return (
              <li key={p.id}>
                <Link
                  href={`/patients/${p.id}`}
                  className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background p-4 transition-colors hover:bg-muted/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Badge variant="outline" className={badge.className}>
                      {p.redFlag && <AlertTriangle />}
                      {badge.label}
                    </Badge>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {age(p.dob)}y &middot; {p.sex}
                        {p.synthetic ? " · synthetic" : ""}
                      </p>
                      {p.silence && (
                        <Badge
                          variant="outline"
                          className="mt-1 border-border bg-muted text-muted-foreground"
                        >
                          <WifiOff className="size-3" /> Stopped logging · {p.silence.daysSince}d
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-1 items-center justify-end gap-6 text-right">
                    <div className="min-w-0">
                      {p.topFlag ? (
                        <>
                          <p className="truncate text-sm">{p.topFlag.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.flagCount} open flag{p.flagCount === 1 ? "" : "s"}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">No open flags</p>
                      )}
                    </div>
                    <div className="w-16 shrink-0">
                      <p className="text-sm font-semibold">{p.points}</p>
                      <p className="text-xs text-muted-foreground">points</p>
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
