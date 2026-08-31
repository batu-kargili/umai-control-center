"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  Laptop,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { useConsole } from "src/app/(console)/console-context";
import { useUser } from "src/lib/auth-client";
import type { SensorDownloadSessionItem } from "src/lib/api";

const TERMINAL_STATUSES = new Set(["event_seen", "failed", "expired"]);

function formatTime(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function statusLabel(status?: string | null): string {
  if (!status) return "not requested";
  return status.replace(/_/g, " ");
}

function statusClass(status?: string | null): string {
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700";
  if (status === "expired") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "event_seen" || status === "heartbeat_seen" || status === "enrolled") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  return "border-secondary/20 bg-secondary/5 text-secondary";
}

function Milestone({
  label,
  complete,
  pending,
}: {
  label: string;
  complete: boolean;
  pending?: boolean;
}) {
  const Icon = complete ? CheckCircle2 : pending ? Clock3 : XCircle;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-secondary/10 bg-white px-3 py-2 text-sm">
      <Icon className={`h-4 w-4 ${complete ? "text-emerald-600" : pending ? "text-amber-500" : "text-slate/35"}`} />
      <span className={complete ? "font-semibold text-ink" : "text-slate"}>{label}</span>
    </div>
  );
}

export default function WindowsSensorDownloadPage() {
  const { tenant, tenantReady } = useConsole();
  const { user } = useUser();
  const [session, setSession] = useState<SensorDownloadSessionItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const installerHref = session
    ? `/api/sensor/download/windows/session/${session.id}/installer`
    : "";

  const canDownload = session?.status === "ready" || session?.status === "downloaded";
  const status = session?.status;

  const milestones = useMemo(
    () => ({
      requested: !!session,
      generated: !!session?.artifact_id,
      downloaded: !!session?.downloaded_at || ["downloaded", "enrolled", "heartbeat_seen", "event_seen"].includes(status || ""),
      enrolled: !!session?.device_id || ["enrolled", "heartbeat_seen", "event_seen"].includes(status || ""),
      heartbeat: !!session?.first_heartbeat_at || status === "heartbeat_seen" || status === "event_seen",
      event: !!session?.first_event_at || status === "event_seen",
    }),
    [session, status]
  );

  const refreshSession = async (sessionId: string, silent = false) => {
    if (!silent) setPolling(true);
    try {
      const response = await fetch(`/api/sensor/download/windows/session/${sessionId}/status`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Status refresh failed");
      }
      setSession((await response.json()) as SensorDownloadSessionItem);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status refresh failed");
    } finally {
      if (!silent) setPolling(false);
    }
  };

  useEffect(() => {
    if (!session?.id || TERMINAL_STATUSES.has(session.status)) return;
    const timer = setInterval(() => {
      void refreshSession(session.id, true);
    }, 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.status]);

  const createSession = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/sensor/download/windows/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message || body?.error || "Installer generation failed");
      }
      setSession((await response.json()) as SensorDownloadSessionItem);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Installer generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-secondary/70">Endpoint Sensor</p>
          <h2 className="font-display text-3xl text-ink">Windows Installer</h2>
          <p className="text-sm text-slate">
            Local Smarttech POC installer for Windows 10 and Windows 11 devices.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {session ? (
            <button
              type="button"
              onClick={() => void refreshSession(session.id)}
              disabled={polling}
              className="inline-flex items-center gap-2 rounded-lg border border-secondary/15 bg-white px-4 py-2 text-xs font-semibold text-secondary transition hover:bg-secondary/5 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${polling ? "animate-spin" : ""}`} />
              Refresh
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void createSession()}
            disabled={loading || !tenantReady || !tenant?.tenant_id}
            className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-secondary/90 disabled:opacity-50"
          >
            <ShieldCheck className="h-4 w-4" />
            {loading ? "Generating..." : "Generate Installer"}
          </button>
          {canDownload ? (
            <a
              href={installerHref}
              className="inline-flex items-center gap-2 rounded-lg border border-secondary/15 bg-white px-4 py-2 text-xs font-semibold text-secondary transition hover:bg-secondary/5"
            >
              <Download className="h-4 w-4" />
              Download MSI
            </a>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-secondary/10 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-ink">Session</h3>
              <p className="text-xs text-slate">
                {user?.email || user?.username || "Signed-in employee"}
              </p>
            </div>
            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(status)}`}>
              {statusLabel(status)}
            </span>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Milestone label="Requested" complete={milestones.requested} />
            <Milestone label="Installer generated" complete={milestones.generated} pending={!!session && !milestones.generated} />
            <Milestone label="Downloaded" complete={milestones.downloaded} pending={canDownload && !milestones.downloaded} />
            <Milestone label="Device enrolled" complete={milestones.enrolled} pending={milestones.downloaded && !milestones.enrolled} />
            <Milestone label="Heartbeat received" complete={milestones.heartbeat} pending={milestones.enrolled && !milestones.heartbeat} />
            <Milestone label="Event uploaded" complete={milestones.event} pending={milestones.heartbeat && !milestones.event} />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-secondary/10 bg-slate/5 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate/60">Session ID</p>
              <p className="mt-1 break-all font-mono text-xs text-ink">{session?.id || "-"}</p>
            </div>
            <div className="rounded-lg border border-secondary/10 bg-slate/5 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate/60">Device ID</p>
              <p className="mt-1 break-all font-mono text-xs text-ink">{session?.device_id || "-"}</p>
            </div>
            <div className="rounded-lg border border-secondary/10 bg-slate/5 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate/60">Created</p>
              <p className="mt-1 text-xs text-ink">{formatTime(session?.created_at)}</p>
            </div>
            <div className="rounded-lg border border-secondary/10 bg-slate/5 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate/60">Installer Expires</p>
              <p className="mt-1 text-xs text-ink">{formatTime(session?.artifact_expires_at)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-secondary/10 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Laptop className="h-5 w-5 text-secondary" />
            <h3 className="font-semibold text-ink">POC Defaults</h3>
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate">
            <div className="rounded-lg border border-secondary/10 px-3 py-2">
              <p className="font-semibold text-ink">Windows 10 / Windows 11</p>
              <p className="text-xs">Per-machine MSI with the visible UMAI tray agent.</p>
            </div>
            <div className="rounded-lg border border-secondary/10 px-3 py-2">
              <p className="font-semibold text-ink">Metadata-only posture</p>
              <p className="text-xs">No TLS interception or prompt/response body capture in this POC flow.</p>
            </div>
            <div className="rounded-lg border border-secondary/10 px-3 py-2">
              <p className="font-semibold text-ink">Short-lived token</p>
              <p className="text-xs">The enrollment token is baked into this one installer and expires quickly.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
