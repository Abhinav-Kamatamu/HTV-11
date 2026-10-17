"use client";

import {
  CartesianGrid, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, ComposedChart,
} from "recharts";
import { senLinePoints, type LabChartSeries } from "./lab-charts";

// One lab metric's chart: solid line through the real readings, a dashed Sen projection continuing it
// toward any threshold band, and a shaded band per guideline cutoff (T-042). A single series per chart,
// so no legend — the card title names it and bands are direct-labeled.

function monthYear(ts: number): string {
  return new Date(ts).toLocaleDateString("en-CA", { month: "short", year: "2-digit" });
}

function fullDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

type ChartRow = { ts: number; observed?: number; projected?: number };

export function LabChart({ series }: { series: LabChartSeries }) {
  const { points, trend, crossing, lineDomain, bands, unit } = series;
  const lastTs = points[points.length - 1]?.ts ?? 0;

  const rows: ChartRow[] = points.map((p) => ({ ts: p.ts, observed: p.value }));
  let projected: { ts: number; value: number }[] = [];
  if (trend && lineDomain) {
    // Sample only the future span so the dashed line starts exactly at the last observed point.
    projected = senLinePoints(trend, [lastTs, lineDomain[1]]);
    for (const p of projected) rows.push({ ts: p.ts, projected: p.value });
    rows.sort((a, b) => a.ts - b.ts);
  }

  // Domain comes from the readings (observed + projected) only — a band far from the data (e.g. an ACR
  // of ~1 against the A3 30 line) must not stretch the axis and flatten the real line to nothing. A band
  // outside the resulting domain is simply not drawn rather than forcing the chart to include it.
  const values = points.map((p) => p.value).concat(projected.map((p) => p.value));
  const yMin = Math.min(...values);
  const yMax = Math.max(...values);
  const pad = (yMax - yMin) * 0.15 || Math.abs(yMax) * 0.1 || 1;
  const [domainMin, domainMax] = [yMin - pad, yMax + pad];
  const visibleBands = bands.filter((b) => b.value >= domainMin && b.value <= domainMax);
  const tickFormat = (v: number) => (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2));

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="ts" type="number" domain={lineDomain ?? ["dataMin", "dataMax"]}
            tickFormatter={monthYear} stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false}
          />
          <YAxis
            domain={[domainMin, domainMax]} tickFormatter={tickFormat} stroke="var(--color-muted-foreground)" fontSize={11}
            tickLine={false} axisLine={false} width={48}
          />
          <Tooltip
            labelFormatter={(ts: number) => fullDate(ts)}
            formatter={(value: number, name: string) => [`${value.toFixed(2)} ${unit}`, name === "projected" ? "Sen projection" : "Observed"]}
            contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
          />
          {visibleBands.map((b) => (
            <ReferenceLine
              key={b.label} y={b.value} stroke="var(--color-chart-3)" strokeDasharray="4 4"
              label={{ value: `${b.label} ${b.value}`, position: "insideTopLeft", fill: "var(--color-muted-foreground)", fontSize: 10 }}
            />
          ))}
          {crossing && (
            <ReferenceArea
              x1={lastTs + (crossing.fastDays ?? crossing.days) * 86_400_000}
              x2={lastTs + (crossing.slowDays ?? crossing.days) * 86_400_000}
              fill="var(--color-chart-4)" fillOpacity={0.12}
            />
          )}
          <Line type="monotone" dataKey="observed" stroke="var(--color-chart-5)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
          {trend && (
            <Line type="monotone" dataKey="projected" stroke="var(--color-chart-5)" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
