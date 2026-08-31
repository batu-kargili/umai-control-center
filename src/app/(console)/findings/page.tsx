"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, RefreshCw, Send, X } from "lucide-react";

import {
    FINDING_CATEGORIES,
    FINDING_SEVERITIES,
    FINDING_SOURCES,
    FINDING_STATUSES,
    FINDING_TRANSITIONS,
    FindingDetail,
    FindingFilters,
    FindingStatus,
    FindingSummary,
    SiemDeliveryStats,
    assignFinding,
    fetchFinding,
    fetchFindings,
    fetchSiemDeliveryStats,
    replayFindingDelivery,
    transitionFinding,
    transitionRequiresNote,
} from "src/lib/api";
import { useConsole } from "src/app/(console)/console-context";

const PAGE_SIZE = 50;

// Severity drives where the eye goes first, so it is the only place colour is
// spent. Everything else stays neutral.
const SEVERITY_STYLES: Record<string, string> = {
    critical: "bg-danger/15 text-danger border-danger/30",
    high: "bg-orange-100 text-orange-700 border-orange-200",
    medium: "bg-amber-100 text-amber-700 border-amber-200",
    low: "bg-slate/10 text-slate border-slate/20",
};

const STATUS_STYLES: Record<string, string> = {
    open: "bg-secondary/10 text-secondary border-secondary/20",
    investigating: "bg-blue-50 text-blue-700 border-blue-200",
    resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    false_positive: "bg-slate/10 text-slate border-slate/20",
    accepted_risk: "bg-slate/10 text-slate border-slate/20",
};

const DELIVERY_STYLES: Record<string, string> = {
    delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
    pending: "bg-amber-100 text-amber-700 border-amber-200",
    dead_letter: "bg-danger/15 text-danger border-danger/30",
};

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

function formatAge(seconds?: number | null): string {
    if (seconds === null || seconds === undefined) return "-";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
    return `${Math.round(seconds / 86400)}d`;
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

function Select({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: string;
    options: readonly string[];
    onChange: (next: string) => void;
}) {
    return (
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.16em] text-slate/70">
            {label}
            <select
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="rounded-lg border border-slate/15 bg-white px-3 py-1.5 text-xs font-medium capitalize text-ink"
            >
                <option value="">All</option>
                {options.map((option) => (
                    <option key={option} value={option}>
                        {humanise(option)}
                    </option>
                ))}
            </select>
        </label>
    );
}

export default function FindingsPage() {
    // `useSearchParams` opts a route into client rendering; the boundary keeps
    // the rest of the page pre-renderable.
    return (
        <Suspense fallback={<p className="text-sm text-slate">Loading findings...</p>}>
            <FindingQueue />
        </Suspense>
    );
}

