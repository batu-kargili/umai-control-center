"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Gauge,
  LineChart,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { useConsole } from "src/app/(console)/console-context";
import {
  createEvaluationRun,
  fetchEvaluationRun,
  fetchEvaluationRuns,
  fetchEvaluationSets,
  fetchGuardrails,
  type EvaluationRun,
  type EvaluationRunDetail,
  type EvaluationSet,
  type Guardrail,
  type PolicyPhase,
} from "src/lib/api";

type DatasetMode = "preset" | "upload";

const gradeFromAccuracy = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "-";
  if (value >= 0.9) return "A";
  if (value >= 0.8) return "B";
  if (value >= 0.7) return "C";
  if (value >= 0.6) return "D";
  return "F";
};

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const metrics = selectedRun?.metrics;
  const accuracy = metrics?.expected_action_accuracy ?? null;
  const blockRate = metrics?.total ? metrics.blocked / metrics.total : null;
  const allowRate = metrics?.total ? metrics.allowed / metrics.total : null;

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
          setSelectedGuardrailId(
            (current) => current || guardrailResult.value[0]?.guardrail_id || ""
          );
        }
        if (setsResult.status === "fulfilled") {
          setSets(setsResult.value);
          setSelectedSetId((current) => current || setsResult.value[0]?.id || "");
        }
        if (runsResult.status === "fulfilled") {
          setRuns(runsResult.value);
        }
      })
      .catch(() => setError("Failed to load evaluation data."))
      .finally(() => setLoading(false));
  }, [tenantId, envId, projectId]);

  useEffect(() => {
    if (!tenantId || !selectedRun?.id) return;
    let active = true;
    const interval = setInterval(async () => {
      if (!active) return;
      if (selectedRun.status !== "RUNNING" && selectedRun.status !== "PENDING") {
        return;
      }
      try {
        const fresh = await fetchEvaluationRun(tenantId, selectedRun.id, 50);
        if (!active) return;
        setSelectedRun(fresh);
        setRuns((prev) => prev.map((run) => (run.id === fresh.id ? fresh : run)));
      } catch {
        // ignore polling errors
      }
    }, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [tenantId, selectedRun]);

  const handleRun = async () => {
    if (!tenantId || !envId || !projectId) return;
    if (!selectedGuardrailId) {
      setError("Select a guardrail before running evaluation.");
      return;
    }
    if (datasetMode === "preset" && !selectedSetId) {
      setError("Select an evaluation set.");
      return;
    }
    if (datasetMode === "upload" && !uploadFile) {
      setError("Upload a JSONL file.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("environment_id", envId);
      formData.append("project_id", projectId);
      formData.append("guardrail_id", selectedGuardrailId);
      formData.append("phase", phase);
      if (runName.trim()) {
        formData.append("name", runName.trim());
      }
      if (datasetMode === "preset") {
        formData.append("dataset_id", selectedSetId);
      } else if (uploadFile) {
        formData.append("file", uploadFile);
      }
      const run = await createEvaluationRun(tenantId, formData);
      setRuns((prev) => [run, ...prev]);
      const detail = await fetchEvaluationRun(tenantId, run.id, 50);
      setSelectedRun(detail);
      setRunName("");
    } catch {
      setError("Failed to start evaluation.");
    } finally {
      setSubmitting(false);
    }
  };

  const sortedRuns = useMemo(() => runs, [runs]);

  return (
    <div className="space-y-10 fade-up">
      <header className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-secondary/70">
          Evaluation
        </p>
        <h2 className="font-display text-4xl font-bold text-ink tracking-tight">
          Guardrail evaluation
        </h2>
        <p className="text-sm text-slate max-w-2xl">
          Run evaluation suites against guardrails, upload custom JSONL datasets, and
          review accuracy and block rates in a single dashboard.
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-secondary/10 bg-white p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-ink">Start a new evaluation</h3>
            <div className="text-xs font-semibold text-slate flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-secondary" />
              PyRIT-backed
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate">Guardrail</label>
              <select
                value={selectedGuardrailId}
                onChange={(event) => setSelectedGuardrailId(event.target.value)}
                className="w-full rounded-xl border border-secondary/15 bg-slate-50 px-3 py-2 text-sm focus:border-secondary/40 focus:outline-none"
              >
                {guardrails.map((guardrail) => (
                  <option key={guardrail.guardrail_id} value={guardrail.guardrail_id}>
                    {guardrail.name} ({guardrail.guardrail_id})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate">Phase</label>
              <select
                value={phase}
                onChange={(event) => setPhase(event.target.value as PolicyPhase)}
                className="w-full rounded-xl border border-secondary/15 bg-slate-50 px-3 py-2 text-sm focus:border-secondary/40 focus:outline-none"
              >
                <option value="PRE_LLM">PRE_LLM (user input)</option>
                <option value="POST_LLM">POST_LLM (assistant output)</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate">Dataset</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDatasetMode("preset")}
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  datasetMode === "preset"
                    ? "bg-secondary text-white shadow-accent"
                    : "border border-slate/15 bg-white text-slate-600 hover:border-secondary/20 hover:text-secondary"
                }`}
              >
                Use preset
              </button>
              <button
                type="button"
                onClick={() => setDatasetMode("upload")}
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  datasetMode === "upload"
                    ? "bg-secondary text-white shadow-accent"
                    : "border border-slate/15 bg-white text-slate-600 hover:border-secondary/20 hover:text-secondary"
                }`}
              >
                Upload JSONL
              </button>
            </div>
            {datasetMode === "preset" ? (
              <select
                value={selectedSetId}
                onChange={(event) => setSelectedSetId(event.target.value)}
                className="w-full rounded-xl border border-secondary/15 bg-slate-50 px-3 py-2 text-sm focus:border-secondary/40 focus:outline-none"
              >
                {sets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} - {item.total_cases} prompts
                  </option>
                ))}
              </select>
            ) : (
              <div className="border border-dashed border-secondary/25 rounded-2xl p-4 bg-secondary/5 space-y-2">
                <div className="flex items-center gap-2 text-secondary">
                  <UploadCloud className="w-4 h-4" />
                  <span className="text-xs font-semibold">Upload JSONL</span>
                </div>
                <input
                  type="file"
                  accept=".jsonl"
                  onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
                  className="text-xs"
                />
                <p className="text-[11px] text-slate">
                  Each line: {"{ \"prompt\": \"...\", \"expected_action\": \"BLOCK\" }"}
                </p>
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-[1.4fr_0.6fr] items-end">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate">Run name (optional)</label>
              <input
                value={runName}
                onChange={(event) => setRunName(event.target.value)}
                placeholder="e.g. Feb safety sweep"
                className="w-full rounded-xl border border-secondary/15 bg-white px-3 py-2 text-sm focus:border-secondary/40 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleRun}
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-3 text-sm font-semibold text-white shadow-accent hover:bg-secondary/90 disabled:opacity-60"
            >
              {submitting ? "Running..." : "Run evaluation"}
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-secondary/10 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-ink">Recent runs</h3>
            <button
              type="button"
              onClick={async () => {
                if (!tenantId) return;
                const next = await fetchEvaluationRuns(tenantId, envId, projectId);
                setRuns(next);
              }}
              className="text-xs font-semibold text-secondary flex items-center gap-2 transition-colors hover:text-secondary/80"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>
          {loading && <p className="text-sm text-slate">Loading runs...</p>}
          {!loading && sortedRuns.length === 0 && (
            <p className="text-sm text-slate">No evaluations yet. Run one to get started.</p>
          )}
          <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
            {sortedRuns.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={async () => {
                  if (!tenantId) return;
                  const detail = await fetchEvaluationRun(tenantId, run.id, 50);
                  setSelectedRun(detail);
                }}
                className={`w-full text-left rounded-2xl border p-4 transition ${
                  selectedRun?.id === run.id
                    ? "border-secondary/20 bg-secondary/5"
                    : "border-slate/10 bg-white hover:border-secondary/15"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {run.name || run.dataset_id || run.guardrail_id}
                    </p>
                    <p className="text-xs text-slate">
                      {run.phase} - {run.total_cases} prompts
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-[0.2em] px-2 py-1 rounded-full ${
                      run.status === "COMPLETED"
                        ? "bg-emerald-50 text-emerald-700"
                        : run.status === "FAILED"
                        ? "bg-rose-50 text-rose-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {run.status}
                  </span>
                </div>
                {run.status !== "COMPLETED" && (
                  <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-secondary"
                      style={{
                        width: `${
                          run.total_cases ? (run.processed_cases / run.total_cases) * 100 : 0
                        }%`,
                      }}
                    />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-ink">Evaluation dashboard</h3>
          {selectedRun?.status === "FAILED" && (
            <div className="text-xs text-rose-600 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {selectedRun.error_message || "Evaluation failed"}
            </div>
          )}
        </div>

        {!selectedRun ? (
          <div className="rounded-3xl border border-secondary/10 bg-secondary/5 p-10 text-center text-sm text-slate">
            Select a run to view results.
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-secondary/15 bg-secondary/5 p-4 shadow-sm">
                <p className="text-[10px] uppercase tracking-[0.3em] text-secondary/70">
                  Grade
                </p>
                <p className="mt-2 text-3xl font-bold text-ink">
                  {gradeFromAccuracy(accuracy)}
                </p>
                <p className="text-xs text-slate">
                  Action accuracy {accuracy !== null && accuracy !== undefined ? `${Math.round(accuracy * 100)}%` : "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-secondary/10 bg-white p-4 shadow-sm">
                <p className="text-[10px] uppercase tracking-[0.3em] text-slate/60">
                  Block rate
                </p>
                <p className="mt-2 text-2xl font-bold text-ink">
                  {blockRate !== null && blockRate !== undefined ? `${Math.round(blockRate * 100)}%` : "-"}
                </p>
                <p className="text-xs text-slate">
                  {metrics?.blocked ?? 0} blocked of {metrics?.total ?? 0}
                </p>
              </div>
              <div className="rounded-2xl border border-secondary/10 bg-white p-4 shadow-sm">
                <p className="text-[10px] uppercase tracking-[0.3em] text-slate/60">
                  Allow rate
                </p>
                <p className="mt-2 text-2xl font-bold text-ink">
                  {allowRate !== null && allowRate !== undefined ? `${Math.round(allowRate * 100)}%` : "-"}
                </p>
                <p className="text-xs text-slate">
                  {metrics?.allowed ?? 0} allowed of {metrics?.total ?? 0}
                </p>
              </div>
              <div className="rounded-2xl border border-secondary/10 bg-white p-4 shadow-sm">
                <p className="text-[10px] uppercase tracking-[0.3em] text-slate/60">
                  Flagged
                </p>
                <p className="mt-2 text-2xl font-bold text-ink">
                  {metrics?.flagged ?? 0}
                </p>
                <p className="text-xs text-slate">Requires review</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-3xl border border-secondary/10 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 text-slate">
                  <Gauge className="w-4 h-4 text-secondary" />
                  <h4 className="text-sm font-semibold">Action confusion</h4>
                </div>
                <div className="mt-4 space-y-3 text-xs text-slate">
                  {metrics?.action_confusion ? (
                    Object.entries(metrics.action_confusion).map(([expected, actuals]) => (
                      <div key={expected} className="flex items-center justify-between">
                        <span className="font-semibold text-ink">Expected {expected}</span>
                        <span className="text-slate">
                          {Object.entries(actuals)
                            .map(([actual, count]) => `${actual}: ${count}`)
                            .join(" - ")}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p>No expected labels were provided.</p>
                  )}
                </div>
              </div>
              <div className="rounded-3xl border border-secondary/10 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 text-slate">
                  <LineChart className="w-4 h-4 text-secondary" />
                  <h4 className="text-sm font-semibold">Run summary</h4>
                </div>
                <div className="mt-4 space-y-3 text-xs text-slate">
                  <div className="flex items-center justify-between">
                    <span>Guardrail</span>
                    <span className="font-semibold text-ink">{selectedRun.guardrail_id}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Version</span>
                    <span className="font-semibold text-ink">v{selectedRun.guardrail_version}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Status</span>
                    <span className="font-semibold text-ink">{selectedRun.status}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Processed</span>
                    <span className="font-semibold text-ink">
                      {selectedRun.processed_cases}/{selectedRun.total_cases}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Phase</span>
                    <span className="font-semibold text-ink">{selectedRun.phase}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-secondary/10 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-slate">
                <CheckCircle2 className="w-4 h-4 text-secondary" />
                <h4 className="text-sm font-semibold">Sample results</h4>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-secondary/10">
                <table className="min-w-full text-xs text-slate">
                  <thead className="bg-secondary/5">
                    <tr className="text-left text-[10px] uppercase tracking-[0.2em] text-slate/60">
                      <th className="pb-2 pr-4">Label</th>
                      <th className="pb-2 pr-4">Prompt</th>
                      <th className="pb-2 pr-4">Expected</th>
                      <th className="pb-2 pr-4">Actual</th>
                      <th className="pb-2 pr-4">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRun.cases.map((item) => (
                      <tr key={item.id} className="border-t border-secondary/8">
                        <td className="py-3 pr-4 font-semibold text-ink">
                          {item.label || `#${item.index}`}
                        </td>
                        <td className="py-3 pr-4 max-w-[320px] text-slate">
                          {item.prompt}
                        </td>
                        <td className="py-3 pr-4">{item.expected_action || "-"}</td>
                        <td className="py-3 pr-4 font-semibold text-ink">
                          {item.decision_action || "-"}
                        </td>
                        <td className="py-3 pr-4">
                          {item.expected_action_match === null || item.expected_action_match === undefined ? (
                            "-"
                          ) : item.expected_action_match ? (
                            <span className="text-emerald-600 font-semibold">Match</span>
                          ) : (
                            <span className="text-rose-600 font-semibold">Miss</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
