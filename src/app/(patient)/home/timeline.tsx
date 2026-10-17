import { Activity, AlertTriangle, FlaskConical, MessageCircle, Utensils } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { metricLabel, type TimelineItem } from "./timeline-data";

function formatTs(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function Row({ icon, children, ts }: { icon: React.ReactNode; children: React.ReactNode; ts: number }) {
  return (
    <li className="flex gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base text-muted-foreground">{formatTs(ts)}</p>
        {children}
      </div>
    </li>
  );
}

function MealRow({ item }: { item: TimelineItem & { kind: "meal" } }) {
  const name = (item.items as { name?: string }[]).map((i) => i.name).filter(Boolean).join(", ") || "Meal";
  const macros = [
    item.kcal !== null ? `${Math.round(item.kcal)} kcal` : null,
    item.carbsG !== null ? `${Math.round(item.carbsG)}g carbs` : null,
    item.proteinG !== null ? `${Math.round(item.proteinG)}g protein` : null,
    item.fatG !== null ? `${Math.round(item.fatG)}g fat` : null,
  ].filter(Boolean);
  return (
    <Row icon={<Utensils className="size-4" />} ts={item.ts}>
      <p className="text-base font-medium">{name}</p>
      {macros.length > 0 && <p className="text-base text-muted-foreground">{macros.join(" · ")}</p>}
      {item.confidence < 0.8 && (
        <Badge variant="outline" className="mt-1 border-border bg-muted text-muted-foreground">
          Estimated from photo, review the details
        </Badge>
      )}
    </Row>
  );
}

function SymptomRow({ item }: { item: TimelineItem & { kind: "symptom" } }) {
  return (
    <Row icon={<MessageCircle className="size-4" />} ts={item.ts}>
      <p className="text-base font-medium">&ldquo;{item.text}&rdquo;</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {item.redFlag && (
          <Badge variant="outline" className="border-transparent bg-destructive/10 text-destructive">
            <AlertTriangle /> Seek care now
          </Badge>
        )}
        {item.labels.map((l) => (
          <Badge key={l} variant="outline" className="border-border bg-muted text-muted-foreground">
            {l}
          </Badge>
        ))}
      </div>
    </Row>
  );
}

function ValuesRow({ item, icon }: { item: TimelineItem & { kind: "lab" | "reading" }; icon: React.ReactNode }) {
  return (
    <Row icon={icon} ts={item.ts}>
      <p className="text-base font-medium">{item.kind === "lab" ? "Lab report" : "Device reading"}</p>
      <p className="text-base text-muted-foreground">
        {item.values.map((v) => `${metricLabel(v.metric)} ${v.value} ${v.unit}`).join(" · ")}
      </p>
    </Row>
  );
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-[20vh] flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border bg-card px-4 py-8 text-center text-muted-foreground">
        <p className="text-base font-medium">Nothing logged yet</p>
        <p className="text-sm">Meal photos, device readings, lab reports and symptom chats will show up here.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => {
        switch (item.kind) {
          case "meal":
            return <MealRow key={item.id} item={item} />;
          case "symptom":
            return <SymptomRow key={item.id} item={item} />;
          case "lab":
            return <ValuesRow key={item.id} item={item} icon={<FlaskConical className="size-4" />} />;
          case "reading":
            return <ValuesRow key={item.id} item={item} icon={<Activity className="size-4" />} />;
        }
      })}
    </ul>
  );
}
