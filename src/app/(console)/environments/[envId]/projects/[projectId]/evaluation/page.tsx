"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Play, RefreshCw, UploadCloud } from "lucide-react";
import { useConsole } from "src/app/(console)/console-context";
import {
  createEvaluationRun,
  fetchEvaluationRun,
  fetchEvaluationRuns,
  fetchEvaluationSets,
  fetchGuardrails,
  POLICY_PHASE_LABELS,
  POLICY_PHASE_OPTIONS,
  type EvaluationRun,
  type EvaluationRunDetail,
  type EvaluationSet,
  type Guardrail,
  type PolicyPhase,
} from "src/lib/api";
import {
  BTN_PRIMARY,
  DecisionTag,
  EmptyState,
  INPUT,
  InlineNotice,
  KeyValue,
  LABEL,
  SectionCard,
  TAG,
  TAG_GREEN,
  TAG_RED,
  decisionLabel,
} from "src/app/(console)/console-ui";

type DatasetMode = "preset" | "upload";

const CASE_PAGE_SIZE = 50;
const POLL_INTERVAL_MS = 4000;

const percentFormatter = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

const gradeFromAccuracy = (value: number | null | undefined) => {
  if (value === null || value === undefined) return null;
  if (value >= 0.9) return "A";
  if (value >= 0.8) return "B";
  if (value >= 0.7) return "C";
  if (value >= 0.6) return "D";
  return "F";
};

const formatPercent = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : percentFormatter.format(value);

const formatDate = (value: string | null | undefined) =>
  value ? dateFormatter.format(new Date(value)) : "—";

function StatusTag({ status }: { status: EvaluationRun["status"] }) {
  const className =
    status === "COMPLETED"
      ? TAG_GREEN
      : status === "FAILED"
        ? TAG_RED
        : "inline-flex items-center rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800";
  const label =
    status === "COMPLETED"
      ? "Completed"
      : status === "FAILED"
        ? "Failed"
        : status === "RUNNING"
          ? "Running"
          : "Pending";
  return <span className={className}>{label}</span>;
}

