"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Shield, Monitor, AlertTriangle, CheckCircle2, Eye, X } from "lucide-react";

import { useConsole } from "src/app/(console)/console-context";
import {
  type ExtensionEventItem,
  type ExtensionSummary,
  fetchExtensionEvents,
  fetchExtensionSummary,
} from "src/lib/api";

function shortHash(value?: string | null): string {
  if (!value) return "-";
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function userLabel(event: ExtensionEventItem): string {
  const payloadName = event.payload?.user_name;
  if (typeof payloadName === "string" && payloadName.trim().length > 0) {
    return payloadName.trim();
  }
  if (event.user_email && event.user_email.trim().length > 0) {
    return event.user_email.trim();
  }
  if (event.user_idp_subject && event.user_idp_subject.trim().length > 0) {
    return event.user_idp_subject.trim();
  }
  return "-";
}

function payloadString(event: ExtensionEventItem, key: string): string | undefined {
  const value = event.payload?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function payloadNumber(event: ExtensionEventItem, key: string): number | undefined {
  const value = event.payload?.[key];
  return typeof value === "number" ? value : undefined;
}

function transactionHash(event: ExtensionEventItem): string | null {
  return (
    event.prompt_hash ||
    event.response_hash ||
    payloadString(event, "prompt_text_hash") ||
    payloadString(event, "response_text_hash") ||
    payloadString(event, "user_justification_hash") ||
    event.event_hash ||
    null
  );
}

function promptLength(event: ExtensionEventItem): number | undefined {
  return (
    event.prompt_len ??
    payloadNumber(event, "prompt_text_len") ??
    payloadNumber(event, "prompt_len")
  );
}

function responseLength(event: ExtensionEventItem): number | undefined {
  return (
    event.response_len ??
    payloadNumber(event, "response_text_len") ??
    payloadNumber(event, "response_len")
  );
}

function hasFullContent(event: ExtensionEventItem): boolean {
  return Boolean(
    payloadString(event, "prompt_text") ||
      payloadString(event, "response_text") ||
      payloadString(event, "user_justification")
  );
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
    <div className="rounded-xl border border-secondary/10 bg-slate/5 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate/60">{label}</p>
      <p className={`mt-1 break-all text-xs text-ink ${mono ? "font-mono" : ""}`}>
        {value ?? "-"}
      </p>
    </div>
  );
}

function ContentBlock({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return null;
  }
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate/60">{label}</p>
      <pre className="max-h-48 overflow-auto rounded-2xl border border-secondary/10 bg-white p-3 text-xs leading-5 text-ink">
        {value}
      </pre>
    </div>
  );
}

