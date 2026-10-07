"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { RefreshCw, Search } from "lucide-react";
import {
  fetchAlerts,
  POLICY_PHASE_LABELS,
  POLICY_PHASE_OPTIONS,
  type AlertItem,
  type PolicyPhase,
} from "src/lib/api";
import { useConsole } from "src/app/(console)/console-context";
import {
  BTN_SECONDARY,
  CopyButton,
  DecisionTag,
  EmptyState,
  INPUT,
  InlineNotice,
  KeyValue,
  SELECT,
  SectionCard,
  TAG,
  decisionLabel,
  decisionPanelClass,
} from "src/app/(console)/console-ui";

// Alerts endpoint'inin sayacı/sayfalaması yok; tavan 250.
const FETCH_LIMIT = 250;
const DAY_MS = 24 * 60 * 60 * 1000;

type DecisionFilter = "ALL" | AlertItem["decision"];
type SeverityFilter = "ALL" | AlertItem["severity"];

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const fullDateFormatter = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium" });

const SEVERITY_ORDER: AlertItem["severity"][] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

function severityClass(severity: AlertItem["severity"]) {
  if (severity === "CRITICAL" || severity === "HIGH") return "text-red-700";
  if (severity === "MEDIUM") return "text-amber-700";
  return "text-gray-600";
}

function severityLabel(severity: AlertItem["severity"]) {
  return severity.charAt(0) + severity.slice(1).toLowerCase();
}