export default function EvaluationPage() {
  const { envId, projectId } = useParams() as { envId: string; projectId: string };
  const { tenantId } = useConsole();
  const [guardrails, setGuardrails] = useState<Guardrail[]>([]);
  const [sets, setSets] = useState<EvaluationSet[]>([]);
  const [runs, setRuns] = useState<EvaluationRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<EvaluationRunDetail | null>(null);
  const [selectedGuardrailId, setSelectedGuardrailId] = useState("");
  const [datasetMode, setDatasetMode] = useState<DatasetMode>("preset");
  const [selectedSetId, setSelectedSetId] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<PolicyPhase>("PRE_LLM");
  const [runName, setRunName] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openingRunId, setOpeningRunId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [missesOnly, setMissesOnly] = useState(false);

  const metrics = selectedRun?.metrics;
  const accuracy = metrics?.expected_action_accuracy ?? null;
  const blockRate = metrics?.total ? metrics.blocked / metrics.total : null;
  const allowRate = metrics?.total ? metrics.allowed / metrics.total : null;
  const grade = gradeFromAccuracy(accuracy);

  const guardrailName = useCallback(
    (guardrailId: string) => guardrails.find((g) => g.guardrail_id === guardrailId)?.name ?? guardrailId,
    [guardrails]
  );
  const selectedSet = useMemo(() => sets.find((item) => item.id === selectedSetId) ?? null, [selectedSetId, sets]);

  useEffect(() => {
    if (!tenantId || !envId || !projectId) return;
    setLoading(true);
    setError(null);
    Promise.allSettled([
      fetchGuardrails(tenantId, envId, projectId),
      fetchEvaluationSets(),
      fetchEvaluationRuns(tenantId, envId, projectId),
    ])
      .then(([guardrailResult, setsResult, runsResult]) => {
        if (guardrailResult.status === "fulfilled") {
          setGuardrails(guardrailResult.value);
          setSelectedGuardrailId((current) => current || guardrailResult.value[0]?.guardrail_id || "");
        }
        if (setsResult.status === "fulfilled") {
          setSets(setsResult.value);
          setSelectedSetId((current) => current || setsResult.value[0]?.id || "");
        }
        if (runsResult.status === "fulfilled") setRuns(runsResult.value);
        if ([guardrailResult, setsResult, runsResult].some((r) => r.status === "rejected")) {
          setError("Some evaluation data could not be loaded.");
        }
      })
      .finally(() => setLoading(false));
  }, [tenantId, envId, projectId]);

  // Koşan bir run seçiliyken durumu periyodik tazele.
  useEffect(() => {
    if (!tenantId || !selectedRun?.id) return;
    if (selectedRun.status !== "RUNNING" && selectedRun.status !== "PENDING") return;
    let active = true;
    const interval = window.setInterval(async () => {
      try {
        const fresh = await fetchEvaluationRun(tenantId, selectedRun.id, CASE_PAGE_SIZE);
        if (!active) return;
        setSelectedRun(fresh);
        setRuns((prev) => prev.map((run) => (run.id === fresh.id ? fresh : run)));
      } catch {
        /* polling errors are ignored */
      }
    }, POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [tenantId, selectedRun]);

  const refreshRuns = async () => {
    if (!tenantId) return;
    setRefreshing(true);
    try {
      setRuns(await fetchEvaluationRuns(tenantId, envId, projectId));
    } catch {
      setError("Runs could not be refreshed.");
    } finally {
      setRefreshing(false);
    }
  };

  const openRun = async (runId: string) => {
    if (!tenantId) return;
    setOpeningRunId(runId);
    try {
      setSelectedRun(await fetchEvaluationRun(tenantId, runId, CASE_PAGE_SIZE));
      setMissesOnly(false);
    } catch {
      setError("The run could not be loaded.");
    } finally {
      setOpeningRunId(null);
    }
  };

  const handleRun = async () => {
    if (!tenantId || !envId || !projectId) return;
    setFormError(null);
    if (!selectedGuardrailId) return setFormError("Select a guardrail.");
    if (datasetMode === "preset" && !selectedSetId) return setFormError("Select an evaluation set.");
    if (datasetMode === "upload" && !uploadFile) return setFormError("Choose a JSONL file to upload.");

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("environment_id", envId);
      formData.append("project_id", projectId);
      formData.append("guardrail_id", selectedGuardrailId);
      formData.append("phase", phase);
      if (runName.trim()) formData.append("name", runName.trim());
      if (datasetMode === "preset") formData.append("dataset_id", selectedSetId);
      else if (uploadFile) formData.append("file", uploadFile);
      const run = await createEvaluationRun(tenantId, formData);
      setRuns((prev) => [run, ...prev]);
      setSelectedRun(await fetchEvaluationRun(tenantId, run.id, CASE_PAGE_SIZE));
      setMissesOnly(false);
      setRunName("");
    } catch {
      setFormError("The evaluation could not be started.");
    } finally {
      setSubmitting(false);
    }
  };

  const confusion = useMemo(() => {
    const table = metrics?.action_confusion;
    if (!table) return null;
    const expected = Object.keys(table);
    const actualSet = new Set<string>();
    expected.forEach((key) => Object.keys(table[key]).forEach((actual) => actualSet.add(actual)));
    const actual = Array.from(actualSet);
    return { expected, actual, table };
  }, [metrics]);

  const visibleCases = useMemo(() => {
    if (!selectedRun) return [];
    return missesOnly
      ? selectedRun.cases.filter((item) => item.expected_action_match === false)
      : selectedRun.cases;
  }, [missesOnly, selectedRun]);

  const missCount = selectedRun?.cases.filter((item) => item.expected_action_match === false).length ?? 0;

  return (
    <div className="space-y-6">
      <header className="border-b border-gray-200 pb-5">
        <h1 className="text-2xl font-semibold text-gray-900">Evaluation</h1>
        <p className="mt-1 text-sm text-gray-500">
          Run a labelled prompt set against a guardrail version and measure how often the decision
          matched the expected outcome.
        </p>
      </header>

      {error && (
        <InlineNotice tone="error" onDismiss={() => setError(null)}>
          {error}
        </InlineNotice>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(380px,2fr)]">
        <SectionCard
          title="New evaluation"
          description="Each prompt is sent through the guardrail exactly like live traffic."
          actions={<span className={TAG}>Powered by PyRIT</span>}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={LABEL} htmlFor="eval-guardrail">
                Guardrail
              </label>
              <select
                id="eval-guardrail"
                className={`${INPUT} mt-1`}
                value={selectedGuardrailId}
                onChange={(event) => setSelectedGuardrailId(event.target.value)}
                disabled={loading}
              >
                {guardrails.map((guardrail) => (
                  <option key={guardrail.guardrail_id} value={guardrail.guardrail_id}>
                    {guardrail.name} · v{guardrail.current_version}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">The current version is evaluated.</p>
            </div>
            <div>
              <label className={LABEL} htmlFor="eval-phase">
                Phase
              </label>
              <select
                id="eval-phase"
                className={`${INPUT} mt-1`}
                value={phase}
                onChange={(event) => setPhase(event.target.value as PolicyPhase)}
              >
                {POLICY_PHASE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {POLICY_PHASE_LABELS[option]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Action phases need an <code className="font-mono">artifacts</code> array in each uploaded case.
              </p>
            </div>
          </div>

          <div className="mt-5">
            <p className={LABEL}>Dataset</p>
            <div className="mt-1.5 inline-flex rounded border border-gray-300 bg-white p-0.5" role="tablist">
              {(
                [
                  { id: "preset", label: "Built-in set" },
                  { id: "upload", label: "Upload JSONL" },
                ] as Array<{ id: DatasetMode; label: string }>
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={datasetMode === option.id}
                  onClick={() => setDatasetMode(option.id)}
                  className={`rounded px-3 py-1 text-sm font-medium transition ${
                    datasetMode === option.id
                      ? "bg-secondary text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {datasetMode === "preset" ? (
              <div className="mt-3">
                <select
                  className={INPUT}
                  value={selectedSetId}
                  onChange={(event) => setSelectedSetId(event.target.value)}
                  aria-label="Evaluation set"
                >
                  {sets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.total_cases} prompts
                    </option>
                  ))}
                </select>
                {selectedSet?.description && (
                  <p className="mt-1 text-xs text-gray-500">{selectedSet.description}</p>
                )}
              </div>
            ) : (
              <label className="mt-3 flex cursor-pointer flex-col items-center gap-2 rounded border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center transition hover:border-secondary">
                <UploadCloud className="h-5 w-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-900">
                  {uploadFile ? uploadFile.name : "Choose a .jsonl file"}
                </span>
                <span className="text-xs text-gray-500">
                  One JSON object per line:{" "}
                  <code className="font-mono">{'{"prompt": "…", "expected_action": "BLOCK"}'}</code>
                </span>
                <input
                  type="file"
                  accept=".jsonl"
                  className="sr-only"
                  onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
                />
              </label>
            )}
          </div>

          <div className="mt-5">
            <label className={LABEL} htmlFor="eval-name">
              Run name <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              id="eval-name"
              className={`${INPUT} mt-1`}
              value={runName}
              onChange={(event) => setRunName(event.target.value)}
              placeholder="e.g. Pre-release safety sweep"
            />
          </div>

          {formError && (
            <div className="mt-4">
              <InlineNotice tone="error">{formError}</InlineNotice>
            </div>
          )}

          <div className="mt-5 flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              Results appear below and are kept in the run history.
            </p>
            <button
              type="button"
              className={`${BTN_PRIMARY} h-10 px-5`}
              onClick={handleRun}
              disabled={submitting || loading}
            >
              <Play className="h-4 w-4" />
              {submitting ? "Starting…" : "Run evaluation"}
            </button>
          </div>
        </SectionCard>

        <SectionCard
          title="Runs"
          description={loading ? "Loading…" : `${runs.length} in this project`}
          actions={
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm font-medium text-secondary hover:underline disabled:opacity-60"
              onClick={refreshRuns}
              disabled={refreshing}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </button>
          }
        >
          {!loading && runs.length === 0 ? (
            <EmptyState>No evaluations yet. Start one on the left.</EmptyState>
          ) : (
            <div className="-mx-5 -my-4 max-h-[520px] overflow-y-auto">
              <table className="w-full table-fixed text-sm">
                <thead className="sticky top-0 bg-gray-50 text-left text-xs font-medium text-gray-500">
                  <tr>
                    <th className="px-5 py-2 font-medium">Run</th>
                    <th className="w-[88px] px-3 py-2 text-right font-medium">Accuracy</th>
                    <th className="w-[104px] px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {runs.map((run) => {
                    const active = selectedRun?.id === run.id;
                    const progress = run.total_cases ? run.processed_cases / run.total_cases : 0;
                    return (
                      <tr
                        key={run.id}
                        onClick={() => void openRun(run.id)}
                        className={`cursor-pointer transition-colors hover:bg-gray-50 ${active ? "bg-secondary/5" : ""}`}
                      >
                        <td className="px-5 py-2.5">
                          <p className="truncate font-medium text-gray-900" title={run.name || run.dataset_id || run.id}>
                            {run.name || run.dataset_id || run.id.slice(0, 8)}
                          </p>
                          <p className="truncate text-xs text-gray-500">
                            {guardrailName(run.guardrail_id)} v{run.guardrail_version} · {POLICY_PHASE_LABELS[run.phase] ?? run.phase} · {run.total_cases} prompts
                          </p>
                          {(run.status === "RUNNING" || run.status === "PENDING") && (
                            <div className="mt-1.5 h-1 w-full overflow-hidden rounded bg-gray-200">
                              <div className="h-full bg-secondary" style={{ width: `${Math.round(progress * 100)}%` }} />
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-900">
                          {formatPercent(run.metrics?.expected_action_accuracy)}
                        </td>
                        <td className="px-3 py-2.5">
                          {openingRunId === run.id ? (
                            <span className="text-xs text-gray-400">Opening…</span>
                          ) : (
                            <StatusTag status={run.status} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 pb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {selectedRun ? selectedRun.name || selectedRun.dataset_id || "Evaluation run" : "Results"}
            </h2>
            {selectedRun && (
              <p className="mt-0.5 text-sm text-gray-500">
                {guardrailName(selectedRun.guardrail_id)} v{selectedRun.guardrail_version} ·{" "}
                {POLICY_PHASE_LABELS[selectedRun.phase] ?? selectedRun.phase} · started{" "}
                {formatDate(selectedRun.created_at)}
              </p>
            )}
          </div>
          {selectedRun && <StatusTag status={selectedRun.status} />}
        </div>

        {!selectedRun ? (
          <EmptyState>Select a run to see its results.</EmptyState>
        ) : (
          <>
            {selectedRun.status === "FAILED" && (
              <InlineNotice tone="error">{selectedRun.error_message || "The evaluation failed."}</InlineNotice>
            )}
            {(selectedRun.status === "RUNNING" || selectedRun.status === "PENDING") && (
              <InlineNotice tone="info">
                Running — {selectedRun.processed_cases} of {selectedRun.total_cases} prompts processed. This
                page refreshes automatically.
              </InlineNotice>
            )}

            <div className="grid grid-cols-1 divide-y divide-gray-200 rounded border border-gray-200 bg-white sm:grid-cols-5 sm:divide-x sm:divide-y-0">
              <div className="px-5 py-4">
                <p className="text-xs font-medium text-gray-500">Action accuracy</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{formatPercent(accuracy)}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {grade ? `Grade ${grade}` : "No expected labels"}
                  {metrics?.expected_action_total
                    ? ` · ${metrics.expected_action_matches ?? 0} of ${metrics.expected_action_total} matched`
                    : ""}
                </p>
              </div>
              <div className="px-5 py-4">
                <p className="text-xs font-medium text-gray-500">Block rate</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{formatPercent(blockRate)}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {metrics?.blocked ?? 0} of {metrics?.total ?? 0}
                </p>
              </div>
              <div className="px-5 py-4">
                <p className="text-xs font-medium text-gray-500">Allow rate</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{formatPercent(allowRate)}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {metrics?.allowed ?? 0} of {metrics?.total ?? 0}
                </p>
              </div>
              <div className="px-5 py-4">
                <p className="text-xs font-medium text-gray-500">Flagged</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{metrics?.flagged ?? 0}</p>
                <p className="mt-1 text-xs text-gray-500">Needs review</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-xs font-medium text-gray-500">Processed</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
                  {selectedRun.processed_cases}
                  <span className="text-base font-normal text-gray-500"> / {selectedRun.total_cases}</span>
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {selectedRun.completed_at ? `Finished ${formatDate(selectedRun.completed_at)}` : "In progress"}
                </p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <SectionCard
                title="Expected vs actual"
                description="Rows are the expected decision, columns what the guardrail returned."
              >
                {confusion ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs font-medium text-gray-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Expected ↓ / Actual →</th>
                          {confusion.actual.map((actual) => (
                            <th key={actual} className="px-3 py-2 text-right font-medium">
                              {decisionLabel(actual)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {confusion.expected.map((expected) => (
                          <tr key={expected}>
                            <td className="px-3 py-2">
                              <DecisionTag action={expected} />
                            </td>
                            {confusion.actual.map((actual) => {
                              const count = confusion.table[expected][actual] ?? 0;
                              const isMatch = expected === actual;
                              return (
                                <td
                                  key={actual}
                                  className={`px-3 py-2 text-right tabular-nums ${
                                    count === 0
                                      ? "text-gray-300"
                                      : isMatch
                                        ? "font-semibold text-emerald-700"
                                        : "font-semibold text-red-700"
                                  }`}
                                >
                                  {count}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState>No expected labels in this dataset, so accuracy cannot be computed.</EmptyState>
                )}
              </SectionCard>

              <SectionCard title="Decisions">
                <div className="grid gap-4 sm:grid-cols-2">
                  {Object.entries(metrics?.actions ?? {}).map(([action, count]) => (
                    <KeyValue key={action} label={decisionLabel(action)}>
                      <span className="tabular-nums">{count}</span>
                    </KeyValue>
                  ))}
                  {metrics?.expected_severity_accuracy != null && (
                    <KeyValue label="Severity accuracy">{formatPercent(metrics.expected_severity_accuracy)}</KeyValue>
                  )}
                  {metrics?.expected_allowed_accuracy != null && (
                    <KeyValue label="Allow/deny accuracy">{formatPercent(metrics.expected_allowed_accuracy)}</KeyValue>
                  )}
                  <KeyValue label="Run ID">
                    <span className="font-mono text-xs">{selectedRun.id}</span>
                  </KeyValue>
                </div>
              </SectionCard>
            </div>

            <SectionCard
              title="Prompts"
              description={
                selectedRun.cases.length < selectedRun.total_cases
                  ? `Showing the first ${selectedRun.cases.length} of ${selectedRun.total_cases}`
                  : `${selectedRun.cases.length} prompts`
              }
              actions={
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-secondary focus:ring-secondary/30"
                    checked={missesOnly}
                    onChange={(event) => setMissesOnly(event.target.checked)}
                  />
                  Misses only{missCount > 0 ? ` (${missCount})` : ""}
                </label>
              }
            >
              <div className="-mx-5 -my-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500">
                    <tr>
                      <th className="px-5 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Prompt</th>
                      <th className="px-3 py-2 font-medium">Expected</th>
                      <th className="px-3 py-2 font-medium">Actual</th>
                      <th className="px-3 py-2 font-medium">Match</th>
                      <th className="px-3 py-2 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visibleCases.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-gray-500">
                          {missesOnly ? "No misses — every prompt matched its expected decision." : "No prompts yet."}
                        </td>
                      </tr>
                    ) : (
                      visibleCases.map((item) => (
                        <tr key={item.id}>
                          <td className="whitespace-nowrap px-5 py-2.5 text-gray-600">
                            {item.label || `#${item.index}`}
                          </td>
                          <td className="max-w-[420px] truncate px-3 py-2.5 text-gray-900" title={item.prompt}>
                            {item.prompt}
                          </td>
                          <td className="px-3 py-2.5">
                            <DecisionTag action={item.expected_action} />
                          </td>
                          <td className="px-3 py-2.5">
                            <DecisionTag action={item.decision_action} />
                          </td>
                          <td className="px-3 py-2.5">
                            {item.expected_action_match === null || item.expected_action_match === undefined ? (
                              <span className="text-gray-400">—</span>
                            ) : item.expected_action_match ? (
                              <span className="text-xs font-medium text-emerald-700">Match</span>
                            ) : (
                              <span className="text-xs font-medium text-red-700">Miss</span>
                            )}
                          </td>
                          <td className="max-w-[360px] truncate px-3 py-2.5 text-gray-600" title={item.decision_reason ?? undefined}>
                            {item.decision_reason || "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </>
        )}
      </section>
    </div>
  );
}
