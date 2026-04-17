"use client";

import { useEffect, useState } from "react";
import { Download, FileCheck2, RefreshCw } from "lucide-react";

import {
  AuditEventItem,
  EvidencePackItem,
  createEvidencePack,
  exportAuditEvents,
  fetchAuditEvents,
  fetchEvidencePacks,
} from "src/lib/api";
import { useConsole } from "src/app/(console)/console-context";

const regimeOptions: EvidencePackItem["regime"][] = [
  "EU_AI_ACT",
  "GDPR",
  "CPRA_ADMT",
  "SEC_CYBER",
  "CUSTOM",
];

function shortHash(value?: string | null): string {
  if (!value) return "-";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

export default function EventsPage() {
  const { tenantId, selectedEnvironment, selectedProject } = useConsole();
  const [events, setEvents] = useState<AuditEventItem[]>([]);
  const [packs, setPacks] = useState<EvidencePackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [creatingPack, setCreatingPack] = useState(false);
  const [regime, setRegime] = useState<EvidencePackItem["regime"]>("EU_AI_ACT");
  const [error, setError] = useState<string | null>(null);

  const refreshData = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [eventRows, packRows] = await Promise.all([
        fetchAuditEvents(tenantId, {
          environment_id: selectedEnvironment || undefined,
          project_id: selectedProject || undefined,
          limit: 100,
        }),
        fetchEvidencePacks(tenantId, {
          environment_id: selectedEnvironment || undefined,
          project_id: selectedProject || undefined,
          limit: 20,
        }),
      ]);
      setEvents(eventRows);
      setPacks(packRows);
    } catch (err) {
      console.error(err);
      setError("Failed to load audit events or evidence packs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, selectedEnvironment, selectedProject]);

  const onExport = async () => {
    if (!tenantId) return;
    setExporting(true);
    try {
      const content = await exportAuditEvents(tenantId, {
        environment_id: selectedEnvironment || undefined,
        project_id: selectedProject || undefined,
        limit: 1000,
      });
      const blob = new Blob([content], { type: "application/x-ndjson" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "audit-events.jsonl";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError("Failed to export audit events.");
    } finally {
      setExporting(false);
    }
  };

  const onCreatePack = async () => {
    if (!tenantId) return;
    setCreatingPack(true);
    setError(null);
    try {
      await createEvidencePack({
        tenant_id: tenantId,
        regime,
        environment_id: selectedEnvironment || undefined,
        project_id: selectedProject || undefined,
      });
      await refreshData();
    } catch (err) {
      console.error(err);
      setError("Failed to create evidence pack.");
    } finally {
      setCreatingPack(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate">Events</p>
          <h2 className="font-display text-3xl text-ink">Audit Ledger</h2>
          <p className="text-sm text-slate">
            Tamper-evident interaction logs and generated evidence packs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshData()}
            className="inline-flex items-center gap-2 rounded-full border border-slate/15 bg-white px-4 py-2 text-xs font-semibold text-slate"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void onExport()}
            className="inline-flex items-center gap-2 rounded-full border border-slate/15 bg-white px-4 py-2 text-xs font-semibold text-slate"
            disabled={!tenantId || exporting}
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exporting..." : "Export JSONL"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <section className="rounded-3xl border border-slate/10 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-semibold text-ink">Recent Audit Events</h3>
          <span className="text-xs text-slate">{events.length} rows</span>
        </div>
        <div className="overflow-auto rounded-2xl border border-slate/10">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="bg-slate/5 text-[11px] uppercase tracking-[0.18em] text-slate/70">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Phase</th>
                <th className="px-3 py-2">Guardrail</th>
                <th className="px-3 py-2">Message</th>
                <th className="px-3 py-2">Hash</th>
                <th className="px-3 py-2">Redacted</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-6 text-slate" colSpan={7}>
                    Loading...
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate" colSpan={7}>
                    No audit events yet.
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={event.id} className="border-t border-slate/10 text-slate">
                    <td className="px-3 py-2">{new Date(event.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2 font-semibold text-ink">{event.action}</td>
                    <td className="px-3 py-2">{event.phase}</td>
                    <td className="px-3 py-2">
                      {event.guardrail_id} v{event.guardrail_version}
                    </td>
                    <td className="max-w-[320px] truncate px-3 py-2">
                      {event.message || event.decision_reason || "-"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px]">{shortHash(event.event_hash)}</td>
                    <td className="px-3 py-2">{event.redacted ? "Yes" : "No"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-slate/10 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h3 className="font-semibold text-ink">Evidence Packs</h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={regime}
              onChange={(event) => setRegime(event.target.value as EvidencePackItem["regime"])}
              className="h-9 rounded-full border border-slate/15 bg-white px-3 text-xs text-ink"
            >
              {regimeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void onCreatePack()}
              disabled={!tenantId || creatingPack}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-ink px-4 text-xs font-semibold text-white"
            >
              <FileCheck2 className="h-4 w-4" />
              {creatingPack ? "Generating..." : "Generate Pack"}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {packs.length === 0 ? (
            <p className="text-sm text-slate">No evidence packs generated yet.</p>
          ) : (
            packs.map((pack) => (
              <div
                key={pack.id}
                className="flex flex-col gap-2 rounded-2xl border border-slate/10 px-4 py-3 text-sm text-slate lg:flex-row lg:items-center lg:justify-between"
              >
                <div>
                  <p className="font-semibold text-ink">
                    {pack.regime} • {pack.status}
                  </p>
                  <p className="text-xs">
                    {new Date(pack.created_at).toLocaleString()}
                    {pack.environment_id ? ` • ${pack.environment_id}` : ""}
                    {pack.project_id ? ` / ${pack.project_id}` : ""}
                  </p>
                </div>
                <div className="text-xs">
                  Events:{" "}
                  {typeof pack.summary?.total_events === "number"
                    ? String(pack.summary.total_events)
                    : "-"}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
