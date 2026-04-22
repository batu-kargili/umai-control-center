"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Gauge, LineChart as LineChartIcon, ShieldAlert } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  fetchAlerts,
  fetchAuditEvents,
  type AlertItem,
  type AuditEventItem,
} from "src/lib/api";

type ProjectMonitoringSectionProps = {
  tenantId: string | null;
  envId: string;
  projectId: string;
  variant?: "page" | "section";
};

const numberFormatter = new Intl.NumberFormat("en-US");
const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
});
const SECONDARY_HEX = "#0F62FE";
const SECONDARY_SOFT_HEX = "#D6E4FF";
const dayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const categoryTones = [
  "bg-secondary",
  "bg-secondary/85",
  "bg-secondary/70",
  "bg-secondary/55",
  "bg-secondary/40",
  "bg-zinc-300",
];
const EMPTY_VALUE_TOKENS = new Set([
  "",
  "-",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "unknown",
]);
const ALERT_LIMIT = 500;
const AUDIT_EVENT_LIMIT = 500;
const TREND_DAYS = 7;

function normalizeText(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return EMPTY_VALUE_TOKENS.has(trimmed.toLowerCase()) ? null : trimmed;
}

function shortId(value?: string | null): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (normalized.length <= 14) return normalized;
  return `${normalized.slice(0, 8)}...${normalized.slice(-4)}`;
}

function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function recentAlertTitle(alert: AlertItem): string {
  const requestLabel = shortId(alert.request_id);

  return (
    normalizeText(alert.message) ??
    normalizeText(alert.policy) ??
    normalizeText(alert.matched_rule) ??
    (requestLabel ? `Request ${requestLabel}` : null) ??
    `${alert.decision} alert`
  );
}

