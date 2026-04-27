"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Ban,
  Bot,
  CheckCircle2,
  Copy,
  GitBranch,
  KeyRound,
  Network,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";

import { useConsole } from "src/app/(console)/console-context";
import {
  AgentBootstrapTokenResponse,
  AgentRegistryItem,
  AgentRunDetail,
  AgentRunSession,
  AgentRunStep,
  createAgentBootstrapToken,
  fetchAgentRegistry,
  fetchAgentRun,
  fetchAgentRuns,
  updateAgentKillSwitch,
  upsertAgentRegistry,
} from "src/lib/api";

type Tab = "runs" | "registry" | "trust" | "policies";

const tabs: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: "runs", label: "Runs", icon: GitBranch },
  { id: "registry", label: "Registry", icon: Bot },
  { id: "trust", label: "Trust", icon: ShieldAlert },
  { id: "policies", label: "Action Policies", icon: Network },
];

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function shortId(value?: string | null) {
  if (!value) return "-";
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function decisionClass(action?: string | null) {
  if (action === "BLOCK") return "border-red-200 bg-red-50 text-red-800";
  if (action === "STEP_UP_APPROVAL") return "border-amber-200 bg-amber-50 text-amber-800";
  if (action === "ALLOW_WITH_WARNINGS" || action === "FLAG") {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function treeDepth(step: AgentRunStep, byId: Map<string, AgentRunStep>) {
  let depth = 0;
  let current = step.parent_step_id ? byId.get(step.parent_step_id) : undefined;
  while (current && depth < 8) {
    depth += 1;
    current = current.parent_step_id ? byId.get(current.parent_step_id) : undefined;
  }
  return depth;
}

export default function AgentsPage({
  params,
}: {
  params: { envId: string; projectId: string };
}) {
  const { tenantId } = useConsole();
  const [activeTab, setActiveTab] = useState<Tab>("runs");
  const [runs, setRuns] = useState<AgentRunSession[]>([]);
  const [registry, setRegistry] = useState<AgentRegistryItem[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgentRunDetail | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<AgentBootstrapTokenResponse | null>(null);
  const [newAgentId, setNewAgentId] = useState("");
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentRuntime, setNewAgentRuntime] = useState("openai-agents");
  const [newAgentCapabilities, setNewAgentCapabilities] = useState("crm:read,orders:read");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedStep = useMemo(
    () => detail?.steps.find((step) => step.step_id === selectedStepId) || detail?.steps[0] || null,
    [detail, selectedStepId]
  );

  const stepById = useMemo(() => {
    const map = new Map<string, AgentRunStep>();
    detail?.steps.forEach((step) => map.set(step.step_id, step));
    return map;
  }, [detail]);

  const refresh = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [runRows, registryRows] = await Promise.all([
        fetchAgentRuns(tenantId, params.envId, params.projectId, { limit: 100 }),
        fetchAgentRegistry(tenantId, params.envId, params.projectId),
      ]);
      setRuns(runRows);
      setRegistry(registryRows);
      const nextRunId = selectedRunId || runRows[0]?.run_id || null;
      setSelectedRunId(nextRunId);
      if (nextRunId) {
        const runDetail = await fetchAgentRun(tenantId, params.envId, params.projectId, nextRunId);
        setDetail(runDetail);
        setSelectedStepId(runDetail.steps[0]?.step_id || null);
      } else {
        setDetail(null);
        setSelectedStepId(null);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load Agent Mesh governance data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, params.envId, params.projectId]);

  useEffect(() => {
    if (!tenantId || !selectedRunId) return;
    void fetchAgentRun(tenantId, params.envId, params.projectId, selectedRunId)
      .then((runDetail) => {
        setDetail(runDetail);
        setSelectedStepId(runDetail.steps[0]?.step_id || null);
      })
      .catch(() => setError("Failed to load selected agent run."));
  }, [tenantId, params.envId, params.projectId, selectedRunId]);

  const createBootstrap = async (agent: AgentRegistryItem) => {
    if (!tenantId) return;
    setError(null);
    try {
      const token = await createAgentBootstrapToken({
        tenant_id: tenantId,
        environment_id: params.envId,
        project_id: params.projectId,
        agent_id: agent.agent_id,
      });
      setBootstrap(token);
    } catch (err) {
      console.error(err);
      setError("Failed to create bootstrap token.");
    }
  };

  const toggleKillSwitch = async (agent: AgentRegistryItem) => {
    if (!tenantId) return;
    setError(null);
    try {
      await updateAgentKillSwitch({
        tenant_id: tenantId,
        environment_id: params.envId,
        project_id: params.projectId,
        agent_id: agent.agent_id,
        enabled: !agent.kill_switch_enabled,
        reason: !agent.kill_switch_enabled ? "Operator activated from Control Center" : undefined,
      });
      await refresh();
    } catch (err) {
      console.error(err);
      setError("Failed to update kill switch.");
    }
  };

  const createAgent = async () => {
    if (!tenantId || !newAgentId.trim() || !newAgentName.trim()) return;
    setError(null);
    try {
      await upsertAgentRegistry({
        tenant_id: tenantId,
        environment_id: params.envId,
        project_id: params.projectId,
        agent_id: newAgentId.trim(),
        display_name: newAgentName.trim(),
        runtime: newAgentRuntime.trim() || "generic",
        capabilities: newAgentCapabilities
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      });
      setNewAgentId("");
      setNewAgentName("");
      await refresh();
    } catch (err) {
      console.error(err);
      setError("Failed to save agent.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
            Agent Mesh Governance
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold text-ink">Agents</h1>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate/15 bg-white px-4 text-xs font-semibold text-slate"
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {bootstrap ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-semibold">Bootstrap token for {bootstrap.agent_id}</p>
              <p className="font-mono text-xs">{bootstrap.bootstrap_token}</p>
              <p className="mt-1 text-xs">Expires {formatDate(bootstrap.expires_at)}</p>
            </div>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-amber-900 px-3 text-xs font-semibold text-white"
              onClick={() => void navigator.clipboard?.writeText(bootstrap.bootstrap_token)}
            >
              <Copy className="h-4 w-4" />
              Copy
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-slate/10">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-xs font-semibold ${
              activeTab === tab.id
                ? "border-secondary text-secondary"
                : "border-transparent text-slate hover:text-ink"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "runs" ? (
        <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
          <section className="rounded-2xl border border-slate/10 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Sessions</h2>
              <span className="text-xs text-slate">{runs.length}</span>
            </div>
            <div className="space-y-2">
              {runs.length === 0 ? (
                <p className="py-8 text-sm text-slate">No agent runs recorded yet.</p>
              ) : (
                runs.map((run) => (
                  <button
                    key={run.run_id}
                    type="button"
                    onClick={() => setSelectedRunId(run.run_id)}
                    className={`w-full rounded-xl border px-3 py-3 text-left text-xs transition ${
                      selectedRunId === run.run_id
                        ? "border-secondary/40 bg-secondary/8"
                        : "border-slate/10 bg-white hover:bg-slate/5"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink">{run.agent_id}</span>
                      <span className={`rounded-full border px-2 py-0.5 ${decisionClass(run.decision_action)}`}>
                        {run.decision_action || run.status}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-slate">{shortId(run.run_id)}</p>
                    <p className="mt-1 text-slate">{run.step_count} steps | {formatDate(run.started_at)}</p>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate/10 bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-ink">Work Tree</h2>
                <p className="text-xs text-slate">{detail?.run_id ? shortId(detail.run_id) : "-"}</p>
              </div>
              <GitBranch className="h-5 w-5 text-slate/50" />
            </div>
            <div className="space-y-2">
              {!detail ? (
                <p className="py-10 text-sm text-slate">Select a run to inspect its work tree.</p>
              ) : detail.steps.length === 0 ? (
                <p className="py-10 text-sm text-slate">This run has no recorded steps.</p>
              ) : (
                detail.steps.map((step) => {
                  const depth = treeDepth(step, stepById);
                  return (
                    <button
                      key={step.step_id}
                      type="button"
                      onClick={() => setSelectedStepId(step.step_id)}
                      className={`grid w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border px-3 py-2 text-left text-xs ${
                        selectedStep?.step_id === step.step_id
                          ? "border-secondary/40 bg-secondary/8"
                          : "border-slate/10 hover:bg-slate/5"
                      }`}
                      style={{ marginLeft: `${Math.min(depth, 5) * 18}px`, width: `calc(100% - ${Math.min(depth, 5) * 18}px)` }}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate/5 text-slate">
                        {step.decision_action === "BLOCK" ? (
                          <Ban className="h-4 w-4 text-red-600" />
                        ) : step.status === "FAILED" ? (
                          <TriangleAlert className="h-4 w-4 text-amber-600" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink">
                          {step.event_type} {step.resource_name ? `| ${step.resource_name}` : ""}
                        </span>
                        <span className="block truncate text-slate">
                          {step.phase || "runtime"} | {step.payload_summary || step.step_id}
                        </span>
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 ${decisionClass(step.decision_action)}`}>
                        {step.decision_action || step.status}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate/10 bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Step Detail</h2>
              <KeyRound className="h-5 w-5 text-slate/50" />
            </div>
            {selectedStep ? (
              <div className="space-y-3 text-xs">
                {[
                  ["Step", selectedStep.step_id],
                  ["Parent", selectedStep.parent_step_id || "-"],
                  ["Agent", selectedStep.agent_id],
                  ["DID", shortId(selectedStep.agent_did)],
                  ["Phase", selectedStep.phase || "-"],
                  ["Action", selectedStep.action || "-"],
                  ["Resource", selectedStep.resource_name || "-"],
                  ["Decision", selectedStep.decision_action || "-"],
                  ["Severity", selectedStep.decision_severity || "-"],
                  ["Policy", selectedStep.policy_id || "-"],
                  ["Rule", selectedStep.matched_rule_id || "-"],
                  ["Latency", selectedStep.latency_ms ? `${Math.round(selectedStep.latency_ms)} ms` : "-"],
                  ["Hash", shortId(selectedStep.step_hash)],
                  ["Audit", shortId(selectedStep.audit_event_id)],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 border-b border-slate/10 pb-2">
                    <span className="text-slate">{label}</span>
                    <span className="max-w-[220px] truncate text-right font-mono text-ink">{value}</span>
                  </div>
                ))}
                {selectedStep.decision_reason ? (
                  <p className="rounded-xl bg-slate/5 p-3 text-slate">{selectedStep.decision_reason}</p>
                ) : null}
              </div>
            ) : (
              <p className="py-10 text-sm text-slate">No step selected.</p>
            )}
          </section>
        </div>
      ) : null}

      {activeTab === "registry" ? (
        <section className="space-y-4 rounded-2xl border border-slate/10 bg-white p-4">
          <div className="grid gap-3 border-b border-slate/10 pb-4 lg:grid-cols-[1fr_1fr_180px_1fr_auto]">
            <input
              value={newAgentId}
              onChange={(event) => setNewAgentId(event.target.value)}
              placeholder="agent-id"
              className="h-10 rounded-lg border border-slate/15 px-3 text-sm text-ink"
            />
            <input
              value={newAgentName}
              onChange={(event) => setNewAgentName(event.target.value)}
              placeholder="Display name"
              className="h-10 rounded-lg border border-slate/15 px-3 text-sm text-ink"
            />
            <input
              value={newAgentRuntime}
              onChange={(event) => setNewAgentRuntime(event.target.value)}
              placeholder="runtime"
              className="h-10 rounded-lg border border-slate/15 px-3 text-sm text-ink"
            />
            <input
              value={newAgentCapabilities}
              onChange={(event) => setNewAgentCapabilities(event.target.value)}
              placeholder="capability,capability"
              className="h-10 rounded-lg border border-slate/15 px-3 text-sm text-ink"
            />
            <button
              type="button"
              onClick={() => void createAgent()}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-ink px-4 text-xs font-semibold text-white"
            >
              Save Agent
            </button>
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className="bg-slate/5 text-[11px] uppercase tracking-[0.18em] text-slate/70">
                <tr>
                  <th className="px-3 py-2">Agent</th>
                  <th className="px-3 py-2">Identity</th>
                  <th className="px-3 py-2">Trust</th>
                  <th className="px-3 py-2">Capabilities</th>
                  <th className="px-3 py-2">Last Seen</th>
                  <th className="px-3 py-2">Controls</th>
                </tr>
              </thead>
              <tbody>
                {registry.map((agent) => (
                  <tr key={agent.agent_id} className="border-t border-slate/10">
                    <td className="px-3 py-3">
                      <p className="font-semibold text-ink">{agent.display_name}</p>
                      <p className="text-slate">{agent.agent_id} | {agent.runtime}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-ink">{agent.identity_status}</p>
                      <p className="font-mono text-[11px] text-slate">{shortId(agent.agent_did)}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-ink">{agent.trust_tier}</p>
                      <p className="text-slate">{Math.round(agent.trust_score * 100)}%</p>
                    </td>
                    <td className="max-w-[260px] px-3 py-3 text-slate">
                      {agent.capabilities.length ? agent.capabilities.join(", ") : "-"}
                    </td>
                    <td className="px-3 py-3 text-slate">{formatDate(agent.last_seen_at)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void createBootstrap(agent)}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate/15 px-2 font-semibold text-slate"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Token
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleKillSwitch(agent)}
                          className={`inline-flex h-8 items-center gap-1 rounded-lg px-2 font-semibold ${
                            agent.kill_switch_enabled
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-red-50 text-red-800"
                          }`}
                        >
                          <Ban className="h-3.5 w-3.5" />
                          {agent.kill_switch_enabled ? "Enable" : "Kill"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {registry.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-slate" colSpan={6}>
                      No agents registered for this project.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === "trust" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {["SANDBOX", "STANDARD", "PRIVILEGED"].map((tier) => {
            const agents = registry.filter((agent) => agent.trust_tier === tier);
            return (
              <section key={tier} className="rounded-2xl border border-slate/10 bg-white p-4">
                <p className="text-xs font-semibold text-slate">{tier}</p>
                <p className="mt-2 text-3xl font-bold text-ink">{agents.length}</p>
                <div className="mt-4 space-y-2">
                  {agents.map((agent) => (
                    <div key={agent.agent_id} className="flex items-center justify-between text-xs">
                      <span className="truncate text-slate">{agent.agent_id}</span>
                      <span className="font-semibold text-ink">{Math.round(agent.trust_score * 100)}%</span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

      {activeTab === "policies" ? (
        <section className="rounded-2xl border border-slate/10 bg-white p-4">
          <div className="grid gap-3 lg:grid-cols-3">
            {[
              ["TOOL_INPUT", "Signed identity, tool metadata, trust tier"],
              ["MCP_REQUEST", "Server, method, action family"],
              ["MEMORY_WRITE", "Memory scope and classification"],
            ].map(([phase, detailText]) => (
              <div key={phase} className="rounded-xl border border-slate/10 p-4">
                <p className="font-mono text-xs font-semibold text-ink">{phase}</p>
                <p className="mt-2 text-xs text-slate">{detailText}</p>
                <p className="mt-4 inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-800">
                  Advisory default
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
