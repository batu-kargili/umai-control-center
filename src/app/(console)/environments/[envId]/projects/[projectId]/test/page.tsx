"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ChatMessage,
  ChatRole,
  ContentType,
  Guardrail,
  GuardrailInputArtifact,
  GuardrailSnapshotResponse,
  GuardrailTestResponse,
  GuardrailVersion,
  PhaseFocus,
  POLICY_PHASE_LABELS,
  POLICY_PHASE_OPTIONS,
  PolicyPhase,
  fetchGuardrailSnapshot,
  fetchGuardrailVersions,
  fetchGuardrails,
  testGuardrail,
} from "src/lib/api";
import { useConsole } from "src/app/(console)/console-context";

const PHASE_OPTIONS: PolicyPhase[] = POLICY_PHASE_OPTIONS;
const FOCUS_OPTIONS: PhaseFocus[] = ["LAST_USER_MESSAGE", "LAST_ASSISTANT_MESSAGE"];
const CONTENT_TYPES: ContentType[] = ["text", "markdown", "json"];
const ROLE_OPTIONS: ChatRole[] = ["system", "user", "assistant"];
const ACTION_PHASES: PolicyPhase[] = ["TOOL_INPUT", "MCP_REQUEST", "MEMORY_WRITE"];

type TestHistoryItem = {
  id: string;
  timestamp: string;
  guardrail_id: string;
  guardrail_name: string;
  guardrail_version: number;
  action: string;
  severity: string;
  reason: string;
  latency_ms: number;
};

const createMessage = (): ChatMessage => ({
  role: "user",
  content: "",
});

const inferActionPhaseAction = (phase: PolicyPhase, content: string): string => {
  if (phase === "MEMORY_WRITE") {
    return "write";
  }
  if (
    /(?:delete|remove|drop|destroy|wipe|erase|sil|kaldır|yok et)/i.test(content)
  ) {
    return "delete";
  }
  if (
    /(?:export|share|send|publish|upload|email|forward|dışa aktar|paylaş|gönder|yayınla|yükle)/i.test(
      content
    )
  ) {
    return "export";
  }
  if (
    /(?:write|update|create|save|store|record|modify|grant|revoke|izin|yetki|oluştur|kaydet|güncelle|değiştir)/i.test(
      content
    )
  ) {
    return "write";
  }
  return "read";
};

const inferActionPhaseClassification = (content: string): string | undefined => {
  if (
    /(?:password|şifre|otp|token|api key|secret|credential|kimlik bilgisi)/i.test(
      content
    )
  ) {
    return "credential_material";
  }
  if (/(?:yurt dış|abroad|cross-border|foreign|overseas)/i.test(content)) {
    return "cross_border_transfer_unapproved";
  }
  if (/(?:konum|location|cell tower|base station)/i.test(content)) {
    return "location_data";
  }
  if (/(?:cdr|traffic data|trafik verisi|arama kaydı)/i.test(content)) {
    return "traffic_data";
  }
  if (
    /(?:health|sağlık|religion|din|belief|inanç|politic|siyasi|biometric|biyometrik)/i.test(
      content
    )
  ) {
    return "special_category";
  }
  if (
    /(?:subscriber|abon|müşteri|customer|msisdn|imei|imsi|iccid|tckn|tc kimlik)/i.test(
      content
    )
  ) {
    return "customer_pii";
  }
  return undefined;
};

const buildDefaultActionArtifact = (
  phase: PolicyPhase,
  messages: ChatMessage[]
): GuardrailInputArtifact | null => {
  if (!ACTION_PHASES.includes(phase)) {
    return null;
  }
  const content = messages
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  if (!content) {
    return null;
  }
  const action = inferActionPhaseAction(phase, content);
  const classification = inferActionPhaseClassification(content);
  const isReadOnly = action === "read";
  const metadata: Record<string, unknown> = {
    agent_id: "playground-agent",
    action,
    capability: phase.toLowerCase(),
    params: { prompt: content },
  };
  if (classification) {
    metadata.classification = classification;
  }
  if (!isReadOnly) {
    metadata.side_effect = true;
  }
  if (phase === "TOOL_INPUT") {
    metadata.tool_name = /(?:müşteri|abon|subscriber|customer)/i.test(content)
      ? "subscriber.lookup"
      : "project.lookup";
  }
  if (phase === "MCP_REQUEST") {
    metadata.server_name = "project-mcp";
    metadata.method = action === "delete" ? "delete" : action === "export" ? "write" : "read";
  }
  if (phase === "MEMORY_WRITE") {
    metadata.memory_scope = "conversation";
  }
  return {
    artifact_type: phase as GuardrailInputArtifact["artifact_type"],
    name: null,
    payload_summary: content.slice(0, 160),
    metadata,
  };
};

