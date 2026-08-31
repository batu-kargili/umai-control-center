"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Eye,
  Laptop,
  RefreshCw,
  Shield,
  Wifi,
  X,
} from "lucide-react";

import { useConsole } from "src/app/(console)/console-context";
import {
  type AuditEventItem,
  type SensorDeviceItem,
  type SensorEventItem,
  type SensorOnboardingDeviceItem,
  type SensorSummary,
  fetchAuditEvents,
  fetchSensorDevices,
  fetchSensorEvents,
  fetchSensorOnboardingDevices,
  fetchSensorSummary,
} from "src/lib/api";

// Content-inspection transactions from the sensor proxy (/api/v1/sensor/evaluate)
// land in audit_events, not endpoint_sensor_events. They are identified by the
// sensor's default guardrail coordinates (see UMAI_SENSOR_POLICY_JSON
// default_sensor_guardrail). Keep these in sync with that policy.
const SENSOR_CONTENT_ENVIRONMENT_ID = "test";
const SENSOR_CONTENT_PROJECT_ID = "m4-sensor-test";

type MergedRow =
  | { kind: "sensor"; time: number; sensor: SensorEventItem }
  | { kind: "content"; time: number; content: AuditEventItem };

function shortHash(value?: string | null): string {
  if (!value) return "-";
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function userLabel(event: SensorEventItem): string {
  if (event.user_email && event.user_email.trim().length > 0) {
    return event.user_email.trim();
  }
  if (event.user_idp_subject && event.user_idp_subject.trim().length > 0) {
    return event.user_idp_subject.trim();
  }
  return "-";
}

function payloadString(event: SensorEventItem, key: string): string | undefined {
  const value = event.payload?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function deviceHeartbeat(device: SensorDeviceItem): string {
  if (!device.last_heartbeat_at) return "-";
  return new Date(device.last_heartbeat_at).toLocaleString();
}

function sessionTime(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value?: string | number | null;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-secondary/10 bg-slate/5 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate/60">{label}</p>
      <p className={`mt-1 break-all text-xs text-ink ${mono ? "font-mono" : ""}`}>
        {value ?? "-"}
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const className =
    normalized === "active" ||
    normalized === "ready" ||
    normalized === "downloaded" ||
    normalized === "enrolled" ||
    normalized === "heartbeat seen" ||
    normalized === "event seen"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : normalized === "stale" || normalized === "requested" || normalized === "generating" || normalized === "expired"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-red-200 bg-red-50 text-red-700";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${className}`}>
      {status}
    </span>
  );
}

// Engine actions (audit_events) -> the sensor decision vocabulary used in this view.
function contentDecision(action: string): string {
  const a = action.toUpperCase();
  if (a.startsWith("BLOCK")) return "block";
  if (a === "ALLOW_WITH_WARNINGS") return "warn";
  if (a.startsWith("ALLOW")) return "allow";
  return action.toLowerCase();
}

// The stored prompt comes through as e.g. "[user]: <text>"; show just the text.
function promptText(message?: string | null): string {
  if (!message || message.trim().length === 0) return "-";
  return message.replace(/^\[\w+\]:\s*/, "");
}

function DecisionIcon({ decision }: { decision?: string | null }) {
  if (decision === "block") {
    return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />;
  }
  if (decision === "allow") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  }
  return <Shield className="h-3.5 w-3.5 text-amber-500" />;
}

