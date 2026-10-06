"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useConsole } from "src/app/(console)/console-context";
import {
  fetchAlerts,
  fetchAuditEvents,
  fetchEnvironments,
  fetchGuardrails,
  fetchPolicies,
  fetchProjects,
  type AlertItem,
  type AuditEventItem,
} from "src/lib/api";

const numberFormatter = new Intl.NumberFormat("en-US");
const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
});
const dayFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// Alerts/audit endpoint'lerinin sayacı yok; en yeni N kayıt çekilir ve 7 günlük
// pencere bunlardan hesaplanır. Tavan dolarsa grafik altına not düşülür.
const ALERT_LIMIT = 500;
const AUDIT_EVENT_LIMIT = 500;
const TREND_DAYS = 7;
const RECENT_ALERT_ROWS = 10;

const BLUE = "#0f62fe";
const RED = "#da1e28";
const GRID = "#e5e7eb";
const TICK = "#6b7280";

const EMPTY_VALUE_TOKENS = new Set(["", "-", "n/a", "na", "none", "null", "undefined", "unknown"]);

function normalizeText(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return EMPTY_VALUE_TOKENS.has(trimmed.toLowerCase()) ? null : trimmed;
}

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function alertDescription(alert: AlertItem): string {
  return (
    normalizeText(alert.message) ??
    normalizeText(alert.matched_rule) ??
    normalizeText(alert.request_id) ??
    "—"
  );
}

function decisionTagClass(decision: AlertItem["decision"]) {
  return decision === "BLOCK"
    ? "bg-red-50 text-red-700 ring-red-600/20"
    : "bg-amber-50 text-amber-800 ring-amber-600/20";
}

function severityClass(severity: AlertItem["severity"]) {
  if (severity === "CRITICAL" || severity === "HIGH") return "text-red-700";
  if (severity === "MEDIUM") return "text-amber-700";
  return "text-gray-600";
}