export default function AlertsPage() {
  const { envId, projectId } = useParams() as { envId: string; projectId: string };
  const { tenantId } = useConsole();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>("ALL");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("ALL");
  const [phaseFilter, setPhaseFilter] = useState<PolicyPhase | "ALL">("ALL");
  const [selected, setSelected] = useState<AlertItem | null>(null);

  const load = useCallback(() => {
    if (!envId || !projectId || !tenantId) return;
    setLoading(true);
    fetchAlerts(tenantId, envId, projectId, FETCH_LIMIT)
      .then((data) => {
        setAlerts(data);
        setError(null);
      })
      .catch((err: Error) => {
        console.error(err);
        setError("Unable to load alerts.");
      })
      .finally(() => setLoading(false));
  }, [envId, projectId, tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return alerts.filter((alert) => {
      if (decisionFilter !== "ALL" && alert.decision !== decisionFilter) return false;
      if (severityFilter !== "ALL" && alert.severity !== severityFilter) return false;
      if (phaseFilter !== "ALL" && alert.phase !== phaseFilter) return false;
      if (!normalized) return true;
      return [alert.message, alert.category, alert.policy, alert.matched_rule, alert.guardrail_id, alert.request_id]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [alerts, decisionFilter, phaseFilter, query, severityFilter]);

  const stats = useMemo(() => {
    const since = Date.now() - DAY_MS;
    return {
      blocked: alerts.filter((alert) => alert.decision === "BLOCK").length,
      flagged: alerts.filter((alert) => alert.decision === "FLAG").length,
      last24h: alerts.filter((alert) => Date.parse(alert.created_at) >= since).length,
      critical: alerts.filter((alert) => alert.severity === "CRITICAL" || alert.severity === "HIGH").length,
    };
  }, [alerts]);

  const capped = alerts.length >= FETCH_LIMIT;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-gray-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Alerts</h1>
          <p className="mt-1 text-sm text-gray-500">
            Blocked and flagged requests in {projectId}
            {!loading && (capped ? ` · latest ${FETCH_LIMIT}` : ` · ${alerts.length} total`)}
          </p>
        </div>
        <button type="button" className={BTN_SECONDARY} onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </header>

      {error && <InlineNotice tone="error">{error}</InlineNotice>}

      <section className="grid grid-cols-2 divide-y divide-gray-200 rounded border border-gray-200 bg-white sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        {[
          { label: "Last 24h", value: stats.last24h },
          { label: "Blocked", value: stats.blocked },
          { label: "Flagged", value: stats.flagged },
          { label: "High or critical", value: stats.critical },
        ].map((item) => (
          <div key={item.label} className="px-5 py-4">
            <p className="text-xs font-medium text-gray-500">{item.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{loading ? "—" : item.value}</p>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className={`${INPUT} pl-8`}
            placeholder="Search message, policy, rule, guardrail or request ID"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search alerts"
          />
        </div>
        <select
          className={SELECT}
          value={decisionFilter}
          onChange={(event) => setDecisionFilter(event.target.value as DecisionFilter)}
          aria-label="Filter by decision"
        >
          <option value="ALL">All decisions</option>
          <option value="BLOCK">Blocked</option>
          <option value="FLAG">Flagged</option>
        </select>
        <select
          className={SELECT}
          value={severityFilter}
          onChange={(event) => setSeverityFilter(event.target.value as SeverityFilter)}
          aria-label="Filter by severity"
        >
          <option value="ALL">All severities</option>
          {SEVERITY_ORDER.map((severity) => (
            <option key={severity} value={severity}>
              {severityLabel(severity)}
            </option>
          ))}
        </select>
        <select
          className={SELECT}
          value={phaseFilter}
          onChange={(event) => setPhaseFilter(event.target.value as PolicyPhase | "ALL")}
          aria-label="Filter by phase"
        >
          <option value="ALL">All phases</option>
          {POLICY_PHASE_OPTIONS.map((phase) => (
            <option key={phase} value={phase}>
              {POLICY_PHASE_LABELS[phase]}
            </option>
          ))}
        </select>
      </div>

      {!loading && alerts.length === 0 ? (
        <EmptyState>No alerts yet. Blocked or flagged requests from guardrails and the Test page appear here.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Time</th>
                <th className="px-4 py-2.5 font-medium">Decision</th>
                <th className="px-4 py-2.5 font-medium">Severity</th>
                <th className="px-4 py-2.5 font-medium">Agent</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">Policy</th>
                <th className="px-4 py-2.5 font-medium">Guardrail</th>
                <th className="px-4 py-2.5 font-medium">Phase</th>
                <th className="px-4 py-2.5 text-right font-medium">Latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                    Loading alerts…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    No alerts match these filters.
                  </td>
                </tr>
              ) : (
                filtered.map((alert) => (
                  <tr
                    key={alert.id}
                    onClick={() => setSelected(alert)}
                    className="cursor-pointer transition-colors hover:bg-gray-50"
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-gray-600" title={fullDateFormatter.format(new Date(alert.created_at))}>
                      {timeFormatter.format(new Date(alert.created_at))}
                    </td>
                    <td className="px-4 py-2.5">
                      <DecisionTag action={alert.decision} />
                    </td>
                    <td className={`px-4 py-2.5 text-xs font-medium ${severityClass(alert.severity)}`}>
                      {severityLabel(alert.severity)}
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-2.5 font-mono text-xs text-gray-600" title={alert.agent_id ?? undefined}>
                      {alert.agent_id ?? <span className="font-sans text-gray-400">—</span>}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-2.5 text-gray-900" title={alert.category}>
                      {alert.category}
                    </td>
                    <td className="max-w-[260px] px-4 py-2.5">
                      <p className="truncate text-gray-900" title={alert.policy}>
                        {alert.policy}
                      </p>
                      {alert.matched_rule && alert.matched_rule !== "N/A" && (
                        <p className="truncate font-mono text-xs text-gray-500" title={alert.matched_rule}>
                          {alert.matched_rule}
                        </p>
                      )}
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-2.5 font-mono text-xs text-gray-600" title={alert.guardrail_id}>
                      {alert.guardrail_id}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">
                      {POLICY_PHASE_LABELS[alert.phase] ?? alert.phase}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-gray-600">
                      {Math.round(alert.latency_ms)} ms
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      {!loading && alerts.length > 0 && (
        <p className="text-xs text-gray-500">
          {filtered.length} of {alerts.length} alerts
          {capped && ` · only the latest ${FETCH_LIMIT} are loaded`}
        </p>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4 py-6"
          onClick={() => setSelected(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Alert details"
            className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded border border-gray-200 bg-white"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900">{selected.category}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  {fullDateFormatter.format(new Date(selected.created_at))}
                  <span className={TAG}>{POLICY_PHASE_LABELS[selected.phase] ?? selected.phase}</span>
                  <span className="inline-flex items-center gap-1 font-mono">
                    {selected.request_id}
                    <CopyButton value={selected.request_id} label="Copy request ID" />
                  </span>
                </p>
              </div>
              <button type="button" className={BTN_SECONDARY} onClick={() => setSelected(null)}>
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <div className={`rounded border px-4 py-3 ${decisionPanelClass(selected.decision)}`}>
                <p className="text-lg font-semibold">{decisionLabel(selected.decision)}</p>
                <p className="mt-0.5 text-xs font-medium uppercase tracking-wide opacity-80">
                  {selected.decision} · {selected.severity}
                </p>
              </div>

              <SectionCard title="Message">
                <p className="whitespace-pre-wrap text-sm leading-6 text-gray-900">{selected.message}</p>
              </SectionCard>

              <div className="grid gap-4 sm:grid-cols-2">
                <KeyValue label="Policy">{selected.policy}</KeyValue>
                <KeyValue label="Matched rule">
                  <span className="font-mono text-xs">{selected.matched_rule}</span>
                </KeyValue>
                <KeyValue label="Guardrail">
                  <span className="font-mono text-xs">{selected.guardrail_id}</span>
                </KeyValue>
                <KeyValue label="Agent">
                  {selected.agent_id ? (
                    <span className="font-mono text-xs">{selected.agent_id}</span>
                  ) : (
                    "—"
                  )}
                </KeyValue>
                <KeyValue label="Conversation">
                  {selected.workflow && selected.workflow !== projectId && selected.workflow !== "N/A" ? (
                    <span className="font-mono text-xs">{selected.workflow}</span>
                  ) : (
                    "—"
                  )}
                </KeyValue>
                <KeyValue label="Latency">
                  <span className="tabular-nums">{Math.round(selected.latency_ms)} ms</span>
                </KeyValue>
                <KeyValue label="Alert ID">
                  <span className="font-mono text-xs">{selected.id}</span>
                </KeyValue>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