function FindingQueue() {
    const { tenantId } = useConsole();
    const searchParams = useSearchParams();
    // Arriving from a session: show only what that session produced.
    const linkedSession = searchParams.get("session");

    const [filters, setFilters] = useState<FindingFilters>(
        linkedSession ? { session_key: linkedSession } : { status: "open" }
    );
    const [page, setPage] = useState(0);
    const [rows, setRows] = useState<FindingSummary[]>([]);
    const [total, setTotal] = useState(0);
    const [delivery, setDelivery] = useState<SiemDeliveryStats | null>(null);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [detail, setDetail] = useState<FindingDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
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
            const [findingPage, stats] = await Promise.all([
                fetchFindings(tenantId, query),
                // Delivery health is per tenant, not per finding, so a failure
                // here must not hide the queue itself.
                fetchSiemDeliveryStats(tenantId).catch(() => null),
            ]);
            setRows(findingPage.items);
            setTotal(findingPage.total);
            setDelivery(stats);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load findings");
        } finally {
            setLoading(false);
        }
    }, [tenantId, query]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        if (!tenantId || !selectedKey) {
            setDetail(null);
            return;
        }
        let cancelled = false;
        setDetailLoading(true);
        fetchFinding(tenantId, selectedKey)
            .then((row) => {
                if (!cancelled) setDetail(row);
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Failed to load finding");
                    setSelectedKey(null);
                }
            })
            .finally(() => {
                if (!cancelled) setDetailLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [tenantId, selectedKey]);

    const setFilter = (key: keyof FindingFilters, value: string) => {
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

    // The detail pane holds the fresh row the API returned, so the list is
    // patched rather than refetched: an analyst working down the queue should
    // not have rows move under them after every action.
    const applyUpdate = (updated: FindingDetail) => {
        setDetail(updated);
        setRows((current) =>
            current.map((row) =>
                row.finding_key === updated.finding_key ? { ...row, ...updated } : row
            )
        );
    };

    const showing = rows.length
        ? `${page * PAGE_SIZE + 1}-${page * PAGE_SIZE + rows.length} of ${total}`
        : `0 of ${total}`;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate">Detection</p>
                    <h2 className="font-display text-3xl text-ink">Finding Queue</h2>
                    <p className="text-sm text-slate">
                        What the detectors raised, and what has been done about it.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <DeliveryBanner stats={delivery} />
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
                    <Select
                        label="Status"
                        value={filters.status || ""}
                        options={FINDING_STATUSES}
                        onChange={(value) => setFilter("status", value)}
                    />
                    <Select
                        label="Severity"
                        value={filters.severity || ""}
                        options={FINDING_SEVERITIES}
                        onChange={(value) => setFilter("severity", value)}
                    />
                    <Select
                        label="Category"
                        value={filters.category || ""}
                        options={FINDING_CATEGORIES}
                        onChange={(value) => setFilter("category", value)}
                    />
                    <Select
                        label="Source"
                        value={filters.source || ""}
                        options={FINDING_SOURCES}
                        onChange={(value) => setFilter("source", value)}
                    />
                    <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.16em] text-slate/70">
                        Actor
                        <input
                            value={filters.actor_user || ""}
                            onChange={(event) => setFilter("actor_user", event.target.value)}
                            placeholder="user@company"
                            className="rounded-lg border border-slate/15 bg-white px-3 py-1.5 text-xs text-ink"
                        />
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
                                <th className="px-3 py-2">Severity</th>
                                <th className="px-3 py-2">Finding</th>
                                <th className="px-3 py-2">Category</th>
                                <th className="px-3 py-2">Actor</th>
                                <th className="px-3 py-2">Source</th>
                                <th className="px-3 py-2">Status</th>
                                <th className="px-3 py-2">Assignee</th>
                                <th className="px-3 py-2">Detected</th>
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
                                            ? "No findings match these filters."
                                            : "No findings yet."}
                                    </td>
                                </tr>
                            ) : (
                                rows.map((row) => (
                                    <tr
                                        key={row.finding_key}
                                        onClick={() => setSelectedKey(row.finding_key)}
                                        className={`cursor-pointer border-t border-slate/10 hover:bg-slate/5 ${
                                            selectedKey === row.finding_key ? "bg-secondary/5" : ""
                                        }`}
                                    >
                                        <td className="px-3 py-2">
                                            <Pill
                                                label={row.severity}
                                                styles={SEVERITY_STYLES[row.severity]}
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="font-medium text-ink">{row.title}</div>
                                            <div className="text-[11px] text-slate/70">
                                                {row.technique_id || row.rule_id}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 capitalize text-slate">
                                            {humanise(row.category)}
                                        </td>
                                        <td className="px-3 py-2 text-slate">
                                            {row.actor_user || row.actor_device_id || "-"}
                                        </td>
                                        <td className="px-3 py-2 uppercase text-slate/70">
                                            {row.source}
                                        </td>
                                        <td className="px-3 py-2">
                                            <Pill
                                                label={humanise(row.status)}
                                                styles={STATUS_STYLES[row.status]}
                                            />
                                        </td>
                                        <td className="px-3 py-2 text-slate">
                                            {row.assignee || "Unassigned"}
                                        </td>
                                        <td className="px-3 py-2 text-slate/70">
                                            {formatTime(row.detected_at)}
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
                <FindingDetailPanel
                    tenantId={tenantId || undefined}
                    detail={detail}
                    loading={detailLoading}
                    onClose={() => setSelectedKey(null)}
                    onUpdated={applyUpdate}
                    onError={setError}
                />
            ) : null}
        </div>
    );
}

function DeliveryBanner({ stats }: { stats: SiemDeliveryStats | null }) {
    if (!stats) return null;
    const stuck = stats.dead_letter > 0;
    return (
        <div
            className={`inline-flex items-center gap-3 rounded-full border px-4 py-2 text-[11px] font-semibold ${
                stuck
                    ? "border-danger/30 bg-danger/5 text-danger"
                    : "border-slate/15 bg-white text-slate"
            }`}
            title="SIEM delivery for this tenant"
        >
            <span>SIEM</span>
            <span>{stats.delivered} delivered</span>
            <span>{stats.pending} pending</span>
            <span>{stats.dead_letter} dead-letter</span>
            {stats.oldest_pending_age_seconds ? (
                <span>oldest {formatAge(stats.oldest_pending_age_seconds)}</span>
            ) : null}
        </div>
    );
}