export default function ProjectDetailPage() {
  const { tenantId } = useConsole();
  const params = useParams() as { envId: string; projectId: string };
  const { envId, projectId } = params;

  const [projectName, setProjectName] = useState<string | null>(null);
  const [envName, setEnvName] = useState<string | null>(null);
  const [guardrailsCount, setGuardrailsCount] = useState(0);
  const [policiesCount, setPoliciesCount] = useState(0);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      let partial = false;
      const markPartial = <T,>(fallback: T) => (reason: unknown) => {
        console.error(reason);
        partial = true;
        return fallback;
      };

      const [projects, environments, guardrails, policies, alertList, auditList] =
        await Promise.all([
          fetchProjects(tenantId, envId).catch(markPartial([])),
          fetchEnvironments(tenantId).catch(markPartial([])),
          fetchGuardrails(tenantId, envId, projectId).catch(markPartial([])),
          fetchPolicies(tenantId, envId, projectId).catch(markPartial([])),
          fetchAlerts(tenantId, envId, projectId, ALERT_LIMIT).catch(markPartial([])),
          fetchAuditEvents(tenantId, {
            environment_id: envId,
            project_id: projectId,
            limit: AUDIT_EVENT_LIMIT,
          }).catch(markPartial([])),
        ]);

      if (!active) return;
      setProjectName(projects.find((p) => p.project_id === projectId)?.name ?? null);
      setEnvName(environments.find((e) => e.environment_id === envId)?.name ?? null);
      setGuardrailsCount(guardrails.length);
      setPoliciesCount(policies.length);
      setAlerts(alertList);
      setAuditEvents(auditList);
      setError(partial ? "Some project data could not be loaded." : null);
      setLoading(false);
    };

    void load();
    return () => {
      active = false;
    };
  }, [tenantId, envId, projectId]);

  const summary = useMemo(() => {
    const windowStart = new Date();
    windowStart.setHours(0, 0, 0, 0);
    windowStart.setDate(windowStart.getDate() - (TREND_DAYS - 1));

    const decisionCounts = { BLOCK: 0, FLAG: 0 };
    const categoryCounts: Record<string, number> = {};
    const requestIds = new Set<string>();
    const alertedRequestIds = new Set<string>();
    const requestsByDay = new Map<string, Set<string>>();
    const alertsByDay = new Map<string, Set<string>>();

    const trend = Array.from({ length: TREND_DAYS }, (_, index) => {
      const date = new Date(windowStart);
      date.setDate(windowStart.getDate() + index);
      const key = dayKey(date);
      requestsByDay.set(key, new Set());
      alertsByDay.set(key, new Set());
      return { key, label: dayFormatter.format(date), requests: 0, alerts: 0 };
    });

    let totalAlerts = 0;
    alerts.forEach((alert) => {
      const createdAt = new Date(alert.created_at);
      if (Number.isNaN(createdAt.getTime()) || createdAt < windowStart) return;
      totalAlerts += 1;
      decisionCounts[alert.decision] += 1;
      const category = normalizeText(alert.category) ?? normalizeText(alert.policy) ?? "General";
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      const requestKey = normalizeText(alert.request_id) ?? alert.id;
      alertedRequestIds.add(requestKey);
      alertsByDay.get(dayKey(createdAt))?.add(requestKey);
    });

    auditEvents.forEach((event) => {
      const createdAt = new Date(event.created_at);
      if (Number.isNaN(createdAt.getTime()) || createdAt < windowStart) return;
      const requestKey = normalizeText(event.request_id) ?? event.id;
      requestIds.add(requestKey);
      requestsByDay.get(dayKey(createdAt))?.add(requestKey);
    });

    const totalRequests = requestIds.size;
    const alertRate = totalRequests ? Math.min(1, alertedRequestIds.size / totalRequests) : 0;

    const sorted = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
    const categories = sorted.slice(0, 6).map(([name, count]) => ({ name, count }));
    const rest = sorted.slice(6).reduce((sum, [, count]) => sum + count, 0);
    if (rest > 0) categories.push({ name: "Other", count: rest });
    const maxCategoryCount = Math.max(1, ...categories.map((item) => item.count));

    const series = trend.map((item) => ({
      ...item,
      requests: requestsByDay.get(item.key)?.size ?? 0,
      alerts: alertsByDay.get(item.key)?.size ?? 0,
    }));

    return {
      decisionCounts,
      totalAlerts,
      totalRequests,
      alertRate,
      categories,
      maxCategoryCount,
      series,
      hasTrendData: series.some((item) => item.requests > 0 || item.alerts > 0),
      capped: alerts.length >= ALERT_LIMIT || auditEvents.length >= AUDIT_EVENT_LIMIT,
    };
  }, [alerts, auditEvents]);

  const base = `/environments/${envId}/projects/${projectId}`;
  const stats = [
    { label: "Guardrails", value: numberFormatter.format(guardrailsCount), href: `${base}/guardrails` },
    { label: "Policies", value: numberFormatter.format(policiesCount), href: `${base}/policies` },
    { label: "Requests (7d)", value: numberFormatter.format(summary.totalRequests) },
    {
      label: "Alerts (7d)",
      value: numberFormatter.format(summary.totalAlerts),
      detail: `${numberFormatter.format(summary.decisionCounts.BLOCK)} blocked · ${numberFormatter.format(summary.decisionCounts.FLAG)} flagged`,
      href: `${base}/alerts`,
    },
    {
      label: "Alert rate (7d)",
      value: percentFormatter.format(summary.alertRate),
      detail: "Alerted requests / requests",
    },
  ];

  const subline = [
    projectName && projectName !== projectId && `ID: ${projectId}`,
    `Environment: ${envName ?? envId}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-8">
      <header className="border-b border-gray-200 pb-5">
        <p className="text-xs font-medium text-gray-500">Project</p>
        <h1 className="mt-0.5 text-2xl font-semibold text-gray-900">{projectName ?? projectId}</h1>
        <p className="mt-1 text-sm text-gray-500">{subline}</p>
        {error && <p className="mt-2 text-sm text-amber-700">{error}</p>}
      </header>

      <section className="grid grid-cols-1 divide-y divide-gray-200 rounded border border-gray-200 bg-white sm:grid-cols-5 sm:divide-x sm:divide-y-0">
        {stats.map((item) => {
          const body = (
            <>
              <p className="text-xs font-medium text-gray-500">{item.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
                {loading ? "—" : item.value}
              </p>
              {item.detail && (
                <p className="mt-1 text-xs text-gray-500">{loading ? "" : item.detail}</p>
              )}
            </>
          );
          return item.href ? (
            <Link key={item.label} href={item.href} className="px-5 py-4 transition-colors hover:bg-gray-50">
              {body}
            </Link>
          ) : (
            <div key={item.label} className="px-5 py-4">
              {body}
            </div>
          );
        })}
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-900">Activity (last 7 days)</h2>
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded border border-gray-200 bg-white p-5">
            <p className="text-sm font-medium text-gray-900">Requests and alerted requests</p>
            <p className="text-xs text-gray-500">Unique requests per day</p>
            <div className="mt-4 h-52">
              {loading ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-400">
                  Loading…
                </div>
              ) : !summary.hasTrendData ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">
                  No request activity in the last 7 days.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={summary.series} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={{ stroke: GRID }}
                      tick={{ fill: TICK, fontSize: 11 }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: TICK, fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(value, name) => [
                        numberFormatter.format(Number(value)),
                        name === "requests" ? "Requests" : "Alerted requests",
                      ]}
                      labelStyle={{ color: "#111827", fontWeight: 600, fontSize: 12 }}
                      itemStyle={{ fontSize: 12 }}
                      contentStyle={{ borderRadius: 4, border: `1px solid ${GRID}`, boxShadow: "none" }}
                      cursor={{ stroke: GRID }}
                    />
                    <Line type="monotone" dataKey="requests" stroke={BLUE} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                    <Line type="monotone" dataKey="alerts" stroke={RED} strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="mt-3 flex items-center gap-5 text-xs text-gray-600">
              <span className="inline-flex items-center gap-2">
                <span className="h-0.5 w-4" style={{ background: BLUE }} />
                Requests
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-0.5 w-4 border-t border-dashed" style={{ borderColor: RED }} />
                Alerted requests
              </span>
            </div>
          </div>

          <div className="rounded border border-gray-200 bg-white p-5">
            <p className="text-sm font-medium text-gray-900">Alerts by category</p>
            <p className="text-xs text-gray-500">Share of alerts in the window</p>
            <div className="mt-4 space-y-3">
              {loading ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : summary.categories.length === 0 ? (
                <p className="text-sm text-gray-500">No alerts in the last 7 days.</p>
              ) : (
                summary.categories.map((item) => (
                  <div key={item.name}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="truncate text-gray-900">{item.name}</span>
                      <span className="ml-3 shrink-0 tabular-nums text-gray-500">
                        {numberFormatter.format(item.count)} ·{" "}
                        {percentFormatter.format(summary.totalAlerts ? item.count / summary.totalAlerts : 0)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 bg-gray-100">
                      <div
                        className="h-full bg-secondary"
                        style={{ width: `${(item.count / summary.maxCategoryCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        {!loading && summary.capped && (
          <p className="mt-2 text-xs text-gray-500">
            Based on the most recent {numberFormatter.format(AUDIT_EVENT_LIMIT)} audit events and{" "}
            {numberFormatter.format(ALERT_LIMIT)} alerts.
          </p>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-gray-900">Recent alerts</h2>
          <Link href={`${base}/alerts`} className="text-sm font-medium text-secondary hover:underline">
            View all alerts
          </Link>
        </div>
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Time</th>
                <th className="px-4 py-2.5 font-medium">Decision</th>
                <th className="px-4 py-2.5 font-medium">Severity</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">Policy</th>
                <th className="px-4 py-2.5 font-medium">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    Loading alerts…
                  </td>
                </tr>
              ) : alerts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No alerts recorded for this project.
                  </td>
                </tr>
              ) : (
                alerts.slice(0, RECENT_ALERT_ROWS).map((alert) => (
                  <tr key={alert.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-gray-600">
                      {timeFormatter.format(new Date(alert.created_at))}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${decisionTagClass(alert.decision)}`}
                      >
                        {alert.decision}
                      </span>
                    </td>
                    <td className={`px-4 py-2.5 text-xs font-medium ${severityClass(alert.severity)}`}>
                      {alert.severity}
                    </td>
                    <td className="px-4 py-2.5 text-gray-900">{normalizeText(alert.category) ?? "—"}</td>
                    <td
                      className="max-w-[260px] truncate px-4 py-2.5 text-gray-900"
                      title={normalizeText(alert.policy) ?? undefined}
                    >
                      {normalizeText(alert.policy) ?? "—"}
                    </td>
                    <td className="max-w-[360px] truncate px-4 py-2.5 text-gray-600" title={alertDescription(alert)}>
                      {alertDescription(alert)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