export default function EndpointSensorPage() {
  const { tenantId } = useConsole();
  const [devices, setDevices] = useState<SensorDeviceItem[]>([]);
  const [events, setEvents] = useState<SensorEventItem[]>([]);
  const [contentEvents, setContentEvents] = useState<AuditEventItem[]>([]);
  const [onboarding, setOnboarding] = useState<SensorOnboardingDeviceItem[]>([]);
  const [summary, setSummary] = useState<SensorSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"events" | "devices" | "onboarding">("events");
  const [decisionFilter, setDecisionFilter] = useState("all");
  const [chainFilter, setChainFilter] = useState("all");
  const [deviceFilter, setDeviceFilter] = useState("");
  const [onboardingStatusFilter, setOnboardingStatusFilter] = useState("all");
  const [onboardingEmployeeFilter, setOnboardingEmployeeFilter] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<SensorEventItem | null>(null);
  const [selectedContent, setSelectedContent] = useState<AuditEventItem | null>(null);

  const refresh = async (silent = false) => {
    if (!tenantId) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [summaryResult, deviceRows, eventRows, contentRows, onboardingRows] = await Promise.all([
        fetchSensorSummary(tenantId, 14),
        fetchSensorDevices(tenantId, { limit: 250 }),
        fetchSensorEvents(tenantId, {
          decision: decisionFilter !== "all" ? decisionFilter : undefined,
          device_id: deviceFilter.trim() || undefined,
          chain_valid: chainFilter === "all" ? undefined : chainFilter === "valid",
          limit: 250,
        }),
        fetchAuditEvents(tenantId, {
          environment_id: SENSOR_CONTENT_ENVIRONMENT_ID,
          project_id: SENSOR_CONTENT_PROJECT_ID,
          limit: 250,
        }).catch(() => [] as AuditEventItem[]),
        fetchSensorOnboardingDevices(tenantId, {
          status: onboardingStatusFilter !== "all" ? onboardingStatusFilter : undefined,
          employee: onboardingEmployeeFilter.trim() || undefined,
          limit: 250,
        }).catch(() => [] as SensorOnboardingDeviceItem[]),
      ]);
      setSummary(summaryResult);
      setDevices(deviceRows);
      setEvents(eventRows);
      setContentEvents(contentRows);
      setOnboarding(onboardingRows);
    } catch (err) {
      console.error(err);
      setError("Failed to load endpoint sensor data.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, decisionFilter, chainFilter, deviceFilter, onboardingStatusFilter, onboardingEmployeeFilter]);

  // Live-ish polling so AI activity visibly streams in during a demo without
  // clicking Refresh. Silent so the table doesn't flash a loading state.
  useEffect(() => {
    if (!tenantId) return;
    const id = setInterval(() => {
      void refresh(true);
    }, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, decisionFilter, chainFilter, deviceFilter, onboardingStatusFilter, onboardingEmployeeFilter]);

  const topDestinations = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.by_destination).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [summary]);

  const topProcesses = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.by_process).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [summary]);

  // AI-focused rollups for the shadow-AI overview tiles. All derived from the
  // summary the page already fetches (no extra API calls).
  const aiInsights = useMemo(() => {
    if (!summary) {
      return { toolCount: 0, toolNames: [] as string[], desktopApps: 0, shadowUsers: 0, connections: 0 };
    }
    const ignore = new Set(["synthetic.umai.local", "unknown"]);
    const toolNames = Object.entries(summary.by_destination)
      .filter(([name]) => !ignore.has(name))
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
    const desktopApps = summary.by_event_type["ai_app_running"] ?? 0;
    const connections =
      (summary.by_event_type["vendor_connection_observed"] ?? 0) +
      (summary.by_event_type["dns_ai_lookup_observed"] ?? 0);
    return {
      toolCount: toolNames.length,
      toolNames,
      desktopApps,
      shadowUsers: summary.unique_users,
      connections,
    };
  }, [summary]);

  // The Events view interleaves passive sensor telemetry (endpoint_sensor_events)
  // with content-inspection transactions (audit_events) so a device's
  // connections and the actual prompts it sent appear in one timeline.
  const mergedEvents = useMemo<MergedRow[]>(() => {
    const rows: MergedRow[] = [];
    for (const e of events) {
      rows.push({ kind: "sensor", time: new Date(e.captured_at).getTime(), sensor: e });
    }
    for (const c of contentEvents) {
      rows.push({ kind: "content", time: new Date(c.created_at).getTime(), content: c });
    }
    rows.sort((a, b) => b.time - a.time);
    return rows;
  }, [events, contentEvents]);

  useEffect(() => {
    if (!selectedEvent) return;
    const stillVisible = events.some((event) => event.event_id === selectedEvent.event_id);
    if (!stillVisible) {
      setSelectedEvent(null);
    }
  }, [events, selectedEvent]);

  useEffect(() => {
    if (!selectedEvent) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedEvent(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedEvent]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-secondary/70">Organization</p>
          <h2 className="font-display text-3xl text-ink">Endpoint Sensor</h2>
          <p className="text-sm text-slate">
            Managed endpoint AI activity, device health, and tamper-evident telemetry.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-secondary/15 bg-white text-xs font-semibold">
            <button
              type="button"
              onClick={() => setView("events")}
              className={`px-3 py-2 ${view === "events" ? "bg-secondary text-white" : "text-secondary hover:bg-secondary/5"}`}
            >
              Events
            </button>
            <button
              type="button"
              onClick={() => setView("devices")}
              className={`px-3 py-2 ${view === "devices" ? "bg-secondary text-white" : "text-secondary hover:bg-secondary/5"}`}
            >
              Devices
            </button>
            <button
              type="button"
              onClick={() => setView("onboarding")}
              className={`px-3 py-2 ${view === "onboarding" ? "bg-secondary text-white" : "text-secondary hover:bg-secondary/5"}`}
            >
              Onboarding
            </button>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || !tenantId}
            className="inline-flex items-center gap-2 rounded-lg border border-secondary/15 bg-white px-4 py-2 text-xs font-semibold text-secondary transition-colors hover:bg-secondary/5 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-lg border border-secondary/10 bg-white p-4 shadow-sm">
          <p className="text-xs text-secondary/70">Events (14d)</p>
          <p className="mt-1 text-2xl font-semibold text-secondary">
            {summary?.total_events ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-secondary/10 bg-white p-4 shadow-sm">
          <p className="text-xs text-secondary/70">Devices</p>
          <p className="mt-1 text-2xl font-semibold text-secondary">
            {devices.length || summary?.unique_devices || 0}
          </p>
        </div>
        <div className="rounded-lg border border-slate/10 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate">Blocked</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">
            {summary?.blocked_events ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-slate/10 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate">Warned</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600">
            {summary?.warned_events ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-slate/10 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate">Redacted</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">
            {summary?.redacted_events ?? 0}
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-secondary/10 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-secondary/70">
            <Eye className="h-4 w-4" />
            <p className="text-xs">AI tools discovered</p>
          </div>
          <p className="mt-1 text-2xl font-semibold text-secondary">{aiInsights.toolCount}</p>
          <p className="mt-1 truncate text-[11px] text-slate/70">
            {aiInsights.toolNames.slice(0, 3).join(", ") || "None yet"}
          </p>
        </div>
        <div className="rounded-lg border border-secondary/10 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-secondary/70">
            <Cpu className="h-4 w-4" />
            <p className="text-xs">Desktop AI apps</p>
          </div>
          <p className="mt-1 text-2xl font-semibold text-secondary">{aiInsights.desktopApps}</p>
          <p className="mt-1 text-[11px] text-slate/70">running-app detections</p>
        </div>
        <div className="rounded-lg border border-secondary/10 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-secondary/70">
            <Laptop className="h-4 w-4" />
            <p className="text-xs">Shadow AI users</p>
          </div>
          <p className="mt-1 text-2xl font-semibold text-secondary">{aiInsights.shadowUsers}</p>
          <p className="mt-1 text-[11px] text-slate/70">users touching AI tools</p>
        </div>
        <div className="rounded-lg border border-secondary/10 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-secondary/70">
            <Wifi className="h-4 w-4" />
            <p className="text-xs">AI connections (14d)</p>
          </div>
          <p className="mt-1 text-2xl font-semibold text-secondary">{aiInsights.connections}</p>
          <p className="mt-1 text-[11px] text-slate/70">network + DNS observations</p>
        </div>
      </section>

      <section className="rounded-lg border border-secondary/10 bg-white p-5 shadow-sm">
        {view === "events" ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <select
                value={decisionFilter}
                onChange={(event) => setDecisionFilter(event.target.value)}
                className="h-9 rounded-lg border border-secondary/15 bg-white px-3 text-xs text-ink focus:border-secondary/40 focus:outline-none"
              >
                <option value="all">All decisions</option>
                <option value="allow">allow</option>
                <option value="warn">warn</option>
                <option value="block">block</option>
                <option value="redact">redact</option>
                <option value="justify">justify</option>
              </select>
              <select
                value={chainFilter}
                onChange={(event) => setChainFilter(event.target.value)}
                className="h-9 rounded-lg border border-secondary/15 bg-white px-3 text-xs text-ink focus:border-secondary/40 focus:outline-none"
              >
                <option value="all">All chain status</option>
                <option value="valid">Chain valid</option>
                <option value="invalid">Chain invalid</option>
              </select>
              <input
                type="text"
                value={deviceFilter}
                onChange={(event) => setDeviceFilter(event.target.value)}
                placeholder="Device ID"
                className="h-9 min-w-[220px] rounded-lg border border-secondary/15 bg-white px-3 text-xs text-ink placeholder:text-slate/60 focus:border-secondary/40 focus:outline-none"
              />
            </div>

            <div className="overflow-auto rounded-lg border border-secondary/10">
              <table className="w-full min-w-[1180px] text-left text-xs">
                <thead className="bg-secondary/5 text-[11px] uppercase tracking-[0.14em] text-slate/70">
                  <tr>
                    <th className="px-3 py-2">Time</th>
                    <th className="px-3 py-2">Process</th>
                    <th className="px-3 py-2">Destination</th>
                    <th className="px-3 py-2">Event</th>
                    <th className="px-3 py-2">Prompt / Message</th>
                    <th className="px-3 py-2">Decision</th>
                    <th className="px-3 py-2">User</th>
                    <th className="px-3 py-2">Device</th>
                    <th className="px-3 py-2">DLP</th>
                    <th className="px-3 py-2">Chain</th>
                    <th className="px-3 py-2">Hash</th>
                    <th className="px-3 py-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td className="px-3 py-6 text-slate" colSpan={12}>
                        Loading...
                      </td>
                    </tr>
                  ) : mergedEvents.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-slate" colSpan={12}>
                        No endpoint sensor events found.
                      </td>
                    </tr>
                  ) : (
                    mergedEvents.map((row) =>
                      row.kind === "sensor" ? (
                        (() => {
                          const event = row.sensor;
                          return (
                            <tr key={`s-${event.event_id}`} className="border-t border-slate/10 text-slate hover:bg-secondary/5">
                              <td className="px-3 py-2">{new Date(event.captured_at).toLocaleString()}</td>
                              <td className="max-w-[180px] truncate px-3 py-2">
                                <span className="inline-flex items-center gap-1">
                                  <Cpu className="h-3.5 w-3.5" />
                                  {event.process_name || "-"}
                                </span>
                              </td>
                              <td className="max-w-[220px] truncate px-3 py-2">
                                {event.destination_host || "-"}
                                {event.destination_port ? `:${event.destination_port}` : ""}
                              </td>
                              <td className="px-3 py-2">{event.event_type}</td>
                              <td className="px-3 py-2 text-slate/40">-</td>
                              <td className="px-3 py-2">
                                {event.decision ? (
                                  <span className="inline-flex items-center gap-1 font-semibold">
                                    <DecisionIcon decision={event.decision} />
                                    {event.decision}
                                  </span>
                                ) : (
                                  "-"
                                )}
                              </td>
                              <td className="max-w-[180px] truncate px-3 py-2">{userLabel(event)}</td>
                              <td className="px-3 py-2 font-mono text-[11px]">{event.device_id}</td>
                              <td className="max-w-[180px] truncate px-3 py-2">
                                {event.dlp_tags.length ? event.dlp_tags.join(", ") : "-"}
                              </td>
                              <td className="px-3 py-2">
                                {event.chain_valid ? (
                                  <span className="text-emerald-600">valid</span>
                                ) : (
                                  <span className="text-red-600">{event.chain_error || "invalid"}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 font-mono text-[11px]">
                                {shortHash(event.prompt_hash || event.event_hash)}
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedEvent(event)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-secondary/15 bg-white px-3 py-1 text-[11px] font-semibold text-secondary transition hover:bg-secondary/5"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  View
                                </button>
                              </td>
                            </tr>
                          );
                        })()
                      ) : (
                        (() => {
                          const c = row.content;
                          const decision = contentDecision(c.action);
                          const prompt = promptText(c.message);
                          return (
                            <tr key={`c-${c.id}`} className="border-t border-slate/10 bg-secondary/[0.03] text-slate hover:bg-secondary/5">
                              <td className="px-3 py-2">{new Date(c.created_at).toLocaleString()}</td>
                              <td className="max-w-[180px] truncate px-3 py-2">
                                {c.action_resource?.process_name || "-"}
                              </td>
                              <td className="max-w-[220px] truncate px-3 py-2">
                                {c.action_resource?.destination_host || "-"}
                              </td>
                              <td className="px-3 py-2">
                                <span className="inline-flex items-center gap-1 font-medium text-secondary">
                                  <Eye className="h-3.5 w-3.5" />
                                  ai_prompt
                                </span>
                              </td>
                              <td className="max-w-[320px] truncate px-3 py-2 text-ink" title={prompt}>
                                {prompt}
                              </td>
                              <td className="px-3 py-2">
                                <span className="inline-flex items-center gap-1 font-semibold">
                                  <DecisionIcon decision={decision} />
                                  {decision}
                                </span>
                              </td>
                              <td className="max-w-[180px] truncate px-3 py-2">-</td>
                              <td className="px-3 py-2 font-mono text-[11px]">
                                {c.action_resource?.device_id || "-"}
                              </td>
                              <td className="max-w-[180px] truncate px-3 py-2">
                                {c.category || "-"}
                              </td>
                              <td className="px-3 py-2 text-slate/40">-</td>
                              <td className="px-3 py-2 font-mono text-[11px]">{shortHash(c.event_hash)}</td>
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedContent(c)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-secondary/15 bg-white px-3 py-1 text-[11px] font-semibold text-secondary transition hover:bg-secondary/5"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  View
                                </button>
                              </td>
                            </tr>
                          );
                        })()
                      ),
                    )
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : view === "devices" ? (
          <div className="overflow-auto rounded-lg border border-secondary/10">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className="bg-secondary/5 text-[11px] uppercase tracking-[0.14em] text-slate/70">
                <tr>
                  <th className="px-3 py-2">Device</th>
                  <th className="px-3 py-2">Host</th>
                  <th className="px-3 py-2">OS</th>
                  <th className="px-3 py-2">Agent</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Heartbeat</th>
                  <th className="px-3 py-2">Queue</th>
                  <th className="px-3 py-2">Identity</th>
                  <th className="px-3 py-2">Policy</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-3 py-6 text-slate" colSpan={9}>
                      Loading...
                    </td>
                  </tr>
                ) : devices.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-slate" colSpan={9}>
                      No endpoint sensor devices enrolled.
                    </td>
                  </tr>
                ) : (
                  devices.map((device) => (
                    <tr key={device.device_id} className="border-t border-slate/10 text-slate hover:bg-secondary/5">
                      <td className="px-3 py-2 font-mono text-[11px]">{device.device_id}</td>
                      <td className="max-w-[180px] truncate px-3 py-2">
                        <span className="inline-flex items-center gap-1">
                          <Laptop className="h-3.5 w-3.5" />
                          {device.hostname || "-"}
                        </span>
                      </td>
                      <td className="px-3 py-2">{device.os || "-"} {device.os_version || ""}</td>
                      <td className="px-3 py-2">{device.agent_version || "-"}</td>
                      <td className="px-3 py-2"><StatusPill status={device.status} /></td>
                      <td className="px-3 py-2">{deviceHeartbeat(device)}</td>
                      <td className="px-3 py-2">{device.queue_depth ?? "-"}</td>
                      <td className="px-3 py-2">{device.identity_status || "-"}</td>
                      <td className="px-3 py-2 font-mono text-[11px]">{shortHash(device.last_policy_etag)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <select
                value={onboardingStatusFilter}
                onChange={(event) => setOnboardingStatusFilter(event.target.value)}
                className="h-9 rounded-lg border border-secondary/15 bg-white px-3 text-xs text-ink focus:border-secondary/40 focus:outline-none"
              >
                <option value="all">All statuses</option>
                <option value="requested">requested</option>
                <option value="generating">generating</option>
                <option value="ready">ready</option>
                <option value="downloaded">downloaded</option>
                <option value="enrolled">enrolled</option>
                <option value="heartbeat_seen">heartbeat seen</option>
                <option value="event_seen">event seen</option>
                <option value="failed">failed</option>
                <option value="expired">expired</option>
              </select>
              <input
                type="text"
                value={onboardingEmployeeFilter}
                onChange={(event) => setOnboardingEmployeeFilter(event.target.value)}
                placeholder="Employee"
                className="h-9 min-w-[220px] rounded-lg border border-secondary/15 bg-white px-3 text-xs text-ink placeholder:text-slate/60 focus:border-secondary/40 focus:outline-none"
              />
            </div>
            <div className="overflow-auto rounded-lg border border-secondary/10">
              <table className="w-full min-w-[1220px] text-left text-xs">
                <thead className="bg-secondary/5 text-[11px] uppercase tracking-[0.14em] text-slate/70">
                  <tr>
                    <th className="px-3 py-2">Employee</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Generated</th>
                    <th className="px-3 py-2">Downloaded</th>
                    <th className="px-3 py-2">Device</th>
                    <th className="px-3 py-2">Host</th>
                    <th className="px-3 py-2">Heartbeat</th>
                    <th className="px-3 py-2">First Event</th>
                    <th className="px-3 py-2">Version</th>
                    <th className="px-3 py-2">Identity</th>
                    <th className="px-3 py-2">Failure</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td className="px-3 py-6 text-slate" colSpan={11}>
                        Loading...
                      </td>
                    </tr>
                  ) : onboarding.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-slate" colSpan={11}>
                        No onboarding sessions found.
                      </td>
                    </tr>
                  ) : (
                    onboarding.map((row) => (
                      <tr key={row.id} className="border-t border-slate/10 text-slate hover:bg-secondary/5">
                        <td className="max-w-[220px] truncate px-3 py-2">
                          <span className="font-semibold text-ink">
                            {row.employee_display_name || row.employee_upn || row.employee_idp_subject}
                          </span>
                          <span className="block truncate text-[11px] text-slate/70">
                            {row.employee_upn || row.employee_idp_subject}
                          </span>
                        </td>
                        <td className="px-3 py-2"><StatusPill status={row.status.replace(/_/g, " ")} /></td>
                        <td className="px-3 py-2">{sessionTime(row.artifact_id ? row.updated_at || row.created_at : null)}</td>
                        <td className="px-3 py-2">{sessionTime(row.downloaded_at)}</td>
                        <td className="px-3 py-2 font-mono text-[11px]">{row.device_id || "-"}</td>
                        <td className="max-w-[180px] truncate px-3 py-2">{row.hostname || "-"}</td>
                        <td className="px-3 py-2">{sessionTime(row.first_heartbeat_at || row.last_heartbeat_at)}</td>
                        <td className="px-3 py-2">{sessionTime(row.first_event_at)}</td>
                        <td className="px-3 py-2">{row.installer_version || "-"}</td>
                        <td className="px-3 py-2">{row.identity_status || "-"}</td>
                        <td className="max-w-[220px] truncate px-3 py-2 text-red-700">
                          {row.failure_reason || "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-secondary/10 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-ink">Top Destinations</h3>
          <div className="mt-3 space-y-2">
            {topDestinations.length === 0 ? (
              <p className="text-sm text-slate">No destination activity yet.</p>
            ) : (
              topDestinations.map(([destination, count]) => (
                <div
                  key={destination}
                  className="flex items-center justify-between rounded-lg border border-secondary/10 px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2 truncate text-slate">
                    <Wifi className="h-4 w-4 shrink-0" />
                    <span className="truncate">{destination}</span>
                  </span>
                  <span className="font-semibold text-secondary">{count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-secondary/10 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-ink">Top Processes</h3>
          <div className="mt-3 space-y-2">
            {topProcesses.length === 0 ? (
              <p className="text-sm text-slate">No process activity yet.</p>
            ) : (
              topProcesses.map(([process, count]) => (
                <div
                  key={process}
                  className="flex items-center justify-between rounded-lg border border-secondary/10 px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2 truncate text-slate">
                    <Cpu className="h-4 w-4 shrink-0" />
                    <span className="truncate">{process}</span>
                  </span>
                  <span className="font-semibold text-secondary">{count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {selectedEvent ? (
        <div className="fixed inset-0 z-[100] flex justify-end bg-black/35 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Close endpoint event details"
            className="absolute inset-0 cursor-default"
            onClick={() => setSelectedEvent(null)}
          />
          <aside
            className="relative z-10 h-full w-full max-w-[920px] overflow-y-auto border-l border-secondary/10 bg-white p-5 shadow-2xl"
            aria-label="Endpoint event details"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-secondary/70">
                  Endpoint Event
                </p>
                <h3 className="mt-1 font-display text-2xl text-ink">
                  {selectedEvent.event_type} to {selectedEvent.destination_host || "-"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-secondary/15 text-slate transition hover:bg-secondary/5"
                aria-label="Close endpoint event details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <DetailRow label="Event ID" value={selectedEvent.event_id} mono />
              <DetailRow label="Captured" value={new Date(selectedEvent.captured_at).toLocaleString()} />
              <DetailRow label="User" value={userLabel(selectedEvent)} />
              <DetailRow label="Device" value={selectedEvent.device_id} mono />
              <DetailRow label="Process" value={selectedEvent.process_name || "-"} />
              <DetailRow label="Parent" value={selectedEvent.parent_process || "-"} />
              <DetailRow label="Destination" value={selectedEvent.destination_host || "-"} mono />
              <DetailRow label="SNI" value={selectedEvent.destination_sni || "-"} mono />
              <DetailRow label="Decision" value={selectedEvent.decision || "-"} />
              <DetailRow label="Prompt hash" value={selectedEvent.prompt_hash || "-"} mono />
              <DetailRow label="Event-chain hash" value={selectedEvent.event_hash} mono />
              <DetailRow label="Previous hash" value={selectedEvent.prev_event_hash || "-"} mono />
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div className="space-y-4">
                <DetailRow label="Prompt length" value={selectedEvent.prompt_len ?? "-"} />
                <DetailRow label="DLP tags" value={selectedEvent.dlp_tags.join(", ") || "-"} />
                <DetailRow label="Message" value={selectedEvent.message || "-"} />
                <DetailRow label="Process path" value={selectedEvent.process_path || "-"} mono />
                {payloadString(selectedEvent, "prompt_text") ? (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate/60">
                      Prompt Text
                    </p>
                    <pre className="max-h-48 overflow-auto rounded-lg border border-secondary/10 bg-white p-3 text-xs leading-5 text-ink">
                      {payloadString(selectedEvent, "prompt_text")}
                    </pre>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate/60">
                  Raw Payload JSON
                </p>
                <pre className="max-h-[520px] overflow-auto rounded-lg border border-secondary/10 bg-slate/5 p-3 text-xs leading-5 text-ink">
                  {JSON.stringify(selectedEvent.payload, null, 2)}
                </pre>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {selectedContent ? (
        <div className="fixed inset-0 z-[100] flex justify-end bg-black/35 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Close content inspection details"
            className="absolute inset-0 cursor-default"
            onClick={() => setSelectedContent(null)}
          />
          <aside
            className="relative z-10 h-full w-full max-w-[920px] overflow-y-auto border-l border-secondary/10 bg-white p-5 shadow-2xl"
            aria-label="Content inspection details"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-secondary/70">
                  Prompt Inspection
                </p>
                <h3 className="mt-1 font-display text-2xl text-ink">
                  {contentDecision(selectedContent.action)} ·{" "}
                  {selectedContent.action_resource?.destination_host || "-"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedContent(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-secondary/15 text-slate transition hover:bg-secondary/5"
                aria-label="Close content inspection details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <DetailRow label="Captured" value={new Date(selectedContent.created_at).toLocaleString()} />
              <DetailRow label="Decision" value={selectedContent.action} />
              <DetailRow label="Severity" value={selectedContent.decision_severity || "-"} />
              <DetailRow label="Reason" value={selectedContent.decision_reason || "-"} />
              <DetailRow label="Destination" value={selectedContent.action_resource?.destination_host || "-"} mono />
              <DetailRow label="Device" value={selectedContent.action_resource?.device_id || "-"} mono />
              <DetailRow label="Process" value={selectedContent.action_resource?.process_name || "-"} />
              <DetailRow label="Capture mode" value={selectedContent.action_resource?.effective_capture_mode || "-"} />
              <DetailRow label="Guardrail" value={`${selectedContent.guardrail_id} v${selectedContent.guardrail_version}`} mono />
              <DetailRow label="Phase" value={selectedContent.phase} />
              <DetailRow label="Latency" value={selectedContent.latency_ms != null ? `${Math.round(selectedContent.latency_ms)} ms` : "-"} />
              <DetailRow label="Event hash" value={selectedContent.event_hash || "-"} mono />
            </div>

            <div className="mt-5 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate/60">
                Full prompt / message {selectedContent.redacted ? "(PII redacted)" : ""}
              </p>
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-secondary/10 bg-slate/5 p-3 text-xs leading-5 text-ink">
                {selectedContent.message || "(no message captured for this transaction)"}
              </pre>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