function FindingDetailPanel({
    tenantId,
    detail,
    loading,
    onClose,
    onUpdated,
    onError,
}: {
    tenantId?: string;
    detail: FindingDetail | null;
    loading: boolean;
    onClose: () => void;
    onUpdated: (row: FindingDetail) => void;
    onError: (message: string | null) => void;
}) {
    const [note, setNote] = useState("");
    const [assignee, setAssignee] = useState("");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setNote("");
        setAssignee(detail?.assignee || "");
    }, [detail?.finding_key, detail?.assignee]);

    if (loading || !detail) {
        return (
            <section className="rounded-3xl border border-slate/10 bg-white p-5 text-sm text-slate shadow-sm">
                Loading finding...
            </section>
        );
    }

    const allowed = FINDING_TRANSITIONS[detail.status] || [];

    const run = async (action: () => Promise<FindingDetail>) => {
        if (!tenantId) return;
        setBusy(true);
        onError(null);
        try {
            onUpdated(await action());
            setNote("");
        } catch (err) {
            onError(err instanceof Error ? err.message : "The action failed");
        } finally {
            setBusy(false);
        }
    };

    const onTransition = (to: FindingStatus) => {
        // The server refuses a note-less judgement anyway; asking here saves
        // the analyst a round trip and an error message.
        if (transitionRequiresNote(detail.status, to) && !note.trim()) {
            onError(`Moving to "${humanise(to)}" needs a note explaining why.`);
            return;
        }
        void run(() => transitionFinding(tenantId!, detail.finding_key, to, note.trim() || undefined));
    };

    return (
        <section className="rounded-3xl border border-slate/10 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Pill label={detail.severity} styles={SEVERITY_STYLES[detail.severity]} />
                        <Pill label={humanise(detail.status)} styles={STATUS_STYLES[detail.status]} />
                        <span className="text-[11px] uppercase tracking-[0.18em] text-slate/60">
                            {detail.source} / {detail.detector}
                        </span>
                    </div>
                    <h3 className="mt-2 font-display text-xl text-ink">{detail.title}</h3>
                    <p className="text-xs text-slate/70">
                        {detail.technique_id ? `${detail.technique_id} · ` : ""}
                        {detail.technique_name || detail.rule_id}
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

            {detail.summary ? (
                <p className="mt-4 rounded-2xl bg-slate/5 px-4 py-3 text-sm text-ink">
                    {detail.summary}
                </p>
            ) : null}

            <div className="mt-5 grid gap-5 lg:grid-cols-3">
                <div className="space-y-3 text-xs">
                    <Field label="Actor" value={detail.actor_user || detail.actor_device_id} />
                    <Field label="Project" value={detail.project_path} />
                    <Field label="Category" value={humanise(detail.category)} />
                    <Field label="Detected" value={formatTime(detail.detected_at)} />
                    <Field label="Observed" value={formatTime(detail.observed_at)} />
                    <Field
                        label="Session"
                        value={
                            detail.session
                                ? `${detail.session.source} · ${detail.session.message_count} messages · ${detail.session.tool_call_count} tool calls`
                                : detail.session_key
                        }
                    />
                    {detail.session_key ? (
                        <a
                            href={`/sessions?session=${encodeURIComponent(detail.session_key)}`}
                            className="inline-block text-[11px] font-semibold text-secondary underline"
                        >
                            Open the session
                        </a>
                    ) : null}
                </div>

                <div className="space-y-3 lg:col-span-2">
                    <DeliveryRow
                        tenantId={tenantId}
                        detail={detail}
                        busy={busy}
                        onUpdated={onUpdated}
                        onError={onError}
                    />

                    <div className="rounded-2xl border border-slate/10 p-3">
                        <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-slate/70">
                            Actions
                        </p>
                        <textarea
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            rows={2}
                            placeholder="Why? Required when dismissing a finding or reopening a closed one."
                            className="mb-2 w-full rounded-lg border border-slate/15 px-3 py-2 text-xs text-ink"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                            {allowed.map((to) => (
                                <button
                                    key={to}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => onTransition(to)}
                                    className="rounded-full border border-slate/15 bg-white px-3 py-1.5 text-[11px] font-semibold capitalize text-slate disabled:opacity-40"
                                >
                                    {humanise(to)}
                                </button>
                            ))}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <input
                                value={assignee}
                                onChange={(event) => setAssignee(event.target.value)}
                                placeholder="analyst@company"
                                className="rounded-lg border border-slate/15 px-3 py-1.5 text-xs text-ink"
                            />
                            <button
                                type="button"
                                disabled={busy || !tenantId}
                                onClick={() =>
                                    void run(() =>
                                        assignFinding(
                                            tenantId!,
                                            detail.finding_key,
                                            assignee.trim() || null
                                        )
                                    )
                                }
                                className="rounded-full border border-slate/15 px-3 py-1.5 text-[11px] font-semibold text-slate disabled:opacity-40"
                            >
                                {assignee.trim() ? "Assign" : "Unassign"}
                            </button>
                        </div>
                    </div>

                    {detail.evidence ? (
                        <details className="rounded-2xl border border-slate/10 p-3">
                            <summary className="cursor-pointer text-[11px] uppercase tracking-[0.18em] text-slate/70">
                                Evidence
                            </summary>
                            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate/5 p-3 text-[11px] text-ink">
                                {JSON.stringify(detail.evidence, null, 2)}
                            </pre>
                        </details>
                    ) : null}

                    <div className="rounded-2xl border border-slate/10 p-3">
                        <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-slate/70">
                            History
                        </p>
                        {detail.history.length === 0 ? (
                            <p className="text-xs text-slate">Nobody has acted on this yet.</p>
                        ) : (
                            <ol className="space-y-2 text-xs">
                                {detail.history.map((event, index) => (
                                    <li key={index} className="border-l-2 border-slate/15 pl-3">
                                        <div className="text-ink">
                                            <span className="capitalize">
                                                {humanise(event.from_status) || "new"}
                                            </span>{" "}
                                            &rarr;{" "}
                                            <span className="font-semibold capitalize">
                                                {humanise(event.to_status)}
                                            </span>{" "}
                                            <span className="text-slate">by {event.actor}</span>
                                        </div>
                                        {event.note ? (
                                            <p className="text-slate">{event.note}</p>
                                        ) : null}
                                        <p className="text-[10px] text-slate/60">
                                            {formatTime(event.occurred_at)}
                                        </p>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}

function DeliveryRow({
    tenantId,
    detail,
    busy,
    onUpdated,
    onError,
}: {
    tenantId?: string;
    detail: FindingDetail;
    busy: boolean;
    onUpdated: (row: FindingDetail) => void;
    onError: (message: string | null) => void;
}) {
    const [replaying, setReplaying] = useState(false);
    const delivery = detail.delivery;

    if (!delivery) {
        return (
            <div className="rounded-2xl border border-slate/10 p-3 text-xs text-slate">
                This finding has no SIEM delivery recorded.
            </div>
        );
    }

    const onReplay = async () => {
        if (!tenantId) return;
        setReplaying(true);
        onError(null);
        try {
            await replayFindingDelivery(tenantId, detail.finding_key);
            onUpdated(await fetchFinding(tenantId, detail.finding_key));
        } catch (err) {
            onError(err instanceof Error ? err.message : "Failed to replay the delivery");
        } finally {
            setReplaying(false);
        }
    };

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate/10 p-3 text-xs">
            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-slate/70">
                        QRadar delivery
                    </span>
                    <Pill
                        label={humanise(delivery.status)}
                        styles={DELIVERY_STYLES[delivery.status]}
                    />
                    <span className="text-slate">
                        {delivery.attempts} attempt{delivery.attempts === 1 ? "" : "s"}
                    </span>
                </div>
                {delivery.delivered_at ? (
                    <p className="text-slate/70">Delivered {formatTime(delivery.delivered_at)}</p>
                ) : null}
                {delivery.last_error ? (
                    <p className="text-danger">{delivery.last_error}</p>
                ) : null}
                {delivery.replayed_at ? (
                    <p className="text-slate/70">
                        Replayed {formatTime(delivery.replayed_at)}
                        {delivery.replayed_by ? ` by ${delivery.replayed_by}` : ""}
                    </p>
                ) : null}
            </div>
            {delivery.status === "dead_letter" ? (
                <button
                    type="button"
                    disabled={busy || replaying}
                    onClick={() => void onReplay()}
                    className="inline-flex items-center gap-2 rounded-full border border-slate/15 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate disabled:opacity-40"
                >
                    <Send className="h-3.5 w-3.5" />
                    {replaying ? "Replaying..." : "Replay"}
                </button>
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
