"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Laptop, RefreshCw, ShieldX, X } from "lucide-react";

import { useConsole } from "src/app/(console)/console-context";
import {
  FleetDevice,
  FleetDeviceDetail,
  fetchFleetDevice,
  fetchFleetDevices,
  revokeFleetDevice,
} from "src/lib/api";

const HEALTH = ["", "healthy", "degraded", "error", "stale", "revoked"];

function when(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function badge(value: string) {
  if (value === "healthy") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "degraded" || value === "stale") return "border-amber-200 bg-amber-50 text-amber-700";
  if (value === "error" || value === "revoked") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default function CollectorsPage() {
  const { tenantId } = useConsole();
  const [items, setItems] = useState<FleetDevice[]>([]);
  const [health, setHealth] = useState("");
  const [source, setSource] = useState("");
  const [selected, setSelected] = useState<FleetDeviceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchFleetDevices(tenantId, { health, source });
      setItems(page.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load collectors");
    } finally {
      setLoading(false);
    }
  }, [tenantId, health, source]);

  useEffect(() => { void load(); }, [load]);

  const sources = useMemo(
    () => Array.from(new Set(items.flatMap((item) => item.supported_sources))).sort(),
    [items]
  );

  const open = async (device: FleetDevice) => {
    if (!tenantId) return;
    setError(null);
    try { setSelected(await fetchFleetDevice(tenantId, device.device_id)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Failed to load collector"); }
  };

  const revoke = async () => {
    if (!tenantId || !selected || reason.trim().length < 3) return;
    try {
      const detail = await revokeFleetDevice(tenantId, selected.device_id, reason.trim());
      setSelected(detail);
      setConfirming(false);
      setReason("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to revoke collector");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-secondary">ADR operations</p>
          <h1 className="mt-2 text-3xl font-bold text-ink">Collector fleet</h1>
          <p className="mt-2 text-sm text-slate">Freshness, ingest health, source coverage and device lifecycle.</p>
        </div>
        <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-secondary/20 px-4 py-2 text-sm font-semibold text-secondary hover:bg-secondary/5">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-3 rounded-2xl border border-secondary/10 bg-white p-4 shadow-sm">
        <select aria-label="Health filter" value={health} onChange={(event) => setHealth(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
          {HEALTH.map((value) => <option key={value} value={value}>{value || "All health states"}</option>)}
        </select>
        <select aria-label="Source filter" value={source} onChange={(event) => setSource(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">All observed sources</option>
          {sources.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <span className="ml-auto self-center text-sm text-slate">{items.length} collectors</span>
      </div>

      {error && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertTriangle className="h-4 w-4" />{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-secondary/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate"><tr><th className="px-5 py-3">Device</th><th className="px-5 py-3">Health</th><th className="px-5 py-3">Version / OS</th><th className="px-5 py-3">Sources</th><th className="px-5 py-3">Last seen</th><th className="px-5 py-3">Last ingest</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {!loading && items.length === 0 && <tr><td colSpan={6} className="px-5 py-14 text-center text-slate">No collectors match these filters.</td></tr>}
            {items.map((item) => (
              <tr key={item.device_id} onClick={() => void open(item)} className="cursor-pointer hover:bg-secondary/[0.03]">
                <td className="px-5 py-4"><div className="flex items-center gap-3"><Laptop className="h-4 w-4 text-secondary" /><div><div className="font-semibold text-ink">{item.hostname || item.device_id}</div><div className="text-xs text-slate">{item.device_id}</div></div></div></td>
                <td className="px-5 py-4"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badge(item.health_status)}`}>{item.health_status}</span>{item.status_detail && <div className="mt-1 text-xs text-slate">{item.status_detail}</div>}</td>
                <td className="px-5 py-4"><div>{item.collector_version || "Unknown"}</div><div className="text-xs text-slate">{item.os} {item.os_version}</div></td>
                <td className="px-5 py-4 text-xs text-slate">{item.observed_sources.join(", ") || "None observed"}</td>
                <td className="px-5 py-4 text-xs text-slate">{when(item.last_seen_at)}</td>
                <td className="px-5 py-4 text-xs text-slate">{when(item.last_ingest_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && <div className="fixed inset-0 z-[80] flex justify-end bg-black/25" onClick={() => setSelected(null)}>
        <aside className="h-full w-full max-w-xl overflow-y-auto bg-white p-7 shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-start justify-between"><div><p className="text-xs uppercase tracking-widest text-secondary">Collector detail</p><h2 className="mt-2 text-2xl font-bold">{selected.hostname || selected.device_id}</h2><p className="text-xs text-slate">{selected.device_id}</p></div><button title="Close" onClick={() => setSelected(null)}><X className="h-5 w-5" /></button></div>
          <div className="mt-6 grid grid-cols-2 gap-3 text-sm">{[["Health", selected.health_status],["Status", selected.status],["Collection", selected.collection_mode],["Queue", String(selected.queue_depth)],["Last seen", when(selected.last_seen_at)],["Last ingest", when(selected.last_ingest_at)]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate">{label}</div><div className="mt-1 font-semibold">{value}</div></div>)}</div>
          <div className="mt-6"><h3 className="font-semibold">Capabilities</h3><p className="mt-2 text-sm text-slate">Supported: {selected.supported_sources.join(", ") || "None"}</p><p className="mt-1 text-sm text-slate">Observed: {selected.observed_sources.join(", ") || "None"}</p></div>
          <div className="mt-6"><h3 className="font-semibold">Audit trail</h3><div className="mt-2 space-y-2">{selected.audit_events.map((event, index) => <div key={`${event.event_type}-${index}`} className="rounded-xl border border-slate-100 p-3 text-sm"><div className="flex justify-between gap-2"><span className="font-semibold">{event.event_type.replace(/_/g, " ")}</span><span className="text-xs text-slate">{when(event.occurred_at)}</span></div><div className="mt-1 text-xs text-slate">{event.actor}</div></div>)}</div></div>
          {selected.status !== "revoked" && <div className="mt-8 border-t border-red-100 pt-6">{!confirming ? <button onClick={() => setConfirming(true)} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"><ShieldX className="h-4 w-4" /> Revoke collector</button> : <div className="rounded-xl border border-red-200 bg-red-50 p-4"><p className="text-sm font-semibold text-red-800">Revocation immediately blocks renewal and ingest.</p><textarea aria-label="Revocation reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason (required)" className="mt-3 w-full rounded-lg border border-red-200 p-3 text-sm" /><div className="mt-3 flex gap-2"><button disabled={reason.trim().length < 3} onClick={() => void revoke()} className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Confirm revoke</button><button onClick={() => setConfirming(false)} className="rounded-lg px-3 py-2 text-sm">Cancel</button></div></div>}</div>}
        </aside>
      </div>}
    </div>
  );
}