export default function ExtensionMonitoringPage() {
  const { tenantId } = useConsole();
  const [events, setEvents] = useState<ExtensionEventItem[]>([]);
  const [summary, setSummary] = useState<ExtensionSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [decisionFilter, setDecisionFilter] = useState<string>("all");
  const [chainFilter, setChainFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("");
  const [selectedEvent, setSelectedEvent] = useState<ExtensionEventItem | null>(null);

  const refresh = async () => {
    if (!tenantId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [summaryResult, eventRows] = await Promise.all([
        fetchExtensionSummary(tenantId, 14),
        fetchExtensionEvents(tenantId, {
          site: siteFilter !== "all" ? siteFilter : undefined,
          decision: decisionFilter !== "all" ? decisionFilter : undefined,
          chain_valid:
            chainFilter === "all" ? undefined : chainFilter === "valid",
          limit: 250,
        }),
      ]);
      setSummary(summaryResult);
      setEvents(eventRows);
    } catch (err) {
      console.error(err);
      setError("Failed to load extension monitoring data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, siteFilter, decisionFilter, chainFilter]);

  const topSites = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.by_site).sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [summary]);

  const filteredEvents = useMemo(() => {
    const query = userFilter.trim().toLowerCase();
    if (!query) {
      return events;
    }
    return events.filter((event) => {
      const name =
        typeof event.payload?.user_name === "string"
          ? event.payload.user_name.toLowerCase()
          : "";
      const email = (event.user_email ?? "").toLowerCase();
      const subject = (event.user_idp_subject ?? "").toLowerCase();
      return (
        name.includes(query) ||
        email.includes(query) ||
        subject.includes(query)
      );
    });
  }, [events, userFilter]);

  useEffect(() => {
    if (!selectedEvent) {
      return;
    }
    const stillVisible = filteredEvents.some((event) => event.id === selectedEvent.id);
    if (!stillVisible) {
      setSelectedEvent(null);
    }
  }, [filteredEvents, selectedEvent]);

  useEffect(() => {
    if (!selectedEvent) {
      return;
    }
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
          <p className="text-xs uppercase tracking-[0.3em] text-secondary/70">Organization</p>
          <h2 className="font-display text-3xl text-ink">Extension Monitoring</h2>
          <p className="text-sm text-slate">
            Browser-level AI usage telemetry from forced UMAI extension deployment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700">
            Managed extension enforced
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || !tenantId}
            className="inline-flex items-center gap-2 rounded-full border border-secondary/15 bg-white px-4 py-2 text-xs font-semibold text-secondary transition-colors hover:bg-secondary/5"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-secondary/10 bg-white p-4 shadow-sm">
          <p className="text-xs text-secondary/70">Events (14d)</p>
          <p className="mt-1 text-2xl font-semibold text-secondary">
            {summary?.total_events ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-secondary/10 bg-white p-4 shadow-sm">
          <p className="text-xs text-secondary/70">Devices</p>
          <p className="mt-1 text-2xl font-semibold text-secondary">
            {summary?.unique_devices ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-slate/10 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate">Blocked</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">
            {summary?.blocked_events ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-slate/10 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate">Warned</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600">
            {summary?.warned_events ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-slate/10 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate">Redacted</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">
            {summary?.redacted_events ?? 0}
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-secondary/10 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select
            value={siteFilter}
            onChange={(event) => setSiteFilter(event.target.value)}
            className="h-9 rounded-full border border-secondary/15 bg-white px-3 text-xs text-ink focus:border-secondary/40 focus:outline-none"
          >
            <option value="all">All sites</option>
            <option value="chatgpt">ChatGPT</option>
            <option value="gemini">Gemini</option>
            <option value="claude">Claude</option>
          </select>
          <select
            value={decisionFilter}
            onChange={(event) => setDecisionFilter(event.target.value)}
            className="h-9 rounded-full border border-secondary/15 bg-white px-3 text-xs text-ink focus:border-secondary/40 focus:outline-none"
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
            className="h-9 rounded-full border border-secondary/15 bg-white px-3 text-xs text-ink focus:border-secondary/40 focus:outline-none"
          >
            <option value="all">All chain status</option>
            <option value="valid">Chain valid</option>
            <option value="invalid">Chain invalid</option>
          </select>
          <input
            type="text"
            value={userFilter}
            onChange={(event) => setUserFilter(event.target.value)}
            placeholder="Search user (name/email/sub)"
            className="h-9 min-w-[220px] rounded-full border border-secondary/15 bg-white px-3 text-xs text-ink placeholder:text-slate/60 focus:border-secondary/40 focus:outline-none"
          />
        </div>

        <div className="overflow-auto rounded-2xl border border-secondary/10">
          <table className="w-full min-w-[1100px] text-left text-xs">
            <thead className="bg-secondary/5 text-[11px] uppercase tracking-[0.18em] text-slate/70">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Site</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Decision</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Device</th>
                <th className="px-3 py-2">Chain</th>
                <th className="px-3 py-2">Transaction</th>
                <th className="px-3 py-2">Message</th>
                <th className="px-3 py-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-6 text-slate" colSpan={10}>
                    Loading...
                  </td>
                </tr>
              ) : filteredEvents.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate" colSpan={10}>
                    {userFilter.trim().length > 0
                      ? "No extension events match current user search."
                      : "No extension events found."}
                  </td>
                </tr>
              ) : (
                filteredEvents.map((event) => (
                  <tr key={event.id} className="border-t border-slate/10 text-slate hover:bg-secondary/5">
                    <td className="px-3 py-2">{new Date(event.captured_at).toLocaleString()}</td>
                    <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1">
                        <Monitor className="h-3.5 w-3.5" />
                        {event.site}
                      </span>
                    </td>
                    <td className="px-3 py-2">{event.event_type}</td>
                    <td className="px-3 py-2">
                      {event.decision ? (
                        <span className="inline-flex items-center gap-1 font-semibold">
                          {event.decision === "block" ? (
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                          ) : event.decision === "allow" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Shield className="h-3.5 w-3.5 text-amber-500" />
                          )}
                          {event.decision}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-2">{userLabel(event)}</td>
                    <td className="px-3 py-2 font-mono text-[11px]">{event.device_id}</td>
                    <td className="px-3 py-2">
                      {event.chain_valid ? (
                        <span className="text-emerald-600">valid</span>
                      ) : (
                      <span className="text-red-600">{event.chain_error || "invalid"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="space-y-1">
                        <p className="font-mono text-[11px]">{shortHash(transactionHash(event))}</p>
                        <p className="text-[10px] text-slate/70">
                          {hasFullContent(event) ? "full content" : "metadata/hash only"}
                        </p>
                      </div>
                    </td>
                    <td className="max-w-[260px] truncate px-3 py-2">
                      {event.message || "-"}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setSelectedEvent(event)}
                        className="inline-flex items-center gap-1 rounded-full border border-secondary/15 bg-white px-3 py-1 text-[11px] font-semibold text-secondary transition hover:bg-secondary/5"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedEvent ? (
        <div className="fixed inset-0 z-[100] flex justify-end bg-black/35 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Close transaction details overlay"
            className="absolute inset-0 cursor-default"
            onClick={() => setSelectedEvent(null)}
          />
          <aside
            className="relative z-10 h-full w-full max-w-[980px] overflow-y-auto border-l border-secondary/10 bg-white p-5 shadow-2xl"
            aria-label="Transaction details"
          >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-secondary/70">
                Transaction Details
              </p>
              <h3 className="mt-1 font-display text-2xl text-ink">
                {selectedEvent.event_type} on {selectedEvent.site}
              </h3>
              <p className="mt-1 text-sm text-slate">
                Event-chain hashes prove integrity. Prompt/response hashes are one-way
                fingerprints; the original value is only visible when full-content capture was
                enabled before the event was recorded.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedEvent(null)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-secondary/15 text-slate transition hover:bg-secondary/5"
              aria-label="Close transaction details"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <DetailRow label="Event ID" value={selectedEvent.event_id} mono />
            <DetailRow label="Captured" value={new Date(selectedEvent.captured_at).toLocaleString()} />
            <DetailRow label="User" value={userLabel(selectedEvent)} />
            <DetailRow label="Device" value={selectedEvent.device_id} mono />
            <DetailRow label="URL" value={selectedEvent.url} mono />
            <DetailRow label="Decision" value={selectedEvent.decision || "-"} />
            <DetailRow label="Transaction hash" value={transactionHash(selectedEvent)} mono />
            <DetailRow label="Event-chain hash" value={selectedEvent.event_hash} mono />
            <DetailRow label="Previous chain hash" value={selectedEvent.prev_event_hash} mono />
            <DetailRow label="Prompt length" value={promptLength(selectedEvent)} />
            <DetailRow label="Response length" value={responseLength(selectedEvent)} />
            <DetailRow
              label="Capture"
              value={hasFullContent(selectedEvent) ? "full_content" : "metadata_only"}
            />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div className="space-y-4">
              <ContentBlock label="Prompt Text" value={payloadString(selectedEvent, "prompt_text")} />
              <ContentBlock
                label="Response Text"
                value={payloadString(selectedEvent, "response_text")}
              />
              <ContentBlock
                label="User Justification"
                value={payloadString(selectedEvent, "user_justification")}
              />

              {!hasFullContent(selectedEvent) ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-semibold">Original content is not stored for this event.</p>
                  <p className="mt-1">
                    This event was captured in metadata-only mode. The hash cannot be decoded or
                    reversed; it can only be compared against the same original text hashed again.
                    Use full-content capture only if the deployment policy allows storing prompts
                    and responses.
                  </p>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <DetailRow
                  label="Prompt text hash"
                  value={selectedEvent.prompt_hash || payloadString(selectedEvent, "prompt_text_hash")}
                  mono
                />
                <DetailRow
                  label="Response text hash"
                  value={
                    selectedEvent.response_hash ||
                    payloadString(selectedEvent, "response_text_hash")
                  }
                  mono
                />
                <DetailRow
                  label="Justification hash"
                  value={payloadString(selectedEvent, "user_justification_hash")}
                  mono
                />
                <DetailRow label="Message" value={selectedEvent.message || "-"} />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate/60">
                Raw Payload JSON
              </p>
              <pre className="max-h-[520px] overflow-auto rounded-2xl border border-secondary/10 bg-slate/5 p-3 text-xs leading-5 text-ink">
                {JSON.stringify(selectedEvent.payload, null, 2)}
              </pre>
            </div>
          </div>
          </aside>
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-secondary/10 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-ink">Top Sites (14d)</h3>
          <div className="mt-3 space-y-2">
            {topSites.length === 0 ? (
              <p className="text-sm text-slate">No site activity yet.</p>
            ) : (
              topSites.map(([site, count]) => (
                <div
                  key={site}
                  className="flex items-center justify-between rounded-xl border border-secondary/10 px-3 py-2 text-sm"
                >
                  <span className="text-slate">{site}</span>
                  <span className="font-semibold text-secondary">{count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-secondary/10 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-ink">Daily Event Volume (14d)</h3>
          <div className="mt-3 space-y-2">
            {summary?.daily?.length ? (
              summary.daily.slice(-7).map((item) => (
                <div
                  key={item.day}
                  className="flex items-center justify-between rounded-xl border border-secondary/10 px-3 py-2 text-sm"
                >
                  <span className="text-slate">{item.day}</span>
                  <span className="font-semibold text-secondary">{item.count}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate">No daily data yet.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
