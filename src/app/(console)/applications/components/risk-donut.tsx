"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { ApplicationRiskLevel } from "src/lib/api";
import { RISK_COLORS, RISK_LABELS, RISK_ORDER } from "./constants";

export function RiskDonut({
  distribution,
}: {
  distribution: Record<ApplicationRiskLevel, number>;
}) {
  const total = RISK_ORDER.reduce((sum, key) => sum + (distribution[key] || 0), 0);
  const data = RISK_ORDER.map((key) => ({
    key,
    name: RISK_LABELS[key],
    value: distribution[key] || 0,
  }));
  const hasData = total > 0;
  const pieData = hasData ? data : [{ key: "none" as const, name: "None", value: 1 }];

  return (
    <div className="rounded-lg border border-secondary/10 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-ink">Application by risk</h3>
      <div className="mt-3 flex items-center gap-6">
        <div className="relative h-[180px] w-[180px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                innerRadius={62}
                outerRadius={84}
                paddingAngle={hasData ? 2 : 0}
                stroke="none"
                isAnimationActive={false}
              >
                {pieData.map((entry) => (
                  <Cell
                    key={entry.key}
                    fill={hasData ? RISK_COLORS[entry.key as ApplicationRiskLevel] : "#e2e8f0"}
                  />
                ))}
              </Pie>
              {hasData ? <Tooltip /> : null}
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-ink">{total}</span>
            <span className="text-[10px] uppercase tracking-wide text-slate/60">Sessions</span>
          </div>
        </div>
        <div className="flex-1 space-y-2">
          {RISK_ORDER.map((key) => {
            const value = distribution[key] || 0;
            const percent = total ? Math.round((value / total) * 100) : 0;
            return (
              <div key={key} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-slate">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: RISK_COLORS[key] }}
                  />
                  {RISK_LABELS[key]}
                </span>
                <span className="font-semibold text-ink">
                  {value} <span className="text-slate/60">({percent}%)</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
