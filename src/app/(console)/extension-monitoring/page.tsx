"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Shield, Monitor, AlertTriangle, CheckCircle2 } from "lucide-react";

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate">Organization</p>
          <h2 className="font-display text-3xl text-ink">Extension Monitoring</h2>
          <p className="text-sm text-slate">
            Browser-level AI usage telemetry from the UMAI extension.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/extension/connect"
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-ink px-4 py-2 text-xs font-semibold text-white"
          >
            Connect Extension
          </Link>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || !tenantId}
            className="inline-flex items-center gap-2 rounded-full border border-slate/15 bg-white px-4 py-2 text-xs font-semibold text-slate"
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
        <div className="rounded-2xl border border-slate/10 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate">Events (14d)</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {summary?.total_events ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-slate/10 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate">Devices</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
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

      <section className="rounded-3xl border border-slate/10 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select
            value={siteFilter}
            onChange={(event) => setSiteFilter(event.target.value)}
            className="h-9 rounded-full border border-slate/15 bg-white px-3 text-xs text-ink"
          >
            <option value="all">All sites</option>
            <option value="chatgpt">ChatGPT</option>
            <option value="gemini">Gemini</option>
            <option value="claude">Claude</option>
          </select>
          <select
            value={decisionFilter}
            onChange={(event) => setDecisionFilter(event.target.value)}
            className="h-9 rounded-full border border-slate/15 bg-white px-3 text-xs text-ink"
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
            className="h-9 rounded-full border border-slate/15 bg-white px-3 text-xs text-ink"
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
            className="h-9 min-w-[220px] rounded-full border border-slate/15 bg-white px-3 text-xs text-ink placeholder:text-slate/60"
          />
        </div>

        <div className="overflow-auto rounded-2xl border border-slate/10">
          <table className="w-full min-w-[1100px] text-left text-xs">
            <thead className="bg-slate/5 text-[11px] uppercase tracking-[0.18em] text-slate/70">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Site</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Decision</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Device</th>
                <th className="px-3 py-2">Chain</th>
                <th className="px-3 py-2">Hash</th>
                <th className="px-3 py-2">Message</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-6 text-slate" colSpan={9}>
                    Loading...
                  </td>
                </tr>
              ) : filteredEvents.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate" colSpan={9}>
                    {userFilter.trim().length > 0
                      ? "No extension events match current user search."
                      : "No extension events found."}
                  </td>
                </tr>
              ) : (
                filteredEvents.map((event) => (
                  <tr key={event.id} className="border-t border-slate/10 text-slate">
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
                    <td className="px-3 py-2 font-mono text-[11px]">{shortHash(event.event_hash)}</td>
                    <td className="max-w-[260px] truncate px-3 py-2">
                      {event.message || "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate/10 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-ink">Top Sites (14d)</h3>
          <div className="mt-3 space-y-2">
            {topSites.length === 0 ? (
              <p className="text-sm text-slate">No site activity yet.</p>
            ) : (
              topSites.map(([site, count]) => (
                <div
                  key={site}
                  className="flex items-center justify-between rounded-xl border border-slate/10 px-3 py-2 text-sm"
                >
                  <span className="text-slate">{site}</span>
                  <span className="font-semibold text-ink">{count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate/10 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-ink">Daily Event Volume (14d)</h3>
          <div className="mt-3 space-y-2">
            {summary?.daily?.length ? (
              summary.daily.slice(-7).map((item) => (
                <div
                  key={item.day}
                  className="flex items-center justify-between rounded-xl border border-slate/10 px-3 py-2 text-sm"
                >
                  <span className="text-slate">{item.day}</span>
                  <span className="font-semibold text-ink">{item.count}</span>
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
