"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw, Search } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useConsole } from "src/app/(console)/console-context";
import {
  type ExtensionEventItem,
  type ExtensionSummary,
  fetchExtensionEvents,
  fetchExtensionSummary,
} from "src/lib/api";
import {
  BTN_SECONDARY,
  CopyButton,
  EmptyState,
  INPUT,
  InlineNotice,
  KeyValue,
  SELECT,
  SectionCard,
  TAG,
} from "src/app/(console)/console-ui";
import ExtensionGuardrailControl from "./extension-guardrail-control";

const SUMMARY_DAYS = 14;
const EVENT_LIMIT = 250;
const BLUE = "#0f62fe";
const GRID = "#e5e7eb";
const TICK = "#6b7280";

const SITE_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  claude: "Claude",
};

// Extension kararları guardrail aksiyonlarından farklı bir sözlük kullanır.
const DECISION_META: Record<string, { label: string; tag: string }> = {
  allow: { label: "Allowed", tag: "bg-emerald-50 text-emerald-700" },
  warn: { label: "Warned", tag: "bg-amber-50 text-amber-800" },
  block: { label: "Blocked", tag: "bg-red-50 text-red-700" },
  redact: { label: "Redacted", tag: "bg-secondary/10 text-secondary" },
  justify: { label: "Justification required", tag: "bg-violet-50 text-violet-700" },
};

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const fullDateFormatter = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium" });
const dayFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const numberFormatter = new Intl.NumberFormat("en-US");

function siteLabel(site: string) {
  return SITE_LABELS[site] ?? site;
}

