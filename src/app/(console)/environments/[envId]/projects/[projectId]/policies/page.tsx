"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FilePlus2,
  Layers3,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";

import {
  createPolicy,
  deployPolicyTemplate,
  fetchPolicies,
  fetchPolicyLibrary,
  Policy,
  PolicyLibraryItem,
  PolicyPhase,
  PolicyScope,
} from "src/lib/api";
import { useConsole } from "src/app/(console)/console-context";
import {
  buildGenericContextDraft,
  DraftArgs,
  PolicyDraft,
  formatScope,
  inferStarter,
  parseExamples,
  PHASE_LABELS,
  PHASE_OPTIONS,
  slugify,
  STARTERS,
  summarizePolicy,
} from "./policy-drafts";

type PolicyTab = "create" | "templates" | "existing";
type CreationStage = "compose" | "review" | "success";

export default function PoliciesPage() {
  const { envId, projectId } = useParams() as { envId: string; projectId: string };
  const { tenantId } = useConsole();
  const router = useRouter();

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [policyLibrary, setPolicyLibrary] = useState<PolicyLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [builderError, setBuilderError] = useState<string | null>(null);
  const [builderNotice, setBuilderNotice] = useState<string | null>(null);
  const [deployingTemplate, setDeployingTemplate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [activeTab, setActiveTab] = useState<PolicyTab>("create");
  const [creationStage, setCreationStage] = useState<CreationStage>("compose");
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [intent, setIntent] = useState("");
  const [selectedStarterId, setSelectedStarterId] = useState<string | null>(null);
  const [tailoring, setTailoring] = useState("");
  const [blockedExamplesText, setBlockedExamplesText] = useState("");
  const [allowedExamplesText, setAllowedExamplesText] = useState("");

  const [reviewDraft, setReviewDraft] = useState<PolicyDraft | null>(null);
  const [createdPolicy, setCreatedPolicy] = useState<Policy | null>(null);

  const [nameOverride, setNameOverride] = useState("");
  const [idOverride, setIdOverride] = useState("");
  const [idManuallyEdited, setIdManuallyEdited] = useState(false);
  const [scopeOverride, setScopeOverride] = useState<PolicyScope>("PROJECT");
  const [enabledOverride, setEnabledOverride] = useState(true);
  const [phaseOverride, setPhaseOverride] = useState<PolicyPhase[] | null>(null);

  useEffect(() => {
    if (!envId || !projectId || !tenantId) {
      return;
    }
    setLoading(true);
    setLibraryLoading(true);
    Promise.allSettled([
      fetchPolicies(tenantId, envId, projectId),
      fetchPolicyLibrary(),
    ])
      .then(([policyResult, libraryResult]) => {
        if (policyResult.status === "fulfilled") {
          setPolicies(policyResult.value);
          setError(null);
        } else {
          console.error(policyResult.reason);
          setError("Unable to load policies for this project.");
        }
        if (libraryResult.status === "fulfilled") {
          setPolicyLibrary(libraryResult.value);
          setLibraryError(null);
        } else {
          console.error(libraryResult.reason);
          setLibraryError("Unable to load the policy library.");
        }
      })
      .finally(() => {
        setLoading(false);
        setLibraryLoading(false);
      });
  }, [envId, projectId, tenantId]);

  const selectedStarter = useMemo(
    () => STARTERS.find((starter) => starter.id === selectedStarterId) || null,
    [selectedStarterId]
  );

  const blockedExamples = useMemo(() => parseExamples(blockedExamplesText), [blockedExamplesText]);
  const allowedExamples = useMemo(() => parseExamples(allowedExamplesText), [allowedExamplesText]);

  const composerDraft = useMemo(() => {
    const args: DraftArgs = {
      intent: intent.trim(),
      tailoring: tailoring.trim(),
      blockedExamples,
      allowedExamples,
    };
    if (!args.intent && !selectedStarter && blockedExamples.length === 0 && allowedExamples.length === 0) {
      return null;
    }
    const inferredStarter = selectedStarter || inferStarter(args);
    if (inferredStarter) {
      return inferredStarter.build(args);
    }
    return buildGenericContextDraft(args);
  }, [allowedExamples, blockedExamples, intent, selectedStarter, tailoring]);

  const draftForReview = reviewDraft;
  const resolvedDraftName = nameOverride.trim() || draftForReview?.name || "";
  const resolvedDraftId = idOverride.trim() || draftForReview?.policyId || "";
  const resolvedDraftPhases = phaseOverride || draftForReview?.phases || ["PRE_LLM"];
  const configPreviewText = draftForReview ? JSON.stringify(draftForReview.config, null, 2) : "";

  const deployedPolicyIds = useMemo(
    () => new Set(policies.map((policy) => policy.policy_id)),
    [policies]
  );

  const resetComposer = () => {
    setIntent("");
    setSelectedStarterId(null);
    setTailoring("");
    setBlockedExamplesText("");
    setAllowedExamplesText("");
    setReviewDraft(null);
    setCreatedPolicy(null);
    setNameOverride("");
    setIdOverride("");
    setIdManuallyEdited(false);
    setScopeOverride("PROJECT");
    setEnabledOverride(true);
    setPhaseOverride(null);
    setExamplesOpen(false);
    setAdvancedOpen(false);
    setCreationStage("compose");
    setBuilderError(null);
  };

  const returnToCompose = () => {
    setCreationStage("compose");
    setReviewDraft(null);
    setCreatedPolicy(null);
    setBuilderError(null);
  };

  const updateComposer = (fn: () => void) => {
    fn();
    if (creationStage !== "compose") {
      returnToCompose();
    }
  };

  const handleStarterSelect = (starterId: string) => {
    const starter = STARTERS.find((item) => item.id === starterId);
    if (!starter) {
      return;
    }
    updateComposer(() => {
      setSelectedStarterId((current) => (current === starterId ? null : starterId));
      setBuilderNotice(null);
      if (!intent.trim()) {
        setIntent(starter.defaultIntent);
      }
    });
  };

  const handleGenerateDraft = () => {
    setBuilderError(null);
    setBuilderNotice(null);
    if (!composerDraft) {
      setBuilderError("Describe the rule or provide examples first.");
      return;
    }
    setReviewDraft(composerDraft);
    setNameOverride(composerDraft.name);
    setIdOverride(ensureUniquePolicyId(composerDraft.policyId, deployedPolicyIds));
    setIdManuallyEdited(false);
    setScopeOverride(composerDraft.scope);
    setEnabledOverride(composerDraft.enabled);
    setPhaseOverride(composerDraft.phases);
    setAdvancedOpen(false);
    setCreationStage("review");
  };

  const handleTogglePhase = (phase: PolicyPhase) => {
    const current = phaseOverride || draftForReview?.phases || ["PRE_LLM"];
    const next = current.includes(phase)
      ? current.filter((value) => value !== phase)
      : [...current, phase];
    setPhaseOverride(next);
  };

  const handleCreatePolicy = async () => {
    setBuilderError(null);
    setBuilderNotice(null);
    if (!tenantId) {
      setBuilderError("Tenant is not available.");
      return;
    }
    if (!draftForReview) {
      setBuilderError("Generate a draft before creating the policy.");
      return;
    }
    if (!resolvedDraftName || !resolvedDraftId) {
      setBuilderError("Policy name and ID cannot be empty.");
      return;
    }
    if (deployedPolicyIds.has(resolvedDraftId)) {
      setBuilderError(
        "Policy ID already exists in this project. Change the name or edit the ID in Advanced settings."
      );
      return;
    }
    if (resolvedDraftPhases.length === 0) {
      setBuilderError("Choose at least one phase.");
      return;
    }

    setSaving(true);
    try {
      const created = await createPolicy({
        tenant_id: tenantId,
        environment_id: envId,
        project_id: projectId,
        policy_id: resolvedDraftId,
        name: resolvedDraftName,
        type: draftForReview.type,
        enabled: enabledOverride,
        phases: resolvedDraftPhases,
        config: draftForReview.config,
        scope: scopeOverride,
      });
      setPolicies((current) => [created, ...current]);
      setCreatedPolicy(created);
      setCreationStage("success");
      setBuilderNotice(`${created.name} created successfully.`);
    } catch (err) {
      console.error(err);
      setBuilderError(
        err instanceof Error ? err.message : "Policy creation failed. Check the draft and try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeployPolicy = async (template: PolicyLibraryItem) => {
    if (!envId || !projectId || !tenantId) {
      return;
    }
    if (deployedPolicyIds.has(template.default_policy_id)) {
      return;
    }
    setLibraryError(null);
    setBuilderNotice(null);
    setDeployingTemplate(template.template_id);
    try {
      const deployed = await deployPolicyTemplate({
        tenant_id: tenantId,
        environment_id: envId,
        project_id: projectId,
        template_id: template.template_id,
      });
      setPolicies((current) => [deployed, ...current]);
      setBuilderNotice(`${template.name} deployed to this project.`);
      setActiveTab("existing");
    } catch (err) {
      console.error(err);
      setLibraryError("Policy deployment failed. Try again.");
    } finally {
      setDeployingTemplate(null);
    }
  };

  return (
    <div className="space-y-10 fade-up">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
            Policies
          </p>
          <h2 className="font-display text-4xl font-bold tracking-tight text-ink">
            Create Policies
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate">
            Pick one clear path: create a new policy, deploy a starter, or review what
            is already active.
          </p>
        </div>
        <div className="rounded-full bg-slate/10 px-4 py-2 text-xs font-semibold text-slate">
          {policies.length} policies
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <TabButton
          active={activeTab === "create"}
          icon={<FilePlus2 className="h-4 w-4" />}
          label="Create"
          onClick={() => setActiveTab("create")}
        />
        <TabButton
          active={activeTab === "templates"}
          icon={<Layers3 className="h-4 w-4" />}
          label="Templates"
          onClick={() => setActiveTab("templates")}
        />
        <TabButton
          active={activeTab === "existing"}
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Existing"
          onClick={() => setActiveTab("existing")}
        />
      </div>

      {error && (
        <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-xs text-danger">
          {error}
        </div>
      )}

      {builderNotice && (
        <div className="rounded-2xl border border-mint/40 bg-mint/20 px-4 py-3 text-xs text-ink">
          {builderNotice}
        </div>
      )}

      {activeTab === "create" && (
        <div className="space-y-6">
          <CreateFlowHeader stage={creationStage} />

          {builderError && (
            <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-xs text-danger">
              {builderError}
            </div>
          )}

          {creationStage === "compose" && (
            <section className="rounded-3xl border border-slate/10 bg-white p-8 shadow-sm">
              <div className="max-w-4xl space-y-6">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                    Step 1
                  </p>
                  <h3 className="mt-2 font-display text-3xl font-bold text-ink">
                    What should this policy protect against?
                  </h3>
                  <p className="mt-2 text-sm text-slate">
                    Start with one sentence. If you have examples, add them below. UMAI
                    will draft the policy for review.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate/10 bg-slate/5 p-5">
                  <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                    Describe it
                  </label>
                  <textarea
                    className="mt-3 h-32 w-full rounded-2xl border border-slate/10 bg-white px-4 py-3 text-sm text-ink shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15"
                    placeholder="Example: Block policy numbers, claim IDs, and customer reference numbers in both customer messages and AI responses."
                    value={intent}
                    onChange={(event) =>
                      updateComposer(() => setIntent(event.target.value))
                    }
                  />
                </div>

                <div className="rounded-2xl border border-slate/10 bg-white p-5">
                  <div className="flex items-center gap-2">
                    <Wand2 className="h-4 w-4 text-ink" />
                    <p className="text-sm font-semibold text-ink">Use a starter</p>
                  </div>
                  <p className="mt-2 text-xs text-slate">
                    Choose a proven direction if your rule matches a common protection.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {STARTERS.map((starter) => {
                      const active = starter.id === selectedStarterId;
                      return (
                        <button
                          key={starter.id}
                          type="button"
                          className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                            active
                              ? "bg-ink text-white"
                              : "border border-slate/10 bg-white text-slate hover:bg-slate/5"
                          }`}
                          onClick={() => handleStarterSelect(starter.id)}
                        >
                          {starter.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate/10 bg-white p-5">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-left"
                    onClick={() => setExamplesOpen((current) => !current)}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <BookOpenText className="h-4 w-4 text-ink" />
                        <p className="text-sm font-semibold text-ink">Paste examples</p>
                      </div>
                      <p className="mt-2 text-xs text-slate">
                        Best for customer-specific rules like claim IDs, internal codes,
                        or product names.
                      </p>
                    </div>
                    {examplesOpen ? (
                      <ChevronUp className="h-4 w-4 text-slate" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate" />
                    )}
                  </button>

                  {examplesOpen && (
                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                          Block these examples
                        </label>
                        <textarea
                          className="h-36 w-full rounded-2xl border border-slate/10 bg-slate/5 px-4 py-3 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15"
                          placeholder={"TR33 0006 1005 1978 6457 8413 26\nClaim ID: CLM-2026-000314\nPolicy number: POL-77812"}
                          value={blockedExamplesText}
                          onChange={(event) =>
                            updateComposer(() => setBlockedExamplesText(event.target.value))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                          Allow these examples
                        </label>
                        <textarea
                          className="h-36 w-full rounded-2xl border border-slate/10 bg-slate/5 px-4 py-3 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15"
                          placeholder={"Show me the status of my claim\nExplain what home insurance covers\nHow do I update my address?"}
                          value={allowedExamplesText}
                          onChange={(event) =>
                            updateComposer(() => setAllowedExamplesText(event.target.value))
                          }
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                          Tailor it for your business
                        </label>
                        <textarea
                          className="h-24 w-full rounded-2xl border border-slate/10 bg-slate/5 px-4 py-3 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15"
                          placeholder="Example: For XYZ Sigorta, policy IDs start with POL- and claim IDs start with CLM-. We prefer to redact instead of flagging."
                          value={tailoring}
                          onChange={(event) =>
                            updateComposer(() => setTailoring(event.target.value))
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0b1322]"
                    onClick={handleGenerateDraft}
                  >
                    Generate draft
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <p className="text-xs text-slate">
                    The first draft is private. Nothing is created until you confirm it.
                  </p>
                </div>
              </div>
            </section>
          )}

          {creationStage === "review" && draftForReview && (
            <section className="rounded-3xl border border-slate/10 bg-white p-8 shadow-sm">
              <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                <div className="space-y-6">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                      Step 2
                    </p>
                    <h3 className="mt-2 font-display text-3xl font-bold text-ink">
                      Review the draft
                    </h3>
                    <p className="mt-2 text-sm text-slate">
                      Confirm the policy summary, check the example decisions, then
                      create the policy.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate/10 bg-slate/5 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xl font-semibold text-ink">{draftForReview.name}</p>
                        <p className="mt-2 text-sm text-slate">{draftForReview.summary}</p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold text-slate shadow-sm">
                        {draftForReview.sourceLabel}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-semibold text-slate">
                      <span className="rounded-full bg-white px-3 py-1 shadow-sm">
                        {draftForReview.type === "HEURISTIC"
                          ? "Fast pattern check"
                          : "AI-assisted review"}
                      </span>
                      {resolvedDraftPhases.map((phase) => (
                        <span key={phase} className="rounded-full bg-white px-3 py-1 shadow-sm">
                          {PHASE_LABELS[phase]}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate/10 bg-white p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                      Why UMAI drafted it this way
                    </p>
                    <div className="mt-4 space-y-3">
                      {draftForReview.rationale.map((item) => (
                        <div
                          key={item}
                          className="rounded-2xl border border-slate/10 bg-slate/5 px-4 py-3 text-sm text-slate"
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate/10 bg-white p-5">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-ink" />
                      <p className="text-sm font-semibold text-ink">Example decisions</p>
                    </div>
                    <div className="mt-4 space-y-3">
                      {draftForReview.previewExamples.map((example) => (
                        <div
                          key={`${example.decision}-${example.text}`}
                          className="flex items-start justify-between gap-4 rounded-2xl border border-slate/10 bg-slate/5 px-4 py-3"
                        >
                          <p className="text-sm text-ink">{example.text}</p>
                          <span
                            className={`rounded-full px-3 py-1 text-[10px] font-bold ${
                              example.decision === "BLOCK"
                                ? "bg-danger/15 text-danger"
                                : "bg-mint/30 text-ink"
                            }`}
                          >
                            {example.decision}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-5 rounded-2xl border border-slate/10 bg-slate/5 p-5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                      Create settings
                    </p>
                    <p className="mt-2 text-sm text-slate">
                      Edit only the essentials. Everything else stays tucked into
                      advanced settings.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                      Policy name
                    </label>
                    <input
                      className="w-full rounded-2xl border border-slate/10 bg-white px-4 py-3 text-sm text-ink shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15"
                      value={nameOverride}
                      onChange={(event) => {
                        const nextName = event.target.value;
                        setNameOverride(nextName);
                        if (!idManuallyEdited) {
                          setIdOverride(
                            ensureUniquePolicyId(
                              `pol-${slugify(nextName) || "custom-policy"}`,
                              deployedPolicyIds
                            )
                          );
                        }
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                      Where should it run?
                    </label>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {(["PROJECT", "ENVIRONMENT", "ORGANIZATION"] as PolicyScope[]).map(
                        (scope) => (
                          <button
                            key={scope}
                            type="button"
                            className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                              scopeOverride === scope
                                ? "border-ink bg-ink text-white"
                                : "border-slate/10 bg-white text-slate hover:bg-slate/5"
                            }`}
                            onClick={() => setScopeOverride(scope)}
                          >
                            {formatScope(scope)}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                      When should it run?
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {PHASE_OPTIONS.map((phase) => (
                        <button
                          key={phase}
                          type="button"
                          className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                            resolvedDraftPhases.includes(phase)
                              ? "border-ink bg-ink text-white"
                              : "border-slate/10 bg-white text-slate hover:bg-slate/5"
                          }`}
                          onClick={() => handleTogglePhase(phase)}
                        >
                          {PHASE_LABELS[phase]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate/10 bg-white px-4 py-3">
                    <label className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-ink">Create enabled</p>
                        <p className="mt-1 text-xs text-slate">
                          Turn it on immediately after creation.
                        </p>
                      </div>
                      <input
                        checked={enabledOverride}
                        className="h-4 w-4 rounded border-slate/20 text-ink focus:ring-accent"
                        onChange={(event) => setEnabledOverride(event.target.checked)}
                        type="checkbox"
                      />
                    </label>
                  </div>

                  <div className="rounded-2xl border border-slate/10 bg-white">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-4 py-3 text-left"
                      onClick={() => setAdvancedOpen((current) => !current)}
                    >
                      <div>
                        <p className="text-sm font-semibold text-ink">Advanced settings</p>
                        <p className="mt-1 text-xs text-slate">
                          Policy ID and generated config preview.
                        </p>
                      </div>
                      {advancedOpen ? (
                        <ChevronUp className="h-4 w-4 text-slate" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate" />
                      )}
                    </button>

                    {advancedOpen && (
                      <div className="space-y-4 border-t border-slate/10 px-4 py-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                            Policy ID
                          </label>
                          <input
                            className="w-full rounded-2xl border border-slate/10 bg-slate/5 px-4 py-3 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15"
                            value={idOverride}
                            onChange={(event) => {
                              setIdManuallyEdited(true);
                              setIdOverride(event.target.value);
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                            Generated config
                          </p>
                          <pre className="max-h-80 overflow-auto rounded-2xl border border-slate/10 bg-slate/5 p-4 text-xs leading-6 text-slate">
                            {configPreviewText}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 pt-2">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0b1322] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={saving}
                      onClick={handleCreatePolicy}
                    >
                      {saving ? "Creating policy..." : "Create policy"}
                      {!saving && <ArrowRight className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl border border-slate/10 bg-white px-5 py-3 text-sm font-semibold text-slate transition hover:bg-slate/5"
                      onClick={returnToCompose}
                    >
                      Back to draft inputs
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {creationStage === "success" && createdPolicy && (
            <section className="rounded-3xl border border-slate/10 bg-white p-8 shadow-sm">
              <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-mint/30 text-ink">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                  Step 3
                </p>
                <h3 className="mt-2 font-display text-3xl font-bold text-ink">
                  Policy created
                </h3>
                <p className="mt-3 text-sm text-slate">
                  <span className="font-semibold text-ink">{createdPolicy.name}</span> is now
                  available in this project. The next best step is to attach it to a
                  guardrail.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[10px] font-semibold text-slate">
                  <span className="rounded-full bg-slate/10 px-3 py-1">
                    {createdPolicy.type === "HEURISTIC"
                      ? "Fast pattern check"
                      : "AI-assisted review"}
                  </span>
                  <span className="rounded-full bg-slate/10 px-3 py-1">
                    {formatScope(createdPolicy.scope)}
                  </span>
                  {createdPolicy.phases.map((phase) => (
                    <span key={phase} className="rounded-full bg-slate/10 px-3 py-1">
                      {PHASE_LABELS[phase]}
                    </span>
                  ))}
                </div>

                <div className="mt-8 grid w-full gap-3 sm:grid-cols-3">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0b1322]"
                    onClick={() =>
                      router.push(
                        `/environments/${envId}/projects/${projectId}/guardrails`
                      )
                    }
                  >
                    Attach to guardrail
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl border border-slate/10 bg-white px-5 py-3 text-sm font-semibold text-slate transition hover:bg-slate/5"
                    onClick={() => {
                      resetComposer();
                      setActiveTab("create");
                    }}
                  >
                    Create another
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl border border-slate/10 bg-white px-5 py-3 text-sm font-semibold text-slate transition hover:bg-slate/5"
                    onClick={() => setActiveTab("existing")}
                  >
                    View existing
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {activeTab === "templates" && (
        <PolicyTemplateSection
          deployedPolicyIds={deployedPolicyIds}
          deployingTemplate={deployingTemplate}
          libraryError={libraryError}
          libraryLoading={libraryLoading}
          policyLibrary={policyLibrary}
          onDeploy={handleDeployPolicy}
        />
      )}

      {activeTab === "existing" && (
        <ExistingPoliciesSection loading={loading} policies={policies} />
      )}
    </div>
  );
}

function TabButton(props: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  const { active, icon, label, onClick } = props;
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
        active
          ? "bg-ink text-white shadow-sm"
          : "border border-slate/10 bg-white text-slate hover:bg-slate/5"
      }`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function CreateFlowHeader({ stage }: { stage: CreationStage }) {
  const steps: Array<{ id: CreationStage; label: string; detail: string }> = [
    { id: "compose", label: "Describe", detail: "Share the rule in plain language." },
    { id: "review", label: "Review", detail: "Check the draft and examples." },
    { id: "success", label: "Create", detail: "Save the policy and attach it." },
  ];
  const activeIndex = steps.findIndex((step) => step.id === stage);

  return (
    <div className="rounded-3xl border border-slate/10 bg-white p-6 shadow-sm">
      <div className="grid gap-4 md:grid-cols-3">
        {steps.map((step, index) => {
          const isComplete = index < activeIndex;
          const isActive = index === activeIndex;
          return (
            <div
              key={step.id}
              className={`rounded-2xl border px-4 py-4 transition ${
                isActive
                  ? "border-ink bg-ink text-white"
                  : isComplete
                    ? "border-mint/30 bg-mint/15 text-ink"
                    : "border-slate/10 bg-slate/5 text-slate"
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-70">
                Step {index + 1}
              </p>
              <p className="mt-2 text-base font-semibold">{step.label}</p>
              <p className="mt-1 text-sm opacity-80">{step.detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PolicyTemplateSection(props: {
  deployedPolicyIds: Set<string>;
  deployingTemplate: string | null;
  libraryError: string | null;
  libraryLoading: boolean;
  policyLibrary: PolicyLibraryItem[];
  onDeploy: (template: PolicyLibraryItem) => void;
}) {
  const {
    deployedPolicyIds,
    deployingTemplate,
    libraryError,
    libraryLoading,
    policyLibrary,
    onDeploy,
  } = props;

  return (
    <section className="space-y-5">
      <div className="max-w-3xl">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
          Templates
        </p>
        <h3 className="mt-2 font-display text-3xl font-bold text-ink">
          Start from a proven protection
        </h3>
        <p className="mt-2 text-sm text-slate">
          Choose a ready-made policy when the rule already matches a common pattern.
        </p>
      </div>

      {libraryError && (
        <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-xs text-danger">
          {libraryError}
        </div>
      )}

      {libraryLoading ? (
        <div className="rounded-3xl border border-slate/10 bg-white p-8 text-sm text-slate shadow-sm">
          Loading templates...
        </div>
      ) : policyLibrary.length === 0 ? (
        <div className="rounded-3xl border border-slate/10 bg-white p-8 text-sm text-slate shadow-sm">
          No policy templates are available yet.
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {policyLibrary.map((template) => {
            const deployed = deployedPolicyIds.has(template.default_policy_id);
            return (
              <article
                key={template.template_id}
                className="rounded-3xl border border-slate/10 bg-white p-6 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-semibold text-ink">{template.name}</p>
                    <p className="mt-2 text-sm text-slate">
                      {template.description || "Ready-made protection from the UMAI library."}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate/10 px-3 py-1 text-[10px] font-bold text-slate">
                    {template.type === "HEURISTIC"
                      ? "Fast pattern check"
                      : "AI-assisted review"}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-semibold text-slate">
                  {template.phases.map((phase) => (
                    <span key={phase} className="rounded-full bg-slate/10 px-3 py-1">
                      {PHASE_LABELS[phase]}
                    </span>
                  ))}
                  {template.managed && (
                    <span className="rounded-full bg-slate/10 px-3 py-1">Managed</span>
                  )}
                  {(template.tags || []).map((tag) => (
                    <span key={tag} className="rounded-full bg-slate/10 px-3 py-1">
                      {tag}
                    </span>
                  ))}
                </div>

                <button
                  type="button"
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0b1322] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={deployed || deployingTemplate === template.template_id}
                  onClick={() => onDeploy(template)}
                >
                  {deployed
                    ? "Already deployed"
                    : deployingTemplate === template.template_id
                      ? "Deploying..."
                      : "Deploy template"}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ExistingPoliciesSection(props: { loading: boolean; policies: Policy[] }) {
  const { loading, policies } = props;

  return (
    <section className="space-y-5">
      <div className="max-w-3xl">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
          Existing
        </p>
        <h3 className="mt-2 font-display text-3xl font-bold text-ink">
          Policies already active in this project
        </h3>
        <p className="mt-2 text-sm text-slate">
          Review what is live before creating or deploying another policy.
        </p>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-slate/10 bg-white p-8 text-sm text-slate shadow-sm">
          Loading policies...
        </div>
      ) : policies.length === 0 ? (
        <div className="rounded-3xl border border-slate/10 bg-white p-8 shadow-sm">
          <p className="text-lg font-semibold text-ink">No policies yet</p>
          <p className="mt-2 text-sm text-slate">
            Create a policy from the Create tab or deploy one from Templates.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {policies.map((policy) => (
            <article
              key={policy.policy_id}
              className="rounded-3xl border border-slate/10 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold text-ink">{policy.name}</p>
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-bold ${
                        policy.enabled
                          ? "bg-mint/30 text-ink"
                          : "bg-slate/10 text-slate"
                      }`}
                    >
                      {policy.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate">{summarizePolicy(policy)}</p>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate/50">
                    {policy.policy_id}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 text-[10px] font-semibold text-slate">
                  <span className="rounded-full bg-slate/10 px-3 py-1">
                    {policy.type === "HEURISTIC"
                      ? "Fast pattern check"
                      : "AI-assisted review"}
                  </span>
                  <span className="rounded-full bg-slate/10 px-3 py-1">
                    {formatScope(policy.scope)}
                  </span>
                  {policy.phases.map((phase) => (
                    <span key={phase} className="rounded-full bg-slate/10 px-3 py-1">
                      {PHASE_LABELS[phase]}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ensureUniquePolicyId(baseId: string, existingIds: Set<string>): string {
  const normalizedBase = baseId.trim() || "pol-custom-policy";
  if (!existingIds.has(normalizedBase)) {
    return normalizedBase;
  }
  let suffix = 2;
  let candidate = `${normalizedBase}-${suffix}`;
  while (existingIds.has(candidate)) {
    suffix += 1;
    candidate = `${normalizedBase}-${suffix}`;
  }
  return candidate;
}
