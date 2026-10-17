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
      <div className="flex min-h-[10vh] items-center justify-center rounded-xl border border-dashed border-border text-center text-sm text-muted-foreground">
        No messages from your care team yet.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {messages.map((m) => (
        <li key={m.id} className="flex gap-3 rounded-xl border border-border bg-background p-4">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Mail className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">{formatTs(m.ts)}</p>
              {!m.readAt && (
                <Badge variant="outline" className="border-transparent bg-blue-500/15 text-blue-700 dark:text-blue-400">
                  New
                </Badge>
              )}
            </div>
            <p className="text-sm">{m.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