function shortHash(value?: string | null): string {
  if (!value) return "—";
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function userLabel(event: ExtensionEventItem): string {
  const payloadName = event.payload?.user_name;
  if (typeof payloadName === "string" && payloadName.trim()) return payloadName.trim();
  if (event.user_email?.trim()) return event.user_email.trim();
  if (event.user_idp_subject?.trim()) return event.user_idp_subject.trim();
  return "—";
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

function hasFullContent(event: ExtensionEventItem): boolean {
  return Boolean(
    payloadString(event, "prompt_text") ||
      payloadString(event, "response_text") ||
      payloadString(event, "user_justification")
  );
}

function DecisionTag({ decision }: { decision?: string | null }) {
  if (!decision) return <span className="text-gray-400">—</span>;
  const meta = DECISION_META[decision];
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${meta?.tag ?? "bg-gray-100 text-gray-700"}`}>
      {meta?.label ?? decision}
    </span>
  );
}

function ContentBlock({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <SectionCard title={label}>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-sans text-sm leading-6 text-gray-900">{value}</pre>
    </SectionCard>
  );
}

export default function ExtensionMonitoringPage() {
  const { tenant, tenantId } = useConsole();
  const [events, setEvents] = useState<ExtensionEventItem[]>([]);
  const [summary, setSummary] = useState<ExtensionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [siteFilter, setSiteFilter] = useState("all");
  const [decisionFilter, setDecisionFilter] = useState("all");
  const [chainFilter, setChainFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("");
  const [selected, setSelected] = useState<ExtensionEventItem | null>(null);
  const [rawOpen, setRawOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [summaryResult, eventRows] = await Promise.all([
        fetchExtensionSummary(tenantId, SUMMARY_DAYS),
        fetchExtensionEvents(tenantId, {
          site: siteFilter !== "all" ? siteFilter : undefined,
          decision: decisionFilter !== "all" ? decisionFilter : undefined,
          chain_valid: chainFilter === "all" ? undefined : chainFilter === "valid",
          limit: EVENT_LIMIT,
        }),
      ]);
      setSummary(summaryResult);
      setEvents(eventRows);
    } catch (err) {
      console.error(err);
      setError("Extension data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [chainFilter, decisionFilter, siteFilter, tenantId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredEvents = useMemo(() => {
    const query = userFilter.trim().toLowerCase();
    if (!query) return events;
    return events.filter((event) =>
      [
        typeof event.payload?.user_name === "string" ? event.payload.user_name : "",
        event.user_email ?? "",
        event.user_idp_subject ?? "",
        event.device_id,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [events, userFilter]);

  useEffect(() => {
    if (!selected) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selected]);

  const sites = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.by_site).sort((a, b) => b[1] - a[1]);
  }, [summary]);
  const maxSiteCount = Math.max(1, ...sites.map(([, count]) => count));

  const daily = useMemo(
    () =>
      (summary?.daily ?? []).map((item) => ({
        day: item.day,
        label: dayFormatter.format(new Date(item.day)),
        count: item.count,
      })),
    [summary]
  );
  const hasDaily = daily.some((item) => item.count > 0);

  const stats = [
    { label: `Events (${SUMMARY_DAYS}d)`, value: summary?.total_events ?? 0 },
    { label: "Users", value: summary?.unique_users ?? 0 },
    { label: "Devices", value: summary?.unique_devices ?? 0 },
    { label: "Blocked", value: summary?.blocked_events ?? 0 },
    { label: "Warned", value: summary?.warned_events ?? 0 },
    { label: "Redacted", value: summary?.redacted_events ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-gray-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Browser extension</h1>
          <p className="mt-1 text-sm text-gray-500">
            AI usage captured by the UMAI extension on ChatGPT, Gemini and Claude · last {SUMMARY_DAYS} days
            {summary?.last_event_at && ` · last event ${fullDateFormatter.format(new Date(summary.last_event_at))}`}
          </p>
        </div>
        <button type="button" className={BTN_SECONDARY} onClick={() => void refresh()} disabled={loading || !tenantId}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </header>

      {error && <InlineNotice tone="error">{error}</InlineNotice>}

      <section className="grid grid-cols-2 divide-y divide-gray-200 rounded border border-gray-200 bg-white sm:grid-cols-3 sm:divide-x xl:grid-cols-6 xl:divide-y-0">
        {stats.map((item) => (
          <div key={item.label} className="px-5 py-4">
            <p className="text-xs font-medium text-gray-500">{item.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
              {loading && !summary ? "—" : numberFormatter.format(item.value)}
            </p>
          </div>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <SectionCard title="Events per day" description={`Last ${SUMMARY_DAYS} days`}>
          <div className="h-52">
            {loading && !summary ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">Loading…</div>
            ) : !hasDaily ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                No extension events in the last {SUMMARY_DAYS} days.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: TICK, fontSize: 11 }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: TICK, fontSize: 11 }} />
                  <Tooltip
                    formatter={(value) => [numberFormatter.format(Number(value)), "Events"]}
                    labelStyle={{ color: "#111827", fontWeight: 600, fontSize: 12 }}
                    itemStyle={{ fontSize: 12 }}
                    contentStyle={{ borderRadius: 4, border: `1px solid ${GRID}`, boxShadow: "none" }}
                    cursor={{ fill: "#f3f4f6" }}
                  />
                  <Bar dataKey="count" fill={BLUE} radius={[2, 2, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>

        <SectionCard title="By site" description="Share of events">
          {sites.length === 0 ? (
            <p className="text-sm text-gray-500">No site activity yet.</p>
          ) : (
            <div className="space-y-3">
              {sites.map(([site, count]) => (
                <div key={site}>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-gray-900">{siteLabel(site)}</span>
                    <span className="tabular-nums text-gray-500">
                      {numberFormatter.format(count)} ·{" "}
                      {summary?.total_events ? Math.round((count / summary.total_events) * 100) : 0}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 bg-gray-100">
                    <div className="h-full bg-secondary" style={{ width: `${(count / maxSiteCount) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {summary && Object.keys(summary.by_decision).length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-gray-200 pt-4">
              {Object.entries(summary.by_decision)
                .sort((a, b) => b[1] - a[1])
                .map(([decision, count]) => (
                  <span key={decision} className={TAG}>
                    {DECISION_META[decision]?.label ?? decision} · {numberFormatter.format(count)}
                  </span>
                ))}
            </div>
          )}
        </SectionCard>
      </div>

      <ExtensionGuardrailControl
        tenantId={tenantId}
        environmentId={tenant?.environment_id ?? null}
        projectId={tenant?.project_id ?? null}
      />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-base font-semibold text-gray-900">Events</h2>
          <div className="relative min-w-[240px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              className={`${INPUT} pl-8`}
              placeholder="Search user or device"
              value={userFilter}
              onChange={(event) => setUserFilter(event.target.value)}
              aria-label="Search events"
            />
          </div>
          <select className={SELECT} value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)} aria-label="Filter by site">
            <option value="all">All sites</option>
            <option value="chatgpt">ChatGPT</option>
            <option value="gemini">Gemini</option>
            <option value="claude">Claude</option>
          </select>
          <select className={SELECT} value={decisionFilter} onChange={(event) => setDecisionFilter(event.target.value)} aria-label="Filter by decision">
            <option value="all">All decisions</option>
            {Object.entries(DECISION_META).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </select>
          <select className={SELECT} value={chainFilter} onChange={(event) => setChainFilter(event.target.value)} aria-label="Filter by chain status">
            <option value="all">All chain states</option>
            <option value="valid">Chain valid</option>
            <option value="invalid">Chain broken</option>
          </select>
        </div>

        {!loading && events.length === 0 ? (
          <EmptyState>
            No extension events match these filters. Events arrive as soon as a managed browser with the extension
            visits ChatGPT, Gemini or Claude.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Time</th>
                  <th className="px-4 py-2.5 font-medium">Site</th>
                  <th className="px-4 py-2.5 font-medium">Event</th>
                  <th className="px-4 py-2.5 font-medium">Decision</th>
                  <th className="px-4 py-2.5 font-medium">User</th>
                  <th className="px-4 py-2.5 font-medium">Device</th>
                  <th className="px-4 py-2.5 font-medium">Integrity</th>
                  <th className="px-4 py-2.5 font-medium">Content</th>
                  <th className="px-4 py-2.5 font-medium">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && events.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                      Loading events…
                    </td>
                  </tr>
                ) : filteredEvents.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                      No events match the search.
                    </td>
                  </tr>
                ) : (
                  filteredEvents.map((event) => (
                    <tr
                      key={event.id}
                      onClick={() => {
                        setSelected(event);
                        setRawOpen(false);
                      }}
                      className="cursor-pointer transition-colors hover:bg-gray-50"
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-gray-600" title={fullDateFormatter.format(new Date(event.captured_at))}>
                        {timeFormatter.format(new Date(event.captured_at))}
                      </td>
                      <td className="px-4 py-2.5 text-gray-900">{siteLabel(event.site)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{event.event_type}</td>
                      <td className="px-4 py-2.5">
                        <DecisionTag decision={event.decision} />
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-2.5 text-gray-900" title={userLabel(event)}>
                        {userLabel(event)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-600" title={event.device_id}>
                        {shortHash(event.device_id)}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-medium">
                        {event.chain_valid ? (
                          <span className="text-emerald-700">Chain valid</span>
                        ) : (
                          <span className="text-red-700" title={event.chain_error || undefined}>
                            Chain broken
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-600">
                        {hasFullContent(event) ? "Full content" : "Hash only"}
                      </td>
                      <td className="max-w-[260px] truncate px-4 py-2.5 text-gray-600" title={event.message || undefined}>
                        {event.message || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        {!loading && events.length > 0 && (
          <p className="text-xs text-gray-500">
            {filteredEvents.length} of {events.length} events
            {events.length >= EVENT_LIMIT && ` · only the latest ${EVENT_LIMIT} are loaded`}
          </p>
        )}
      </section>

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-gray-900/40" onClick={() => setSelected(null)}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Event details"
            className="flex h-full w-full max-w-[880px] flex-col border-l border-gray-200 bg-white"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900">
                  {selected.event_type} · {siteLabel(selected.site)}
                </h2>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  {fullDateFormatter.format(new Date(selected.captured_at))}
                  <DecisionTag decision={selected.decision} />
                  <span className={TAG}>{hasFullContent(selected) ? "Full content" : "Hash only"}</span>
                  <span className="inline-flex items-center gap-1 font-mono">
                    {selected.event_id}
                    <CopyButton value={selected.event_id} label="Copy event ID" />
                  </span>
                </p>
              </div>
              <button type="button" className={BTN_SECONDARY} onClick={() => setSelected(null)}>
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <KeyValue label="User">{userLabel(selected)}</KeyValue>
                <KeyValue label="Device">
                  <span className="break-all font-mono text-xs">{selected.device_id}</span>
                </KeyValue>
                <KeyValue label="URL">
                  <span className="break-all font-mono text-xs">{selected.url}</span>
                </KeyValue>
                <KeyValue label="Prompt length">
                  {selected.prompt_len ?? payloadNumber(selected, "prompt_text_len") ?? "—"}
                </KeyValue>
                <KeyValue label="Response length">
                  {selected.response_len ?? payloadNumber(selected, "response_text_len") ?? "—"}
                </KeyValue>
                {!(selected.message && selected.decision && selected.decision !== "allow") && (
                  <KeyValue label="Message">{selected.message || "—"}</KeyValue>
                )}
              </div>

              {selected.message && selected.decision && selected.decision !== "allow" && (
                <InlineNotice tone={selected.decision === "block" ? "error" : "info"}>
                  <span className="font-medium">{DECISION_META[selected.decision]?.label ?? selected.decision}:</span>{" "}
                  {selected.message}
                </InlineNotice>
              )}

              <ContentBlock label="Prompt" value={payloadString(selected, "prompt_text")} />
              <ContentBlock label="Response" value={payloadString(selected, "response_text")} />
              <ContentBlock label="User justification" value={payloadString(selected, "user_justification")} />

              {!hasFullContent(selected) && (
                <InlineNotice tone="info">
                  This event was captured in metadata-only mode: prompt and response are stored as one-way hashes and
                  cannot be recovered. Enable full-content capture in the extension policy if the deployment allows
                  storing content.
                </InlineNotice>
              )}

              <SectionCard title="Integrity" description="Each event is chained to the previous one; a valid chain proves nothing was altered or removed.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <KeyValue label="Chain">
                    {selected.chain_valid ? (
                      <span className="font-medium text-emerald-700">Valid</span>
                    ) : (
                      <span className="font-medium text-red-700">Broken{selected.chain_error ? ` — ${selected.chain_error}` : ""}</span>
                    )}
                  </KeyValue>
                  <KeyValue label="Transaction hash">
                    <span className="break-all font-mono text-xs">{transactionHash(selected) ?? "—"}</span>
                  </KeyValue>
                  <KeyValue label="Event hash">
                    <span className="break-all font-mono text-xs">{selected.event_hash}</span>
                  </KeyValue>
                  <KeyValue label="Previous event hash">
                    <span className="break-all font-mono text-xs">{selected.prev_event_hash ?? "—"}</span>
                  </KeyValue>
                  <KeyValue label="Prompt hash">
                    <span className="break-all font-mono text-xs">
                      {selected.prompt_hash || payloadString(selected, "prompt_text_hash") || "—"}
                    </span>
                  </KeyValue>
                  <KeyValue label="Response hash">
                    <span className="break-all font-mono text-xs">
                      {selected.response_hash || payloadString(selected, "response_text_hash") || "—"}
                    </span>
                  </KeyValue>
                </div>
              </SectionCard>

              <div>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900"
                  onClick={() => setRawOpen((open) => !open)}
                  aria-expanded={rawOpen}
                >
                  {rawOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  Raw payload
                </button>
                {rawOpen && (
                  <pre className="mt-2 max-h-[420px] overflow-auto rounded bg-gray-50 px-4 py-3 font-mono text-xs leading-5 text-gray-700">
                    {JSON.stringify(selected.payload, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
