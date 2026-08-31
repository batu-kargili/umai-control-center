"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import type { ApplicationRiskLevel, ApplicationUsageItem } from "src/lib/api";
import { CATEGORY_LABELS, RISK_LABELS, formatDateTime, initials, riskBadgeClass } from "./constants";

function TypeLabel({ types }: { types: string[] }) {
  if (types.length === 0) return <span className="text-slate/40">-</span>;
  return <span>{types.join(", ")}</span>;
}

export function ApplicationsTable({ apps }: { apps: ApplicationUsageItem[] }) {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<ApplicationRiskLevel | "all">("all");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return apps.filter((app) => {
      if (riskFilter !== "all" && app.risk_level !== riskFilter) return false;
      if (!query) return true;
      return (
        app.name.toLowerCase().includes(query) ||
        (app.vendor || "").toLowerCase().includes(query) ||
        CATEGORY_LABELS[app.category].toLowerCase().includes(query)
      );
    });
  }, [apps, search, riskFilter]);

  return (
    <div className="rounded-lg border border-secondary/10 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary/10 p-4">
        <p className="text-sm font-semibold text-ink">{filtered.length} items</p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={riskFilter}
            onChange={(event) => setRiskFilter(event.target.value as ApplicationRiskLevel | "all")}
            className="h-9 rounded-lg border border-secondary/15 bg-white px-3 text-xs text-ink focus:border-secondary/40 focus:outline-none"
          >
            <option value="all">All risk levels</option>
            {(Object.keys(RISK_LABELS) as ApplicationRiskLevel[]).map((level) => (
              <option key={level} value={level}>
                {RISK_LABELS[level]}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate/40" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search applications"
              className="h-9 w-56 rounded-lg border border-secondary/15 bg-white pl-8 pr-3 text-xs text-ink placeholder:text-slate/50 focus:border-secondary/40 focus:outline-none"
            />
          </div>
        </div>
      </div>
      <div className="overflow-auto">
        <table className="w-full min-w-[980px] text-left text-xs">
          <thead className="bg-secondary/5 text-[11px] uppercase tracking-[0.14em] text-slate/70">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Risk</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Sessions</th>
              <th className="px-3 py-2">Users</th>
              <th className="px-3 py-2">Sensitive content</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Last used</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-slate" colSpan={8}>
                  No applications found.
                </td>
              </tr>
            ) : (
              filtered.map((app) => (
                <tr
                  key={app.app_id || app.slug}
                  className="border-t border-slate/10 text-slate hover:bg-secondary/5"
                >
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-[10px] font-bold text-secondary">
                        {initials(app.name)}
                      </span>
                      <span className="font-medium text-ink">{app.name}</span>
                      {app.is_training ? (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-700">
                          Training
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${riskBadgeClass(
                        app.risk_level
                      )}`}
                    >
                      {RISK_LABELS[app.risk_level]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-slate/10 px-2 py-0.5 text-[11px] font-semibold text-slate">
                      {CATEGORY_LABELS[app.category] ?? app.category}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-semibold text-ink">{app.sessions}</td>
                  <td className="px-3 py-2">{app.unique_users}</td>
                  <td className="px-3 py-2">{app.sensitive_count}</td>
                  <td className="px-3 py-2">
                    <TypeLabel types={app.types} />
                  </td>
                  <td className="px-3 py-2">{formatDateTime(app.last_used_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