function recentAlertMeta(alert: AlertItem): string {
  const parts = [
    normalizeText(alert.category),
    normalizeText(alert.severity),
    normalizeText(alert.phase),
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join(" - ") : `${alert.decision} detection`;
}

export function ProjectMonitoringSection({
  tenantId,
  envId,
  projectId,
  variant = "page",
}: ProjectMonitoringSectionProps) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEventItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;

    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [recentAlerts, recentAuditEvents] = await Promise.all([
          fetchAlerts(tenantId, envId, projectId, ALERT_LIMIT),
          fetchAuditEvents(tenantId, {
            environment_id: envId,
            project_id: projectId,
            limit: AUDIT_EVENT_LIMIT,
          }),
        ]);

        if (!active) return;
        setAlerts(recentAlerts);
        setAuditEvents(recentAuditEvents);
      } catch (error) {
        console.error(error);
        if (!active) return;
        setAlerts([]);
        setAuditEvents([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [tenantId, envId, projectId]);

  const summary = useMemo(() => {
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setHours(0, 0, 0, 0);
    windowStart.setDate(windowStart.getDate() - (TREND_DAYS - 1));

    const decisionCounts = { BLOCK: 0, FLAG: 0 };
    const categoryCounts: Record<string, number> = {};
    const requestIds = new Set<string>();
    const alertedRequestIds = new Set<string>();
    const usageByDay = new Map<string, Set<string>>();
    const alertsByDay = new Map<string, Set<string>>();
    let totalThreats = 0;

    const trendSeries = Array.from({ length: TREND_DAYS }, (_, index) => {
      const date = new Date(windowStart);
      date.setDate(windowStart.getDate() + index);
      const key = dayKey(date);

      usageByDay.set(key, new Set<string>());
      alertsByDay.set(key, new Set<string>());

      return {
        key,
        label: dayFormatter.format(date),
        requests: 0,
        alerts: 0,
      };
    });

    alerts.forEach((alert) => {
      const createdAt = new Date(alert.created_at);
      if (Number.isNaN(createdAt.getTime()) || createdAt < windowStart) {
        return;
      }

      totalThreats += 1;
      decisionCounts[alert.decision] += 1;

      const category = normalizeText(alert.category) ?? normalizeText(alert.policy) ?? "General";
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;

      const requestKey = normalizeText(alert.request_id) ?? alert.id;
      alertedRequestIds.add(requestKey);

      const dayAlerts = alertsByDay.get(dayKey(createdAt));
      if (dayAlerts) {
        dayAlerts.add(requestKey);
      }
    });

    auditEvents.forEach((event) => {
      const createdAt = new Date(event.created_at);
      if (Number.isNaN(createdAt.getTime()) || createdAt < windowStart) {
        return;
      }

      const requestKey = normalizeText(event.request_id) ?? event.id;
      requestIds.add(requestKey);

      const dayRequests = usageByDay.get(dayKey(createdAt));
      if (dayRequests) {
        dayRequests.add(requestKey);
      }
    });

    const totalRequests = requestIds.size;
    const detectionRate = totalRequests
      ? Math.min(1, alertedRequestIds.size / totalRequests)
      : 0;

    const sortedCategories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
    const primaryCategories = sortedCategories.slice(0, 5).map(([name, count]) => ({
      name,
      count,
    }));
    const remaining = sortedCategories.slice(5);
    const remainingCount = remaining.reduce((sum, [, count]) => sum + count, 0);
    if (remainingCount > 0) {
      primaryCategories.push({ name: "Other", count: remainingCount });
    }

    const maxCategoryCount = Math.max(1, ...primaryCategories.map((item) => item.count));
    const populatedTrendSeries = trendSeries.map((item) => ({
      ...item,
      requests: usageByDay.get(item.key)?.size ?? 0,
      alerts: alertsByDay.get(item.key)?.size ?? 0,
    }));
    const hasTrendData = populatedTrendSeries.some(
      (item) => item.requests > 0 || item.alerts > 0
    );

    return {
      decisionCounts,
      totalThreats,
      totalRequests,
      detectionRate,
      categories: primaryCategories,
      maxCategoryCount,
      trendSeries: populatedTrendSeries,
      hasTrendData,
    };
  }, [alerts, auditEvents]);

  const projectName = projectId.replace(/-/g, " ");
  const totalDetected = loading ? "-" : numberFormatter.format(summary.totalThreats);
  const totalRequests = loading ? "-" : numberFormatter.format(summary.totalRequests);
  const detectionPercent = loading ? "-" : percentFormatter.format(summary.detectionRate);
  const blockShare = summary.totalThreats
    ? summary.decisionCounts.BLOCK / summary.totalThreats
    : 0;
  const flagShare = summary.totalThreats
    ? summary.decisionCounts.FLAG / summary.totalThreats
    : 0;
  const detectionDegrees = Math.round((loading ? 0 : summary.detectionRate) * 360);

  return (
    <section className="space-y-8">
      <header>
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-secondary/70">Insights</p>
        <h2
          className={
            variant === "page"
              ? "font-display text-4xl font-bold text-ink tracking-tight"
              : "font-display text-2xl font-bold text-ink tracking-tight"
          }
        >
          Monitoring
        </h2>
        <p className="mt-1 text-sm text-slate">Real-time summary for {projectName}.</p>
      </header>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-secondary/10 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/50">
                Number of threats detected
              </p>
              <p className="mt-2 text-3xl font-bold text-ink">{totalDetected}</p>
            </div>
            <div className="rounded-xl bg-red-50 p-2 text-red-600">
              <ShieldAlert className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate">
              <span>Blocked</span>
              <span>{loading ? "-" : summary.decisionCounts.BLOCK}</span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-red-500"
                style={{ width: `${Math.round(blockShare * 100)}%` }}
              />
              <div
                className="h-full bg-amber-400"
                style={{ width: `${Math.round(flagShare * 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate">
              <span>{loading ? "-" : summary.decisionCounts.BLOCK} blocked</span>
              <span>{loading ? "-" : summary.decisionCounts.FLAG} flagged</span>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate">Threat detections observed over the last 7 days</p>
        </div>

        <div className="rounded-3xl border border-slate/10 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/50">
                Usage trend
              </p>
              <p className="mt-2 text-3xl font-bold text-ink">{totalRequests}</p>
            </div>
            <div className="rounded-xl bg-secondary/10 p-2 text-secondary">
              <Activity className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 h-32">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-slate">
                Loading usage...
              </div>
            ) : !summary.hasTrendData ? (
              <div className="flex h-full items-center justify-center text-sm text-slate">
                No request activity yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsLineChart
                  data={summary.trendSeries}
                  margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                >
                  <CartesianGrid stroke={SECONDARY_SOFT_HEX} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#64748b", fontSize: 11 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#64748b", fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      numberFormatter.format(Number(value)),
                      name === "requests" ? "Requests" : "Alerted requests",
                    ]}
                    labelStyle={{ color: "#111827", fontWeight: 600 }}
                    contentStyle={{
                      borderRadius: 16,
                      border: "1px solid rgba(15, 98, 254, 0.18)",
                      boxShadow: "0 12px 32px rgba(15, 98, 254, 0.12)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="requests"
                    stroke={SECONDARY_HEX}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, fill: SECONDARY_HEX, stroke: "#ffffff" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="alerts"
                    stroke="#dc2626"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    activeDot={{ r: 4, fill: "#dc2626", stroke: "#ffffff" }}
                  />
                </RechartsLineChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-3 flex items-center gap-4 text-[11px] text-slate">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-secondary" />
              Requests
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              Alerted requests
            </span>
          </div>
          <p className="mt-2 text-xs text-slate">Unique requests and alerted requests over the last 7 days</p>
        </div>

        <div className="rounded-3xl border border-secondary/10 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/50">
                Total detection rate
              </p>
              <p className="mt-2 text-3xl font-bold text-ink">{detectionPercent}</p>
            </div>
            <div className="rounded-xl bg-secondary/10 p-2 text-secondary">
              <Gauge className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full"
              style={{
                background: `conic-gradient(${SECONDARY_HEX} ${detectionDegrees}deg, #e2e8f0 0deg)`,
              }}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-xs font-semibold text-ink">
                {loading ? "-" : percentFormatter.format(summary.detectionRate)}
              </div>
            </div>
            <div className="text-xs text-slate">
              <p className="font-semibold text-ink">Alerts per request</p>
              <p className="mt-1">Alerted share of observed requests over the last 7 days.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <div className="rounded-3xl border border-secondary/10 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/50">
                Threat types flagged
              </p>
              <h3 className="mt-2 text-lg font-semibold text-ink">Top categories</h3>
            </div>
            <div className="rounded-xl bg-secondary/10 p-2 text-secondary">
              <LineChartIcon className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-6 space-y-4">
            {loading ? (
              <p className="text-sm text-slate">Loading threat types...</p>
            ) : summary.categories.length === 0 ? (
              <p className="text-sm text-slate">No threat categories yet.</p>
            ) : (
              summary.categories.map((item, index) => {
                const percent = summary.totalThreats
                  ? (item.count / summary.totalThreats) * 100
                  : 0;
                return (
                  <div key={item.name} className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate">
                      <span className="font-semibold text-ink">{item.name}</span>
                      <span>
                        {numberFormatter.format(item.count)} - {percent.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary/10">
                      <div
                        className={`h-full rounded-full ${categoryTones[index % categoryTones.length]}`}
                        style={{ width: `${(item.count / summary.maxCategoryCount) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-secondary/10 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold text-ink">Recent alerts</h3>
          </div>
          {loading ? (
            <div className="text-sm text-slate">Loading alerts...</div>
          ) : alerts.length === 0 ? (
            <div className="text-sm text-slate">No alerts detected yet.</div>
          ) : (
            <div className="space-y-3">
              {alerts.slice(0, 8).map((alert) => (
                <div key={alert.id} className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {recentAlertTitle(alert)}
                    </p>
                    <p className="truncate text-[11px] text-slate">{recentAlertMeta(alert)}</p>
                  </div>
                  <span className="shrink-0 text-[10px] text-secondary/70">
                    {new Date(alert.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
