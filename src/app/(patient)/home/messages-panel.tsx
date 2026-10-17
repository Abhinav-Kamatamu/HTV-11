import { Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { listMessages } from "@/app/api/_lib/engine-db";

type Message = Awaited<ReturnType<typeof listMessages>>[number];

function formatTs(ts: Date): string {
  return ts.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function MessagesPanel({ messages }: { messages: Message[] }) {
  if (messages.length === 0) {
    return (
      <div className="flex min-h-[10vh] items-center justify-center rounded-2xl border border-dashed border-border bg-card px-4 py-6 text-center text-base text-muted-foreground">
        No messages from your care team yet.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {messages.map((m) => (
        <li key={m.id} className="flex gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <Mail className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">{formatTs(m.ts)}</p>
              {!m.readAt && (
                <Badge variant="outline" className="border-transparent bg-primary/10 text-primary">
                  New
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-base leading-relaxed">{m.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