export default function TestPage() {
  const { envId, projectId } = useParams() as { envId: string; projectId: string };
  const { tenantId } = useConsole();
  const [guardrails, setGuardrails] = useState<Guardrail[]>([]);
  const [guardrailVersions, setGuardrailVersions] = useState<GuardrailVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedGuardrailId, setSelectedGuardrailId] = useState("");
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<GuardrailSnapshotResponse | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [phase, setPhase] = useState<PolicyPhase>("PRE_LLM");
  const [phaseFocus, setPhaseFocus] = useState<PhaseFocus>("LAST_USER_MESSAGE");
  const [contentType, setContentType] = useState<ContentType>("text");
  const [language, setLanguage] = useState("");
  const [timeoutMs, setTimeoutMs] = useState("1500");
  const [allowLlmCalls, setAllowLlmCalls] = useState(true);

  const [messages, setMessages] = useState<ChatMessage[]>([createMessage()]);
  const [running, setRunning] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [result, setResult] = useState<GuardrailTestResponse | null>(null);
  const [history, setHistory] = useState<TestHistoryItem[]>([]);

  const isActionPhase = ACTION_PHASES.includes(phase);

  const selectedGuardrail = useMemo(
    () => guardrails.find((item) => item.guardrail_id === selectedGuardrailId) || null,
    [guardrails, selectedGuardrailId]
  );

  const snapshotPayload = selectedSnapshot?.snapshot ?? null;
  const availablePhaseOptions = useMemo<PolicyPhase[]>(
    () => snapshotPayload?.phases?.length ? snapshotPayload.phases : PHASE_OPTIONS,
    [snapshotPayload]
  );
  const selectedPhasePolicyCount = useMemo(
    () =>
      snapshotPayload
        ? snapshotPayload.policies.filter((policy) => policy.phases.includes(phase)).length
        : 0,
    [snapshotPayload, phase]
  );
  const selectedPhaseUsesAgt = useMemo(
    () => Boolean(snapshotPayload?.agt?.enabled && snapshotPayload.agt.enforced_phases.includes(phase)),
    [snapshotPayload, phase]
  );
  const snapshotModeLabel = useMemo(() => {
    if (!snapshotPayload) return null;
    if (snapshotPayload.policies.length === 0 && snapshotPayload.agt?.enabled) {
      return "AGT-only action governance";
    }
    if (snapshotPayload.agt?.enabled) {
      return "Policies + AGT governance";
    }
    return "Policy-driven guardrail";
  }, [snapshotPayload]);

  useEffect(() => {
    if (!envId || !projectId || !tenantId) return;
    setLoading(true);
    fetchGuardrails(tenantId, envId, projectId)
      .then((data) => {
        setGuardrails(data);
        setSelectedGuardrailId((current) => current || data[0]?.guardrail_id || "");
        setError(null);
      })
      .catch((err: Error) => {
        console.error(err);
        setError("Unable to load guardrails for this project.");
      })
      .finally(() => setLoading(false));
  }, [envId, projectId, tenantId]);

  useEffect(() => {
    if (!selectedGuardrailId || !envId || !projectId || !tenantId) {
      setGuardrailVersions([]);
      setSelectedVersion(null);
      setSelectedSnapshot(null);
      return;
    }
    fetchGuardrailVersions(tenantId, envId, projectId, selectedGuardrailId)
      .then((data) => {
        const sorted = [...data].sort((a, b) => b.version - a.version);
        setGuardrailVersions(sorted);
        setSelectedVersion(
          sorted.find((item) => item.version === selectedGuardrail?.current_version)
            ? selectedGuardrail?.current_version ?? null
            : sorted[0]?.version ?? null
        );
      })
      .catch((err: Error) => {
        console.error(err);
        setGuardrailVersions([]);
        setSelectedVersion(selectedGuardrail?.current_version ?? null);
      });
  }, [envId, projectId, selectedGuardrailId, selectedGuardrail?.current_version, tenantId]);

  useEffect(() => {
    if (!selectedGuardrailId || !selectedVersion || !envId || !projectId || !tenantId) {
      setSelectedSnapshot(null);
      return;
    }
    setSnapshotLoading(true);
    fetchGuardrailSnapshot(tenantId, envId, projectId, selectedGuardrailId, selectedVersion)
      .then((data) => {
        setSelectedSnapshot(data);
        setError(null);
      })
      .catch((err: Error) => {
        console.error(err);
        setSelectedSnapshot(null);
        setError("Unable to load guardrail snapshot details for testing.");
      })
      .finally(() => setSnapshotLoading(false));
  }, [envId, projectId, selectedGuardrailId, selectedVersion, tenantId]);

  useEffect(() => {
    if (availablePhaseOptions.length === 0) return;
    if (!availablePhaseOptions.includes(phase)) {
      setPhase(availablePhaseOptions[0]);
    }
  }, [availablePhaseOptions, phase]);

  useEffect(() => {
    setPhaseFocus(
      phase === "POST_LLM" || phase === "TOOL_OUTPUT" || phase === "MCP_RESPONSE"
        ? "LAST_ASSISTANT_MESSAGE"
        : "LAST_USER_MESSAGE"
    );
  }, [phase]);

  const updateMessage = <K extends keyof ChatMessage>(
    index: number,
    field: K,
    value: ChatMessage[K]
  ) => {
    setMessages((current) =>
      current.map((message, idx) => (idx === index ? { ...message, [field]: value } : message))
    );
  };

  const addMessage = () => {
    setMessages((current) => [...current, createMessage()]);
  };

  const removeMessage = (index: number) => {
    setMessages((current) => current.filter((_, idx) => idx !== index));
  };

  const decisionBadge = (action: string) => {
    if (action === "BLOCK") {
      return "border-danger/20 bg-danger/10 text-danger";
    }
    if (action === "FLAG") {
      return "border-orange-200 bg-orange-50 text-orange-700";
    }
    if (action === "ALLOW_WITH_MODIFICATIONS") {
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    }
    return "border-mint/40 bg-mint/20 text-ink";
  };

  const handleRunTest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!envId || !projectId || !tenantId) return;
    setTestError(null);
    if (!selectedGuardrailId) {
      setTestError("Select a guardrail to test.");
      return;
    }
    const normalizedMessages = messages
      .map((message) => ({
        role: message.role,
        content: message.content.trim(),
      }))
      .filter((message) => message.content);
    if (normalizedMessages.length === 0) {
      setTestError("Add at least one message to run a test.");
      return;
    }
    const timeoutRaw = timeoutMs.trim();
    if (timeoutRaw) {
      const timeoutValue = Number(timeoutRaw);
      if (!Number.isFinite(timeoutValue) || timeoutValue <= 0) {
        setTestError("Timeout must be a positive number.");
        return;
      }
    }

    let artifacts: GuardrailInputArtifact[] | undefined;
    if (isActionPhase) {
      const artifact = buildDefaultActionArtifact(phase, normalizedMessages);
      if (!artifact) {
        setTestError("Action phase tests require at least one message.");
        return;
      }
      artifacts = [artifact];
    }

    setRunning(true);
    try {
      const response = await testGuardrail({
        tenant_id: tenantId,
        environment_id: envId,
        project_id: projectId,
        guardrail_id: selectedGuardrailId,
        guardrail_version: selectedVersion ?? undefined,
        phase,
        input: {
          messages: normalizedMessages,
          phase_focus: phaseFocus,
          content_type: contentType,
          language: language.trim() || undefined,
          artifacts,
        },
        timeout_ms: timeoutRaw ? Number(timeoutRaw) : undefined,
        allow_llm_calls: allowLlmCalls,
      });
      setResult(response);
      if (selectedGuardrail) {
        setHistory((current) => {
          const entry: TestHistoryItem = {
            id: response.request_id,
            timestamp: new Date().toLocaleTimeString(),
            guardrail_id: selectedGuardrail.guardrail_id,
            guardrail_name: selectedGuardrail.name,
            guardrail_version: response.guardrail_version,
            action: response.decision.action,
            severity: response.decision.severity,
            reason: response.decision.reason,
            latency_ms: response.latency_ms.total,
          };
          return [entry, ...current].slice(0, 6);
        });
      }
    } catch (err) {
      console.error(err);
      setTestError("Test failed. Check the guardrail and try again.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-10 fade-up">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">Test</p>
          <h2 className="font-display text-4xl font-bold text-ink tracking-tight">
            Guardrail Playground
          </h2>
          <p className="mt-1 text-sm text-slate">
            Select a guardrail, craft messages, and inspect the enforcement response.
          </p>
        </div>
        <div className="rounded-full bg-slate/10 px-4 py-2 text-xs font-semibold text-slate">
          {loading ? "Loading..." : `${guardrails.length} guardrails`}
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-xs text-danger">
          {error}
        </div>
      )}

      {testError && (
        <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-xs text-danger">
          {testError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-3xl border border-slate/10 bg-white p-8 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl font-bold text-ink">Playground</h3>
            <span className="text-xs text-slate">
              {selectedGuardrail ? selectedGuardrail.name : "Select a guardrail"}
            </span>
          </div>

          <form className="mt-6 space-y-6" onSubmit={handleRunTest}>
            <div className="rounded-2xl border border-slate/10 bg-slate/5 p-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                    Guardrail
                  </label>
                  <select
                    className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm"
                    value={selectedGuardrailId}
                    onChange={(event) => setSelectedGuardrailId(event.target.value)}
                    disabled={loading}
                  >
                    <option value="">Select guardrail</option>
                    {guardrails.map((guardrail) => (
                      <option key={guardrail.guardrail_id} value={guardrail.guardrail_id}>
                        {guardrail.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                    Version
                  </label>
                  <select
                    className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm"
                    value={selectedVersion ?? ""}
                    onChange={(event) =>
                      setSelectedVersion(
                        event.target.value ? Number(event.target.value) : null
                      )
                    }
                    disabled={!selectedGuardrailId}
                  >
                    <option value="">Select version</option>
                    {guardrailVersions.map((item) => (
                      <option key={item.version} value={item.version}>
                        v{item.version}
                        {item.version === selectedGuardrail?.current_version ? " (current)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                    Phase
                  </label>
                  <select
                    className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm"
                    value={phase}
                    onChange={(event) => setPhase(event.target.value as PolicyPhase)}
                    disabled={availablePhaseOptions.length === 0}
                  >
                    {availablePhaseOptions.map((option) => (
                      <option key={option} value={option}>
                        {POLICY_PHASE_LABELS[option]} ({option})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                    Phase Focus
                  </label>
                  <select
                    className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm"
                    value={phaseFocus}
                    onChange={(event) => setPhaseFocus(event.target.value as PhaseFocus)}
                  >
                    {FOCUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {snapshotPayload && (
                <div className="rounded-2xl border border-slate/10 bg-white px-4 py-3 text-xs text-slate">
                  <div className="flex flex-wrap items-center gap-2">
                    {snapshotModeLabel ? (
                      <span className="rounded-full bg-slate/10 px-2 py-1 font-semibold text-ink">
                        {snapshotModeLabel}
                      </span>
                    ) : null}
                    <span className="rounded-full bg-slate/10 px-2 py-1">
                      v{selectedVersion}
                    </span>
                    {selectedPhasePolicyCount > 0 ? (
                      <span className="rounded-full bg-slate/10 px-2 py-1">
                        {selectedPhasePolicyCount} policy check
                        {selectedPhasePolicyCount === 1 ? "" : "s"} on {phase}
                      </span>
                    ) : null}
                    {selectedPhaseUsesAgt ? (
                      <span className="rounded-full bg-slate/10 px-2 py-1">
                        AGT enforced on {phase}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-[11px]">
                    {selectedPhasePolicyCount === 0 && selectedPhaseUsesAgt
                      ? "This phase is governed by AGT action rules. The playground derives a default action request from your prompt."
                      : selectedPhasePolicyCount > 0
                        ? "This phase has active heuristic or context-aware policy checks."
                        : "This selected version does not have active controls for this phase."}
                  </p>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                    Content Type
                  </label>
                  <select
                    className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm"
                    value={contentType}
                    onChange={(event) => setContentType(event.target.value as ContentType)}
                  >
                    {CONTENT_TYPES.map((option) => (
                      <option key={option} value={option}>
                        {option.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                    Language (optional)
                  </label>
                  <input
                    className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm"
                    value={language}
                    onChange={(event) => setLanguage(event.target.value)}
                    placeholder="tr"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                    Timeout (ms)
                  </label>
                  <input
                    className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm"
                    value={timeoutMs}
                    onChange={(event) => setTimeoutMs(event.target.value)}
                    placeholder="1500"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate">
                <input
                  type="checkbox"
                  checked={allowLlmCalls}
                  onChange={(event) => setAllowLlmCalls(event.target.checked)}
                />
                Allow LLM calls during test
              </label>
              {snapshotLoading && (
                <p className="text-[11px] text-slate/60">Loading selected version coverage...</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate/10 bg-white p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                  Conversation
                </p>
                <button
                  type="button"
                  className="text-xs font-semibold text-accent"
                  onClick={addMessage}
                >
                  + Add message
                </button>
              </div>

              <div className="space-y-3">
                {messages.map((message, index) => (
                  <div
                    key={`message-${index}`}
                    className="rounded-xl border border-slate/10 bg-slate/5 p-3 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-ink">Message {index + 1}</p>
                      <button
                        type="button"
                        className="text-[10px] font-semibold text-danger disabled:text-slate/40"
                        disabled={messages.length === 1}
                        onClick={() => removeMessage(index)}
                      >
                        Remove
                      </button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-[130px_1fr]">
                      <select
                        className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-xs"
                        value={message.role}
                        onChange={(event) =>
                          updateMessage(index, "role", event.target.value as ChatRole)
                        }
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option.toUpperCase()}
                          </option>
                        ))}
                      </select>
                      <textarea
                        className="h-24 w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-xs font-mono"
                        placeholder="Write a message to test..."
                        value={message.content}
                        onChange={(event) =>
                          updateMessage(index, "content", event.target.value)
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90"
              disabled={running}
            >
              {running ? "Running..." : "Run Test"}
            </button>
          </form>
        </section>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-slate/10 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-ink">Latest Result</h3>
              {result && (
                <span className="text-[10px] font-semibold text-slate/60">
                  {result.request_id}
                </span>
              )}
            </div>

            {running ? (
              <div className="py-10 text-center text-sm text-slate/50">
                Running guardrail test...
              </div>
            ) : result ? (
              <div className="mt-4 space-y-4">
                <div
                  className={`rounded-2xl border px-4 py-3 text-xs font-semibold ${decisionBadge(
                    result.decision.action
                  )}`}
                >
                  {result.decision.action} - {result.decision.severity}
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink">Reason</p>
                  <p className="mt-1 text-sm text-slate">{result.decision.reason}</p>
                </div>
                <div className="grid gap-3 text-xs text-slate sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/50">
                      Guardrail Version
                    </p>
                    <p className="mt-1 text-sm font-semibold text-ink">
                      v{result.guardrail_version}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/50">
                      Phase
                    </p>
                    <p className="mt-1 text-sm font-semibold text-ink">{result.phase}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/50">
                      Total Latency
                    </p>
                    <p className="mt-1 text-sm font-semibold text-ink">
                      {Math.round(result.latency_ms.total)} ms
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/50">
                      Preflight
                    </p>
                    <p className="mt-1 text-sm font-semibold text-ink">
                      {result.latency_ms.preflight != null
                        ? `${Math.round(result.latency_ms.preflight)} ms`
                        : "n/a"}
                    </p>
                  </div>
                </div>

                {result.errors.length > 0 && (
                  <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-xs text-danger">
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em]">
                      Errors
                    </p>
                    <ul className="mt-2 space-y-1 text-[11px]">
                      {result.errors.map((err, index) => (
                        <li key={`${err.type}-${index}`}>
                          {err.type}: {err.message || "Unhandled error"}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-10 text-center text-sm text-slate/50">
                Run a test to see the decision output.
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate/10 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-ink">Triggering Policy</h3>
            {result?.triggering_policy ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-slate/10 bg-slate/5 px-4 py-3">
                  <p className="text-sm font-semibold text-ink">{result.triggering_policy.name}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-slate/50">
                    {result.triggering_policy.policy_id}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold text-slate/70">
                    <span className="rounded-full bg-slate/10 px-2 py-1">
                      {result.triggering_policy.type}
                    </span>
                    <span className="rounded-full bg-slate/10 px-2 py-1">
                      {result.triggering_policy.status}
                    </span>
                    <span className="rounded-full bg-slate/10 px-2 py-1">
                      {result.triggering_policy.severity}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink">Details</p>
                  <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-slate/10 bg-white px-3 py-2 text-[11px] text-slate">
                    {JSON.stringify(result.triggering_policy.details, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate/50">
                No triggering policy returned.
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate/10 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-ink">Recent Runs</h3>
              <span className="text-xs text-slate">{history.length} saved</span>
            </div>
            <div className="mt-4 space-y-3">
              {history.length === 0 ? (
                <div className="rounded-2xl border border-slate/10 bg-slate/5 px-4 py-6 text-center text-xs text-slate/50">
                  No tests yet.
                </div>
              ) : (
                history.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-slate/10 bg-white px-4 py-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-ink">{item.guardrail_name}</p>
                      <span className="text-[10px] text-slate/50">{item.timestamp}</span>
                    </div>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-slate/50">
                      {item.guardrail_id} - v{item.guardrail_version}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold text-slate/70">
                      <span className="rounded-full bg-slate/10 px-2 py-1">{item.action}</span>
                      <span className="rounded-full bg-slate/10 px-2 py-1">
                        {item.severity}
                      </span>
                      <span className="rounded-full bg-slate/10 px-2 py-1">
                        {Math.round(item.latency_ms)} ms
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate">{item.reason}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
