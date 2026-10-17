"use client";

import { CartesianGrid, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, ComposedChart } from "recharts";
import type { VitalsChartSeries } from "./vitals-charts";

// One vitals metric's chart: the raw daily series plus a dashed vertical marker at each CUSUM
// change-point, labeled with the shift and date (T-046, SPEC §6: "shifted up around Sep 3").

function monthDay(ts: number): string {
  return new Date(ts).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function fullDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

export function VitalsChart({ series }: { series: VitalsChartSeries }) {
  const { points, changePoints, unit, staleDays } = series;
  const rows = points.map((p) => ({ ts: p.ts, value: p.value }));
  const lastTs = points[points.length - 1]?.ts;

  const values = points.map((p) => p.value);
  const yMin = Math.min(...values);
  const yMax = Math.max(...values);
  const pad = (yMax - yMin) * 0.15 || Math.abs(yMax) * 0.1 || 1;
  const [domainMin, domainMax] = [yMin - pad, yMax + pad];

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 20, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="ts" type="number" domain={["dataMin", "dataMax"]}
            tickFormatter={monthDay} stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false}
          />
          <YAxis
            domain={[domainMin, domainMax]} stroke="var(--color-muted-foreground)" fontSize={11}
            tickLine={false} axisLine={false} width={44}
          />
          <Tooltip
            labelFormatter={(ts: number) => fullDate(ts)}
            formatter={(value: number) => [`${value.toFixed(1)} ${unit}`, "Observed"]}
            contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
          />
          {staleDays !== undefined && lastTs !== undefined && (
            <ReferenceLine
              x={lastTs} stroke="var(--color-muted-foreground)" strokeDasharray="4 4"
              // Bottom corner, not top: a CUSUM change-point marker (below) always labels at
              // insideTopLeft, and the last point — where this line sits — is often close enough
              // to overlap an insideTopRight label on narrower chart cards.
              label={{
                value: `stopped logging · ${staleDays}d`,
                position: "insideBottomRight", fill: "var(--color-muted-foreground)", fontSize: 10,
              }}
            />
          )}
          {changePoints.map((cp) => (
            <ReferenceLine
              key={cp.changeTs} x={cp.changeTs} stroke={cp.direction === "up" ? "var(--color-destructive)" : "var(--color-chart-3)"}
              strokeDasharray="4 4"
              label={{
                value: `${cp.direction === "up" ? "+" : "-"}${Math.round(Math.abs(cp.shift))} ${unit} ~${monthDay(cp.changeTs)}`,
                position: "insideTopLeft", fill: "var(--color-muted-foreground)", fontSize: 10,
              }}
            />
          ))}
          <Line type="monotone" dataKey="value" stroke="var(--color-chart-5)" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
