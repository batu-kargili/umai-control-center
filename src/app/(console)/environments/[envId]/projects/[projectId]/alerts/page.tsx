"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Filter, PenLine, Search, ShieldAlert, X } from "lucide-react";
import { fetchAlerts, AlertItem } from "src/lib/api";
import { useConsole } from "src/app/(console)/console-context";

const severityTone: Record<AlertItem["severity"], string> = {
  CRITICAL: "bg-danger",
  HIGH: "bg-danger",
  MEDIUM: "bg-amber-400",
  LOW: "bg-emerald-500",
};

const decisionTone: Record<AlertItem["decision"], string> = {
  BLOCK: "bg-danger/10 text-danger",
  FLAG: "bg-amber-100 text-amber-700",
};

export default function AlertsPage() {
  const { envId, projectId } = useParams() as { envId: string; projectId: string };
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AlertItem["decision"] | "ALL">("ALL");
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);
  const { tenantId } = useConsole();

  useEffect(() => {
    if (!envId || !projectId || !tenantId) return;
    setLoading(true);
    fetchAlerts(tenantId, envId, projectId)
      .then((data) => {
        setAlerts(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        console.error(err);
        setLoading(false);
      });
  }, [envId, projectId, tenantId]);

  const filteredAlerts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return alerts.filter((alert) => {
      if (statusFilter !== "ALL" && alert.decision !== statusFilter) {
        return false;
      }
      if (!normalized) return true;
      return (
        alert.message.toLowerCase().includes(normalized) ||
        alert.id.toLowerCase().includes(normalized) ||
        alert.request_id.toLowerCase().includes(normalized) ||
        alert.policy.toLowerCase().includes(normalized)
      );
    });
  }, [alerts, query, statusFilter]);

  return (
    <div className="space-y-8 fade-up">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
            Alerts
          </p>
          <h2 className="font-display text-4xl font-bold text-ink tracking-tight">
            Alert Console
          </h2>
          <p className="mt-2 text-sm text-slate">
            Flagged and blocked messages detected for {projectId}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {(["ALL", "BLOCK", "FLAG"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setStatusFilter(item)}
              className={`rounded-full border px-4 py-2 font-semibold transition ${
                statusFilter === item
                  ? "border-ink/10 bg-ink text-white"
                  : "border-slate/10 bg-white text-slate"
              }`}
            >
              {item === "ALL" ? "All Alerts" : item === "BLOCK" ? "Blocked" : "Flagged"}
            </button>
          ))}
        </div>
      </header>

      <section className="rounded-3xl border border-slate/10 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
              Recent Alerts
            </span>
            <div className="flex items-center gap-2 rounded-full bg-danger/10 px-3 py-1 text-[11px] font-semibold text-danger">
              <AlertTriangle className="h-3.5 w-3.5" />
              {filteredAlerts.length} detections
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate/50" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search id, message, policy"
                className="h-10 w-full min-w-[240px] rounded-full border border-slate/10 bg-slate/5 px-10 text-xs text-ink placeholder-slate/50 focus:outline-none focus:ring-2 focus:ring-ink/5"
              />
            </div>
            <button
              type="button"
              className="flex h-10 items-center gap-2 rounded-full border border-slate/10 bg-white px-4 text-xs font-semibold text-slate"
            >
              <Filter className="h-4 w-4" />
              Metadata
            </button>
            <button
              type="button"
              className="flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-xs font-semibold text-white"
            >
              <ShieldAlert className="h-4 w-4 text-white" />
              Evaluate
            </button>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate/10">
          <div className="grid grid-cols-[minmax(220px,2fr)_1.1fr_1.2fr_0.8fr_0.7fr_0.9fr_56px] items-center gap-3 bg-slate/5 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate/50">
            <span>Issue</span>
            <span>Policy</span>
            <span>Guardrail</span>
            <span>Decision</span>
            <span>Latency</span>
            <span>Created</span>
            <span />
          </div>

          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-slate/60">
              Loading alerts...
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate/60">
              No alerts matched your filters.
            </div>
          ) : (
            <div className="divide-y divide-slate/10">
              {filteredAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="grid grid-cols-[minmax(220px,2fr)_1.1fr_1.2fr_0.8fr_0.7fr_0.9fr_56px] items-center gap-3 px-4 py-4 text-xs text-slate transition hover:bg-slate/5"
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-1 h-2 w-2 rounded-full ${severityTone[alert.severity]}`} />
                    <div>
                      <p className="text-sm font-semibold text-ink">{alert.category}</p>
                      <p className="text-[11px] text-slate">{alert.message}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-ink">{alert.policy}</p>
                    <p className="text-[11px] text-slate/60">{alert.matched_rule}</p>
                  </div>
                  <div>
                    <p className="text-sm text-ink">{alert.guardrail_id}</p>
                    <p className="text-[11px] text-slate/60">{alert.flow}</p>
                  </div>
                  <div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] ${decisionTone[alert.decision]}`}>
                      {alert.decision}
                    </span>
                  </div>
                  <div className="text-slate/70">{alert.latency_ms} ms</div>
                  <div className="text-slate/60">
                    {new Date(alert.created_at).toLocaleString()}
                  </div>
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate/10 text-slate hover:border-slate/30 hover:text-ink"
                    onClick={() => setSelectedAlert(alert)}
                    aria-label={`Open alert ${alert.id}`}
                  >
                    <PenLine className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {selectedAlert && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate/60 px-4 py-10"
          onClick={() => setSelectedAlert(null)}
        >
          <div
            className="w-full max-w-2xl rounded-3xl bg-white p-8 shadow-lift"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Alert details"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                  Alert Details
                </p>
                <h3 className="mt-2 text-2xl font-bold text-ink">
                  {selectedAlert.category}
                </h3>
                <p className="text-xs text-slate">{selectedAlert.id}</p>
              </div>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate/10 text-slate hover:text-ink"
                onClick={() => setSelectedAlert(null)}
                aria-label="Close alert details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 grid gap-4 text-sm text-slate">
              <div className="rounded-2xl border border-slate/10 bg-slate/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate/60">
                  Message
                </p>
                <p className="mt-3 text-sm text-ink">{selectedAlert.message}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate/60">
                    Decision
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-sm text-ink">
                    <span className={`h-2 w-2 rounded-full ${severityTone[selectedAlert.severity]}`} />
                    {selectedAlert.decision} / {selectedAlert.severity}
                  </div>
                  <p className="mt-2 text-xs text-slate">
                    Phase: {selectedAlert.phase}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate/60">
                    Policy
                  </p>
                  <p className="mt-3 text-sm text-ink">{selectedAlert.policy}</p>
                  <p className="mt-2 text-xs text-slate">
                    Matched: {selectedAlert.matched_rule}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate/60">
                  Metadata
                </p>
                <div className="mt-3 grid gap-2 text-xs text-slate md:grid-cols-2">
                  <div>
                    <span className="font-semibold text-ink">Guardrail:</span>{" "}
                    {selectedAlert.guardrail_id}
                  </div>
                  <div>
                    <span className="font-semibold text-ink">Workflow:</span>{" "}
                    {selectedAlert.workflow}
                  </div>
                  <div>
                    <span className="font-semibold text-ink">Flow:</span>{" "}
                    {selectedAlert.flow}
                  </div>
                  <div>
                    <span className="font-semibold text-ink">Latency:</span>{" "}
                    {selectedAlert.latency_ms} ms
                  </div>
                  <div>
                    <span className="font-semibold text-ink">Request ID:</span>{" "}
                    {selectedAlert.request_id}
                  </div>
                  <div>
                    <span className="font-semibold text-ink">Created:</span>{" "}
                    {new Date(selectedAlert.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
