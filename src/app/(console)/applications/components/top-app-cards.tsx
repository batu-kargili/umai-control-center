"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";

import type { ApplicationUsageItem } from "src/lib/api";
import { initials } from "./constants";

function ChangeBadge({ pct }: { pct?: number | null }) {
  if (pct == null) {
    return <span className="text-[11px] text-slate/50">New</span>;
  }
  const up = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
        up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
      }`}
    >
      {up ? "+" : ""}
      {pct.toFixed(1)}% {up ? "↑" : "↓"}
    </span>
  );
}

export function TopAppCards({ apps }: { apps: ApplicationUsageItem[] }) {
  const top = apps.slice(0, 4);

  return (
    <div className="rounded-lg border border-secondary/10 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-ink">Top used applications by sessions</h3>
      <div className="mt-4 grid grid-cols-2 gap-4">
        {top.length === 0 ? (
          <p className="col-span-2 text-sm text-slate">No usage yet.</p>
        ) : (
          top.map((app) => (
            <div key={app.slug} className="rounded-lg border border-secondary/10 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-2xl font-bold text-ink">{app.sessions}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-[9px] font-bold text-secondary">
                      {initials(app.name)}
                    </span>
                    <span className="truncate">{app.name}</span>
                  </p>
                </div>
                <ChangeBadge pct={app.pct_change} />
              </div>
              <div className="mt-2 h-9 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={app.trend} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                    <Line
                      type="monotone"
                      dataKey="sessions"
                      stroke="#0F62FE"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
