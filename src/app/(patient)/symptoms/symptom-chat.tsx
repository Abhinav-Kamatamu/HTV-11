"use client";

import { useRef, useState } from "react";
import { Loader2, Send, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SYMPTOMS, type SymptomCode } from "@/engine/symptoms";

// Chat UI for T-062. Posts free text straight to `/api/ingest/symptom`: the route already decides
// `redFlag` as the OR of Gemini's guess and the engine's SYMPTOMS red-flag list (CLAUDE.md §4,
// the risk engine decides), so this component only ever renders what the API handed back — it
// never re-derives red-flag status from the raw codes itself. `flags` from the response is
// dropped (never shown to the patient, same convention as upload-card.tsx).

type CodedEntry = { code: string; severity: 1 | 2 | 3 };

type SymptomApiResponse = {
  extraction: {
    status: "ok" | "needs_manual_entry";
    data?: { codes: CodedEntry[]; redFlag: boolean; confidence: number };
  };
  redFlag: boolean;
  message: string | null;
};

type ChatMessage =
  | { id: string; role: "patient"; text: string }
  | {
      id: string;
      role: "system";
      redFlag: boolean;
      message: string | null;
      codes?: CodedEntry[];
      needsManualEntry: boolean;
    };

function symptomLabel(code: string): string {
  return code in SYMPTOMS ? SYMPTOMS[code as SymptomCode].label : code;
}

export function SymptomChat({ patientId }: { patientId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(0);
  const nextId = () => `m${idRef.current++}`;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setMessages((m) => [...m, { id: nextId(), role: "patient", text: trimmed }]);
    setText("");
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/ingest/symptom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, text: trimmed }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong");
      const { extraction, redFlag, message } = body as SymptomApiResponse;
      const needsManualEntry = extraction.status === "needs_manual_entry";
      setMessages((m) => [
        ...m,
        { id: nextId(), role: "system", redFlag, message, codes: extraction.data?.codes, needsManualEntry },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-[40vh] flex-col gap-3 rounded-xl border border-border bg-background p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            For example: &ldquo;I&apos;ve been really thirsty and tired the last few days.&rdquo;
          </p>
        ) : (
          messages.map((m) => <ChatBubble key={m.id} message={m} />)
        )}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="How are you feeling?"
          disabled={sending}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button type="submit" size="sm" disabled={sending || !text.trim()}>
          {sending ? <Loader2 className="animate-spin" /> : <Send />}
          Send
        </Button>
      </form>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.role === "patient") {
    return (
      <div className="max-w-[85%] self-end rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
        {message.text}
      </div>
    );
  }

  if (message.redFlag) {
    return (
      <div className="flex max-w-[85%] items-start gap-2 self-start rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        <span>{message.message}</span>
      </div>
    );
  }

  if (message.needsManualEntry) {
    return (
      <div className="max-w-[85%] self-start rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        Couldn&apos;t quite make sense of that. Try describing it a bit differently.
      </div>
    );
  }

  return (
    <div className="flex max-w-[85%] flex-col gap-1.5 self-start rounded-lg bg-muted/40 px-3 py-2">
      <p className="text-sm text-muted-foreground">Logged.</p>
      {message.codes && message.codes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {message.codes.map((c, i) => (
            <Badge key={i} variant="outline">
              {symptomLabel(c.code)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
