"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, EyeOff, RefreshCw, Trash2, X } from "lucide-react";

import {
    AgentSessionDetail,
    AgentSessionSummary,
    SessionFilters,
    SiemDeliveryStats,
    TranscriptResponse,
    TranscriptUnavailable,
    deleteTranscript,
    fetchAgentSession,
    fetchAgentSessions,
    fetchSiemDeliveryStats,
    fetchTranscript,
} from "src/lib/api";
import { useConsole } from "src/app/(console)/console-context";

const PAGE_SIZE = 50;

const VERDICT_STYLES: Record<string, string> = {
    malicious: "bg-danger/15 text-danger border-danger/30",
    suspicious: "bg-amber-100 text-amber-700 border-amber-200",
    benign: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const STATUS_STYLES: Record<string, string> = {
    analysis_failed: "bg-danger/15 text-danger border-danger/30",
    ingested: "bg-slate/10 text-slate border-slate/20",
    triaging: "bg-blue-50 text-blue-700 border-blue-200",
    reasoning: "bg-blue-50 text-blue-700 border-blue-200",
    triage_suspicious: "bg-amber-100 text-amber-700 border-amber-200",
    triage_benign: "bg-emerald-50 text-emerald-700 border-emerald-200",
    analyzed: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

// What each mode means for the analyst standing in front of an empty
// transcript pane. Saying "no data" would leave them chasing a bug that is
// actually a policy.
const MODE_EXPLANATION: Record<string, string> = {
    posture_only:
        "This tenant collects posture only: which permissions the agent ran with, and nothing that was said.",
    metadata:
        "This tenant collects metadata only: who ran what, when, and how much — but no message or tool content.",
    full_session: "This tenant collects full session content.",
};

const ANALYSIS_STATUSES = [
    "ingested",
    "triaging",
    "triage_benign",
    "triage_suspicious",
    "reasoning",
    "analyzed",
    "analysis_failed",
];

const VERDICTS = ["benign", "suspicious", "malicious", "inconclusive"];

function humanise(value?: string | null): string {
    if (!value) return "-";
    return value.replace(/_/g, " ");
}

function formatTime(value?: string | null): string {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
}

function formatBytes(value?: number | null): string {
    if (!value) return "-";
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function Pill({ label, styles }: { label: string; styles?: string }) {
    return (
        <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${
                styles || "border-slate/20 bg-slate/10 text-slate"
            }`}
        >
            {label}
        </span>
    );
}

export default function SessionsPage() {
    // `useSearchParams` opts a route into client rendering; the boundary keeps
    // the rest of the page pre-renderable.
    return (
        <Suspense fallback={<p className="text-sm text-slate">Loading sessions...</p>}>
            <SessionList />
        </Suspense>
    );
}

function SessionList() {
    const { tenantId } = useConsole();
    const searchParams = useSearchParams();
    // Arriving from a finding: open that session straight away.
    const linkedSession = searchParams.get("session");

    const [filters, setFilters] = useState<SessionFilters>({});
    const [page, setPage] = useState(0);
    const [rows, setRows] = useState<AgentSessionSummary[]>([]);
    const [total, setTotal] = useState(0);
    const [delivery, setDelivery] = useState<SiemDeliveryStats | null>(null);
    const [selectedKey, setSelectedKey] = useState<string | null>(linkedSession);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const query = useMemo(
        () => ({ ...filters, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
        [filters, page]
    );

    const refresh = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        setError(null);
        try {
            const [sessionPage, stats] = await Promise.all([
                fetchAgentSessions(tenantId, query),
                fetchSiemDeliveryStats(tenantId).catch(() => null),
            ]);
            setRows(sessionPage.items);
            setTotal(sessionPage.total);
            setDelivery(stats);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load sessions");
        } finally {
            setLoading(false);
        }
    }, [tenantId, query]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const setFilter = (key: keyof SessionFilters, value: string) => {
        setPage(0);
        setFilters((current) => {
            const next = { ...current };
            if (value) {
                (next as Record<string, string>)[key] = value;
            } else {
                delete next[key];
            }
            return next;
        });
    };

    const showing = rows.length
        ? `${page * PAGE_SIZE + 1}-${page * PAGE_SIZE + rows.length} of ${total}`
        : `0 of ${total}`;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate">Detection</p>
                    <h2 className="font-display text-3xl text-ink">Agent Sessions</h2>
                    <p className="text-sm text-slate">
                        The evidence behind the findings, and where each one stands with the SIEM.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <DeliveryPanel stats={delivery} />
                    <button
                        type="button"
                        onClick={() => void refresh()}
                        disabled={loading}
                        className="inline-flex items-center gap-2 rounded-full border border-slate/15 bg-white px-4 py-2 text-xs font-semibold text-slate"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {error ? (
                <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                </div>
            ) : null}

            <section className="rounded-3xl border border-slate/10 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.16em] text-slate/70">
                        Tool
                        <input
                            value={filters.source || ""}
                            onChange={(event) => setFilter("source", event.target.value)}
                            placeholder="claude_code"
                            className="rounded-lg border border-slate/15 bg-white px-3 py-1.5 text-xs text-ink"
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.16em] text-slate/70">
                        Actor
                        <input
                            value={filters.actor_user || ""}
                            onChange={(event) => setFilter("actor_user", event.target.value)}
                            placeholder="user@company"
                            className="rounded-lg border border-slate/15 bg-white px-3 py-1.5 text-xs text-ink"
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.16em] text-slate/70">
                        Analysis
                        <select
                            value={filters.analysis_status || ""}
                            onChange={(event) => setFilter("analysis_status", event.target.value)}
                            className="rounded-lg border border-slate/15 bg-white px-3 py-1.5 text-xs capitalize text-ink"
                        >
                            <option value="">All</option>
                            {ANALYSIS_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                    {humanise(status)}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.16em] text-slate/70">
                        Verdict
                        <select
                            value={filters.verdict || ""}
                            onChange={(event) => setFilter("verdict", event.target.value)}
                            className="rounded-lg border border-slate/15 bg-white px-3 py-1.5 text-xs capitalize text-ink"
                        >
                            <option value="">All</option>
                            {VERDICTS.map((verdict) => (
                                <option key={verdict} value={verdict}>
                                    {verdict}
                                </option>
                            ))}
                        </select>
                    </label>
                    {Object.keys(filters).length ? (
                        <button
                            type="button"
                            onClick={() => {
                                setFilters({});
                                setPage(0);
                            }}
                            className="rounded-full border border-slate/15 px-3 py-1.5 text-[11px] font-semibold text-slate"
                        >
                            Clear filters
                        </button>
                    ) : null}
                </div>

                <div className="overflow-auto rounded-2xl border border-slate/10">
                    <table className="w-full min-w-[980px] text-left text-xs">
                        <thead className="bg-slate/5 text-[11px] uppercase tracking-[0.18em] text-slate/70">
                            <tr>
                                <th className="px-3 py-2">Observed</th>
                                <th className="px-3 py-2">Tool</th>
                                <th className="px-3 py-2">Actor</th>
                                <th className="px-3 py-2">Project</th>
                                <th className="px-3 py-2">Size</th>
                                <th className="px-3 py-2">Analysis</th>
                                <th className="px-3 py-2">Verdict</th>
                                <th className="px-3 py-2">Findings</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td className="px-3 py-6 text-slate" colSpan={8}>
                                        Loading...
                                    </td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td className="px-3 py-6 text-slate" colSpan={8}>
                                        {Object.keys(filters).length
                                            ? "No sessions match these filters."
                                            : "No sessions collected yet."}
                                    </td>
                                </tr>
                            ) : (
                                rows.map((row) => (
                                    <tr
                                        key={row.session_key}
                                        onClick={() => setSelectedKey(row.session_key)}
                                        className={`cursor-pointer border-t border-slate/10 hover:bg-slate/5 ${
                                            selectedKey === row.session_key ? "bg-secondary/5" : ""
                                        }`}
                                    >
                                        <td className="px-3 py-2 text-slate/70">
                                            {formatTime(row.observed_at)}
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="font-medium text-ink">{row.source}</div>
                                            <div className="text-[11px] text-slate/70">
                                                {row.model || "-"}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 text-slate">
                                            {row.actor_user || row.hostname || "-"}
                                        </td>
                                        <td className="px-3 py-2 text-slate">
                                            {row.title || row.project_path || "-"}
                                        </td>
                                        <td className="px-3 py-2 text-slate/70">
                                            {row.message_count} msg / {row.tool_call_count} tool
                                        </td>
                                        <td className="px-3 py-2">
                                            <Pill
                                                label={humanise(row.analysis_status)}
                                                styles={STATUS_STYLES[row.analysis_status]}
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            {row.verdict ? (
                                                <Pill
                                                    label={row.verdict}
                                                    styles={VERDICT_STYLES[row.verdict]}
                                                />
                                            ) : (
                                                <span className="text-slate/50">-</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-slate">
                                            {row.finding_count || "-"}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="mt-3 flex items-center justify-between text-[11px] text-slate">
                    <span>{showing}</span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={page === 0 || loading}
                            onClick={() => setPage((current) => Math.max(0, current - 1))}
                            className="rounded-full border border-slate/15 px-3 py-1 font-semibold disabled:opacity-40"
                        >
                            Previous
                        </button>
                        <button
                            type="button"
                            disabled={loading || (page + 1) * PAGE_SIZE >= total}
                            onClick={() => setPage((current) => current + 1)}
                            className="rounded-full border border-slate/15 px-3 py-1 font-semibold disabled:opacity-40"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </section>

            {selectedKey ? (
                <SessionDetailPanel
                    tenantId={tenantId || undefined}
                    sessionKey={selectedKey}
                    onClose={() => setSelectedKey(null)}
                    onDeleted={() => void refresh()}
                />
            ) : null}
        </div>
    );
}

function DeliveryPanel({ stats }: { stats: SiemDeliveryStats | null }) {
    if (!stats) return null;
    const stuck = stats.dead_letter > 0;
    return (
        <div
            className={`inline-flex items-center gap-3 rounded-full border px-4 py-2 text-[11px] font-semibold ${
                stuck
                    ? "border-danger/30 bg-danger/5 text-danger"
                    : "border-slate/15 bg-white text-slate"
            }`}
            title="QRadar delivery for this tenant"
        >
            <span>QRadar</span>
            <span>{stats.delivered} delivered</span>
            <span>{stats.pending} pending</span>
            <span>{stats.dead_letter} dead-letter</span>
        </div>
    );
}

function SessionDetailPanel({
    tenantId,
    sessionKey,
    onClose,
    onDeleted,
}: {
    tenantId?: string;
    sessionKey: string;
    onClose: () => void;
    onDeleted: () => void;
}) {
    const [detail, setDetail] = useState<AgentSessionDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        setError(null);
        try {
            setDetail(await fetchAgentSession(tenantId, sessionKey));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load the session");
            setDetail(null);
        } finally {
            setLoading(false);
        }
    }, [tenantId, sessionKey]);

    useEffect(() => {
        void load();
    }, [load]);

    if (loading) {
        return (
            <section className="rounded-3xl border border-slate/10 bg-white p-5 text-sm text-slate shadow-sm">
                Loading session...
            </section>
        );
    }

    if (error || !detail) {
        return (
            <section className="rounded-3xl border border-danger/30 bg-danger/5 p-5 text-sm text-danger shadow-sm">
                {error || "Session not found."}
            </section>
        );
    }

    return (
        <section className="rounded-3xl border border-slate/10 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Pill
                            label={humanise(detail.analysis_status)}
                            styles={STATUS_STYLES[detail.analysis_status]}
                        />
                        {detail.verdict ? (
                            <Pill label={detail.verdict} styles={VERDICT_STYLES[detail.verdict]} />
                        ) : null}
                        <span className="text-[11px] uppercase tracking-[0.18em] text-slate/60">
                            {detail.collection_mode.replace(/_/g, " ")} mode
                        </span>
                    </div>
                    <h3 className="mt-2 font-display text-xl text-ink">
                        {detail.title || detail.project_path || detail.source}
                    </h3>
                    <p className="text-xs text-slate/70">
                        {detail.source} · {detail.source_session_id}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full border border-slate/15 p-1.5 text-slate"
                    aria-label="Close"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-3">
                <div className="space-y-3 text-xs">
                    <Field label="Actor" value={detail.actor_user} />
                    <Field label="Device" value={detail.hostname || detail.actor_device_id} />
                    <Field label="Model" value={detail.model} />
                    <Field label="Project" value={detail.project_path} />
                    <Field
                        label="Size"
                        value={`${detail.message_count} messages, ${detail.tool_call_count} tool calls`}
                    />
                    <Field label="Observed" value={formatTime(detail.observed_at)} />
                    <Field label="Ingested" value={formatTime(detail.ingested_at)} />
                    <Field
                        label="Collector"
                        value={
                            detail.collector_name
                                ? `${detail.collector_name} ${detail.collector_version || ""}`.trim()
                                : null
                        }
                    />
                    {detail.finding_count ? (
                        <a
                            href={`/findings?session=${encodeURIComponent(detail.session_key)}`}
                            className="inline-block text-[11px] font-semibold text-secondary underline"
                        >
                            {detail.finding_count} finding
                            {detail.finding_count === 1 ? "" : "s"} from this session
                        </a>
                    ) : null}
                </div>

                <div className="space-y-3 lg:col-span-2">
                    {detail.posture ? (
                        <div className="rounded-2xl border border-slate/10 p-3">
                            <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-slate/70">
                                Posture
                            </p>
                            <p className="mb-2 text-[11px] text-slate/70">
                                What the agent was configured to be allowed to do. Collected in
                                every mode, because it is configuration rather than conversation.
                            </p>
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate/5 p-3 text-[11px] text-ink">
                                {JSON.stringify(detail.posture, null, 2)}
                            </pre>
                        </div>
                    ) : null}

                    <TranscriptPanel
                        tenantId={tenantId}
                        detail={detail}
                        onDeleted={() => {
                            void load();
                            onDeleted();
                        }}
                    />
                </div>
            </div>
        </section>
    );
}

function TranscriptPanel({
    tenantId,
    detail,
    onDeleted,
}: {
    tenantId?: string;
    detail: AgentSessionDetail;
    onDeleted: () => void;
}) {
    const [transcript, setTranscript] = useState<TranscriptResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [reason, setReason] = useState("");
    const [confirming, setConfirming] = useState(false);

    // Loaded on demand, not with the session: every read of conversation
    // content is audited, so opening a session must not silently count as
    // reading what an employee typed.
    const onLoad = async () => {
        if (!tenantId) return;
        setLoading(true);
        setMessage(null);
        try {
            setTranscript(await fetchTranscript(tenantId, detail.session_key));
        } catch (err) {
            if (err instanceof TranscriptUnavailable) {
                setMessage(err.message);
            } else {
                setMessage(err instanceof Error ? err.message : "Failed to load the transcript");
            }
        } finally {
            setLoading(false);
        }
    };

    const onDelete = async () => {
        if (!tenantId || !reason.trim()) return;
        setDeleting(true);
        setMessage(null);
        try {
            await deleteTranscript(tenantId, detail.session_key, reason.trim());
            setTranscript(null);
            setConfirming(false);
            setReason("");
            onDeleted();
        } catch (err) {
            setMessage(err instanceof Error ? err.message : "Failed to delete the transcript");
        } finally {
            setDeleting(false);
        }
    };

    const collectsContent = detail.collection_mode === "full_session";

    return (
        <div className="rounded-2xl border border-slate/10 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate/70">Transcript</p>
                <div className="flex items-center gap-2">
                    {detail.transcript_available ? (
                        <>
                            <span className="text-[11px] text-slate/70">
                                {formatBytes(detail.transcript_bytes)}
                            </span>
                            <button
                                type="button"
                                onClick={() => void onLoad()}
                                disabled={loading}
                                className="rounded-full border border-slate/15 px-3 py-1 text-[11px] font-semibold text-slate disabled:opacity-40"
                            >
                                {loading ? "Loading..." : transcript ? "Reload" : "Show content"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfirming((current) => !current)}
                                className="inline-flex items-center gap-1.5 rounded-full border border-danger/30 px-3 py-1 text-[11px] font-semibold text-danger"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                            </button>
                        </>
                    ) : null}
                </div>
            </div>

            {!collectsContent ? (
                <div className="flex items-start gap-2 rounded-lg bg-slate/5 px-3 py-2 text-xs text-slate">
                    <EyeOff className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{MODE_EXPLANATION[detail.collection_mode]}</span>
                </div>
            ) : !detail.transcript_available ? (
                <p className="rounded-lg bg-slate/5 px-3 py-2 text-xs text-slate">
                    The transcript for this session is no longer stored — retention removed it, or
                    somebody deleted it on request. The session and its findings remain.
                </p>
            ) : null}

            {confirming ? (
                <div className="mt-3 rounded-lg border border-danger/30 bg-danger/5 p-3">
                    <p className="text-xs text-danger">
                        Deleting the transcript is permanent. The session and its findings stay;
                        the evidence body does not. A reason is recorded against your name.
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder="e.g. subject access request 4471"
                            className="min-w-[240px] flex-1 rounded-lg border border-slate/15 px-3 py-1.5 text-xs text-ink"
                        />
                        <button
                            type="button"
                            disabled={deleting || !reason.trim()}
                            onClick={() => void onDelete()}
                            className="rounded-full bg-danger px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
                        >
                            {deleting ? "Deleting..." : "Delete permanently"}
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirming(false)}
                            className="rounded-full border border-slate/15 px-3 py-1.5 text-[11px] font-semibold text-slate"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : null}

            {message ? (
                <p className="mt-2 rounded-lg bg-slate/5 px-3 py-2 text-xs text-slate">{message}</p>
            ) : null}

            {transcript ? (
                <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate/5 p-3 text-[11px] text-ink">
                    {JSON.stringify(transcript.transcript, null, 2)}
                </pre>
            ) : null}
        </div>
    );
}

function Field({ label, value }: { label: string; value?: string | null }) {
    return (
        <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate/60">{label}</p>
            <p className="break-words text-ink">{value || "-"}</p>
        </div>
    );
}
