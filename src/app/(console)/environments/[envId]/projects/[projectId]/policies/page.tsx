"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  LibraryBig,
  Pencil,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";

import {
  createPolicy,
  deployPolicyTemplate,
  draftPolicy,
  fetchPolicies,
  fetchPolicyLibrary,
  updatePolicy,
  type Policy,
  type PolicyDraftResponse,
  type PolicyLibraryItem,
  type PolicyPhase,
  type PolicyScope,
} from "src/lib/api";
import { useConsole } from "src/app/(console)/console-context";
import {
  PHASE_LABELS,
  PHASE_OPTIONS,
  STARTERS,
  formatScope,
  parseExamples,
  summarizePolicy,
  type PolicyDraft,
} from "./policy-drafts";
import {
  PolicyForm,
  RuleTable,
  contextSummary,
  defaultConfigFor,
  targetLabel,
  type PolicyFormValues,
} from "./policy-form";
import { PolicyLibrary } from "./policy-library";
import {
  BTN_OUTLINE,
  BTN_PRIMARY,
  BTN_SECONDARY,
  ConfirmDialog,
  CopyButton,
  INPUT,
  SELECT,
  InlineNotice,
  KeyValue,
  PhaseTags,
  SectionCard,
  StatusTag,
  TAG,
  TAG_GREEN,
  TAG_RED,
  TypeTag,
  typeLabel,
  type NoticeTone,
} from "./policy-ui";

type Screen = "list" | "detail" | "edit" | "create" | "library";
type TypeFilter = "ALL" | Policy["type"];
type StatusFilter = "ALL" | "ENABLED" | "DISABLED";

interface Notice {
  tone: NoticeTone;
  text: string;
  link?: { label: string; href: string };
}

const blankForm = (type: Policy["type"]): PolicyFormValues => ({
  name: "",
  policyId: "",
  type,
  scope: "PROJECT",
  enabled: true,
  phases: ["PRE_LLM"],
  config: defaultConfigFor(type),
});

function mapServerDraft(r: PolicyDraftResponse): PolicyDraft {
  return {
    name: r.name,
    policyId: r.policy_id,
    type: r.type,
    phases: r.phases,
    scope: "PROJECT",
    enabled: true,
    summary: r.summary,
    sourceLabel: r.source_label,
    rationale: r.rationale,
    config: r.config as Record<string, unknown>,
    previewExamples: r.preview_examples.map((p) => ({ text: p.text, decision: p.decision })),
  };
}

function ensureUniquePolicyId(baseId: string, existingIds: Set<string>): string {
  const normalizedBase = baseId.trim() || "pol-custom-policy";
  if (!existingIds.has(normalizedBase)) return normalizedBase;
  let suffix = 2;
  let candidate = `${normalizedBase}-${suffix}`;
  while (existingIds.has(candidate)) {
    suffix += 1;
    candidate = `${normalizedBase}-${suffix}`;
  }
  return candidate;
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={checked ? "Enabled — click to disable" : "Disabled — click to enable"}
      onClick={(event) => {
        event.stopPropagation();
        onChange();
      }}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition ${
        checked ? "border-secondary bg-secondary" : "border-gray-300 bg-gray-200"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white transition ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export default function PoliciesPage() {
  const { envId, projectId } = useParams() as { envId: string; projectId: string };
  const { tenantId } = useConsole();

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [library, setLibrary] = useState<PolicyLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [screen, setScreen] = useState<Screen>("list");
  // Ekran değişince kaydırma konumu listeden kalmasın.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    rootRef.current?.scrollIntoView({ block: "start" });
  }, [screen]);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"overview" | "json">("overview");

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [phaseFilter, setPhaseFilter] = useState<PolicyPhase | "ALL">("ALL");
  const [scopeFilter, setScopeFilter] = useState<PolicyScope | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const [pendingToggle, setPendingToggle] = useState<Policy | null>(null);
  const [toggling, setToggling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deployingTemplate, setDeployingTemplate] = useState<string | null>(null);

  // AI draft panel (create screen)
  const [intent, setIntent] = useState("");
  const [starterId, setStarterId] = useState<string | null>(null);
  const [tailoring, setTailoring] = useState("");
  const [blockedExamplesText, setBlockedExamplesText] = useState("");
  const [allowedExamplesText, setAllowedExamplesText] = useState("");
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<PolicyDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [formInitial, setFormInitial] = useState<PolicyFormValues>(() => blankForm("HEURISTIC"));
  const [formKey, setFormKey] = useState(0);

  const load = useCallback(() => {
    if (!envId || !projectId || !tenantId) return;
    setLoading(true);
    setLibraryLoading(true);
    Promise.allSettled([fetchPolicies(tenantId, envId, projectId), fetchPolicyLibrary()])
      .then(([policyResult, libraryResult]) => {
        if (policyResult.status === "fulfilled") {
          setPolicies(policyResult.value);
          setError(null);
        } else {
          console.error(policyResult.reason);
          setError("Unable to load policies for this project.");
        }
        if (libraryResult.status === "fulfilled") {
          setLibrary(libraryResult.value);
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

  useEffect(() => {
    load();
  }, [load]);

  const existingIds = useMemo(() => new Set(policies.map((policy) => policy.policy_id)), [policies]);
  const selected = useMemo(
    () => policies.find((policy) => policy.policy_id === selectedPolicyId) ?? null,
    [policies, selectedPolicyId]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return policies
      .filter((policy) => {
        if (typeFilter !== "ALL" && policy.type !== typeFilter) return false;
        if (phaseFilter !== "ALL" && !policy.phases.includes(phaseFilter)) return false;
        if (scopeFilter !== "ALL" && (policy.scope ?? "PROJECT") !== scopeFilter) return false;
        if (statusFilter === "ENABLED" && !policy.enabled) return false;
        if (statusFilter === "DISABLED" && policy.enabled) return false;
        if (!query) return true;
        return `${policy.name} ${policy.policy_id}`.toLowerCase().includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [phaseFilter, policies, scopeFilter, search, statusFilter, typeFilter]);

  const guardrailsHref = `/environments/${envId}/projects/${projectId}/guardrails`;

  // ---------------------------------------------------------------- navigation
  const goList = () => {
    setScreen("list");
    setSaveError(null);
  };
  const openDetail = (policyId: string) => {
    setSelectedPolicyId(policyId);
    setDetailTab("overview");
    setScreen("detail");
    setSaveError(null);
  };
  const openEdit = (policyId: string) => {
    setSelectedPolicyId(policyId);
    setSaveError(null);
    setScreen("edit");
  };
  const openCreate = () => {
    setIntent("");
    setStarterId(null);
    setTailoring("");
    setBlockedExamplesText("");
    setAllowedExamplesText("");
    setExamplesOpen(false);
    setDraft(null);
    setDraftError(null);
    setSaveError(null);
    setFormInitial(blankForm("HEURISTIC"));
    setFormKey((key) => key + 1);
    setNotice(null);
    setScreen("create");
  };
  const openLibrary = () => {
    setNotice(null);
    setScreen("library");
  };

  // ---------------------------------------------------------------- AI draft
  const handleGenerateDraft = async () => {
    setDraftError(null);
    const blocked = parseExamples(blockedExamplesText);
    const allowed = parseExamples(allowedExamplesText);
    if (!intent.trim() && blocked.length === 0 && allowed.length === 0) {
      setDraftError("Describe the rule or paste examples first.");
      return;
    }
    if (!tenantId) {
      setDraftError("Tenant is not available.");
      return;
    }
    setGenerating(true);
    try {
      const server = await draftPolicy({
        tenant_id: tenantId,
        environment_id: envId,
        project_id: projectId,
        intent: intent.trim(),
        tailoring: tailoring.trim(),
        blocked_examples: blocked,
        allowed_examples: allowed,
      });
      const mapped = mapServerDraft(server);
      setDraft(mapped);
      setFormInitial({
        name: mapped.name,
        policyId: ensureUniquePolicyId(mapped.policyId, existingIds),
        type: mapped.type,
        scope: mapped.scope,
        enabled: mapped.enabled,
        phases: mapped.phases,
        config: mapped.config,
      });
      setFormKey((key) => key + 1);
    } catch (err) {
      console.error(err);
      setDraftError(err instanceof Error ? err.message : "Draft generation failed. Try again.");
    } finally {
      setGenerating(false);
    }
  };

  // ---------------------------------------------------------------- persistence
  const handleCreate = async (values: PolicyFormValues) => {
    if (!tenantId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const created = await createPolicy({
        tenant_id: tenantId,
        environment_id: envId,
        project_id: projectId,
        policy_id: values.policyId,
        name: values.name,
        type: values.type,
        enabled: values.enabled,
        phases: values.phases,
        config: values.config,
        scope: values.scope,
      });
      setPolicies((current) => [created, ...current.filter((p) => p.policy_id !== created.policy_id)]);
      setNotice({
        tone: "success",
        text: `${created.name} was created. It takes effect once attached to a guardrail version.`,
        link: { label: "Go to guardrails", href: guardrailsHref },
      });
      openDetail(created.policy_id);
    } catch (err) {
      console.error(err);
      setSaveError(err instanceof Error ? err.message : "Policy creation failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (values: PolicyFormValues) => {
    if (!tenantId || !selected) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updatePolicy(tenantId, envId, projectId, selected.policy_id, {
        name: values.name,
        enabled: values.enabled,
        phases: values.phases,
        config: values.config,
      });
      setPolicies((current) => current.map((p) => (p.policy_id === updated.policy_id ? updated : p)));
      setNotice({
        tone: "success",
        text: `${updated.name} was saved. Guardrails pick up the change in their next published version.`,
        link: { label: "Go to guardrails", href: guardrailsHref },
      });
      openDetail(updated.policy_id);
    } catch (err) {
      console.error(err);
      setSaveError(err instanceof Error ? err.message : "Saving the policy failed.");
    } finally {
      setSaving(false);
    }
  };

  const confirmToggle = async () => {
    if (!tenantId || !pendingToggle) return;
    setToggling(true);
    try {
      const updated = await updatePolicy(tenantId, envId, projectId, pendingToggle.policy_id, {
        enabled: !pendingToggle.enabled,
      });
      setPolicies((current) => current.map((p) => (p.policy_id === updated.policy_id ? updated : p)));
      setNotice({
        tone: "info",
        text: `${updated.name} is now ${updated.enabled ? "enabled" : "disabled"}. Guardrails apply the change in their next published version.`,
      });
      setPendingToggle(null);
    } catch (err) {
      console.error(err);
      setNotice({ tone: "error", text: "Updating the policy status failed." });
      setPendingToggle(null);
    } finally {
      setToggling(false);
    }
  };

  const handleDeploy = async (template: PolicyLibraryItem) => {
    if (!tenantId || existingIds.has(template.default_policy_id)) return;
    setDeployingTemplate(template.template_id);
    setLibraryError(null);
    try {
      const deployed = await deployPolicyTemplate({
        tenant_id: tenantId,
        environment_id: envId,
        project_id: projectId,
        template_id: template.template_id,
      });
      setPolicies((current) => [deployed, ...current]);
      setNotice({
        tone: "success",
        text: `${template.name} was deployed to this project.`,
        link: { label: "Go to guardrails", href: guardrailsHref },
      });
    } catch (err) {
      console.error(err);
      setLibraryError("Deploying the template failed. Try again.");
    } finally {
      setDeployingTemplate(null);
    }
  };

  // ---------------------------------------------------------------- header
  const backLink = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-secondary hover:underline"
    >
      <ArrowLeft className="h-4 w-4" /> {label}
    </button>
  );

  const header = (() => {
    if (screen === "library") {
      return (
        <div>
          {backLink("Policies", goList)}
          <h1 className="text-2xl font-semibold text-gray-900">Policy Library</h1>
          <p className="mt-1 text-sm text-gray-500">
            UMAI-maintained templates you can deploy into <span className="font-mono text-xs">{projectId}</span>.
          </p>
        </div>
      );
    }
    if (screen === "create") {
      return (
        <div>
          {backLink("Policies", goList)}
          <h1 className="text-2xl font-semibold text-gray-900">Create policy</h1>
          <p className="mt-1 text-sm text-gray-500">
            Describe the rule and let UMAI draft it, or fill in the form directly.
          </p>
        </div>
      );
    }
    if ((screen === "detail" || screen === "edit") && selected) {
      return (
        <div>
          {screen === "edit"
            ? backLink(selected.name, () => openDetail(selected.policy_id))
            : backLink("Policies", goList)}
          <h1 className="text-2xl font-semibold text-gray-900">
            {screen === "edit" ? `Edit · ${selected.name}` : selected.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <span className="inline-flex items-center gap-1 font-mono text-xs">
              {selected.policy_id}
              <CopyButton value={selected.policy_id} label="Copy policy ID" />
            </span>
            <TypeTag type={selected.type} />
            <span className={TAG}>{formatScope(selected.scope)}</span>
            <StatusTag enabled={selected.enabled} />
          </div>
        </div>
      );
    }
    return (
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Policies</h1>
        <p className="mt-1 text-sm text-gray-500">
          {loading ? "Loading…" : `${policies.length} ${policies.length === 1 ? "policy" : "policies"}`}
          {" · "}
          {projectId}
        </p>
      </div>
    );
  })();

  const headerActions = (() => {
    if (screen === "list") {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={BTN_OUTLINE} onClick={openLibrary}>
            <LibraryBig className="h-4 w-4" /> Policy Library
          </button>
          <button type="button" className={BTN_PRIMARY} onClick={openCreate}>
            <Plus className="h-4 w-4" /> Create policy
          </button>
        </div>
      );
    }
    if (screen === "detail" && selected) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={BTN_SECONDARY} onClick={() => setPendingToggle(selected)}>
            {selected.enabled ? "Disable" : "Enable"}
          </button>
          <button type="button" className={BTN_PRIMARY} onClick={() => openEdit(selected.policy_id)}>
            <Pencil className="h-4 w-4" /> Edit policy
          </button>
        </div>
      );
    }
    return null;
  })();

  return (
    <div ref={rootRef} className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-gray-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        {header}
        {headerActions}
      </header>

      {error && <InlineNotice tone="error">{error}</InlineNotice>}
      {notice && (
        <InlineNotice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
          {notice.link && (
            <>
              {" "}
              <Link href={notice.link.href} className="font-medium text-secondary hover:underline">
                {notice.link.label} →
              </Link>
            </>
          )}
        </InlineNotice>
      )}

      {/* ------------------------------------------------------------ list */}
      {screen === "list" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                className={`${INPUT} pl-8`}
                placeholder="Search by name or ID"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search policies"
              />
            </div>
            <select
              className={SELECT}
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
              aria-label="Filter by type"
            >
              <option value="ALL">All types</option>
              <option value="HEURISTIC">{typeLabel("HEURISTIC")}</option>
              <option value="CONTEXT_AWARE">{typeLabel("CONTEXT_AWARE")}</option>
            </select>
            <select
              className={SELECT}
              value={phaseFilter}
              onChange={(event) => setPhaseFilter(event.target.value as PolicyPhase | "ALL")}
              aria-label="Filter by phase"
            >
              <option value="ALL">All phases</option>
              {PHASE_OPTIONS.map((phase) => (
                <option key={phase} value={phase}>
                  {PHASE_LABELS[phase]}
                </option>
              ))}
            </select>
            <select
              className={SELECT}
              value={scopeFilter}
              onChange={(event) => setScopeFilter(event.target.value as PolicyScope | "ALL")}
              aria-label="Filter by scope"
            >
              <option value="ALL">All scopes</option>
              {(["PROJECT", "ENVIRONMENT", "ORGANIZATION"] as PolicyScope[]).map((scope) => (
                <option key={scope} value={scope}>
                  {formatScope(scope)}
                </option>
              ))}
            </select>
            <select
              className={SELECT}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              aria-label="Filter by status"
            >
              <option value="ALL">All statuses</option>
              <option value="ENABLED">Enabled</option>
              <option value="DISABLED">Disabled</option>
            </select>
          </div>

          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Phases</th>
                  <th className="px-4 py-2.5 font-medium">Scope</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="w-20 px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      Loading policies…
                    </td>
                  </tr>
                ) : policies.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                      No policies in this project yet. Create one or deploy a template from the library.
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                      No policies match these filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((policy) => (
                    <tr
                      key={policy.policy_id}
                      onClick={() => openDetail(policy.policy_id)}
                      className="cursor-pointer transition-colors hover:bg-gray-50"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{policy.name}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-gray-500">
                          {policy.policy_id}
                          <CopyButton value={policy.policy_id} label="Copy policy ID" />
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <TypeTag type={policy.type} />
                      </td>
                      <td className="px-4 py-3">
                        <PhaseTags phases={policy.phases} max={3} />
                      </td>
                      <td className="px-4 py-3 text-gray-700">{formatScope(policy.scope)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Toggle
                            checked={policy.enabled}
                            label={`${policy.enabled ? "Disable" : "Enable"} ${policy.name}`}
                            onChange={() => setPendingToggle(policy)}
                          />
                          <span className="text-xs text-gray-600">
                            {policy.enabled ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="font-medium text-secondary hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            openEdit(policy.policy_id);
                          }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {!loading && policies.length > 0 && (
            <p className="text-xs text-gray-500">
              {filtered.length} of {policies.length} policies
            </p>
          )}
        </>
      )}

      {/* ------------------------------------------------------------ detail */}
      {screen === "detail" && selected && (
        <div className="space-y-4">
          <div className="flex gap-6 border-b border-gray-200" role="tablist">
            {(["overview", "json"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={detailTab === tab}
                onClick={() => setDetailTab(tab)}
                className={`-mb-px border-b-2 pb-2.5 text-sm font-medium transition ${
                  detailTab === tab
                    ? "border-secondary text-gray-900"
                    : "border-transparent text-gray-500 hover:text-gray-900"
                }`}
              >
                {tab === "overview" ? "Overview" : "JSON"}
              </button>
            ))}
          </div>

          {detailTab === "overview" ? (
            <div className="space-y-4">
              <SectionCard title="Summary">
                <p className="text-sm text-gray-700">{summarizePolicy(selected)}</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KeyValue label="Type">{typeLabel(selected.type)}</KeyValue>
                  <KeyValue label="Phases">
                    <PhaseTags phases={selected.phases} />
                  </KeyValue>
                  <KeyValue label="Evaluates">{targetLabel(selected.config.target)}</KeyValue>
                  <KeyValue label="Created">
                    {selected.created_at
                      ? new Date(selected.created_at).toLocaleString("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "—"}
                  </KeyValue>
                </div>
              </SectionCard>

              {selected.type === "HEURISTIC" ? (
                <SectionCard
                  title="Rules"
                  description={
                    typeof selected.config.max_length === "number"
                      ? `Evaluated in order · scans up to ${selected.config.max_length.toLocaleString("en-US")} characters`
                      : "Evaluated in order"
                  }
                >
                  <RuleTable config={selected.config} />
                </SectionCard>
              ) : (
                (() => {
                  const ctx = contextSummary(selected.config);
                  return (
                    <>
                      <SectionCard title="Decision settings">
                        <div className="grid gap-4 sm:grid-cols-3">
                          <KeyValue label="Blocks when confidence is at least">
                            {ctx.minConfidence.charAt(0).toUpperCase() + ctx.minConfidence.slice(1)}
                          </KeyValue>
                          <KeyValue label="On classifier error">
                            {ctx.failClosed ? "Fail closed (block)" : "Fail open (allow)"}
                          </KeyValue>
                          <KeyValue label="Step-up categories">
                            {ctx.stepUpCategories ? (
                              <span className="flex flex-wrap gap-1">
                                {ctx.stepUpCategories.split(",").map((item) => (
                                  <span key={item.trim()} className={`${TAG} break-all font-mono`}>
                                    {item.trim()}
                                  </span>
                                ))}
                              </span>
                            ) : (
                              "—"
                            )}
                          </KeyValue>
                        </div>
                      </SectionCard>
                      <SectionCard title="Instructions">
                        <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-gray-700">
                          {ctx.instructions || "—"}
                        </pre>
                      </SectionCard>
                      <SectionCard title="Definitions and category map">
                        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded bg-gray-50 px-4 py-3 font-mono text-xs leading-5 text-gray-700">
                          {ctx.definitions || "—"}
                        </pre>
                      </SectionCard>
                      <SectionCard title="Examples">
                        <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded bg-gray-50 px-4 py-3 font-mono text-xs leading-5 text-gray-700">
                          {ctx.examples || "—"}
                        </pre>
                      </SectionCard>
                    </>
                  );
                })()
              )}
            </div>
          ) : (
            <SectionCard
              title="Policy JSON"
              description="Exactly what a guardrail version snapshots when it is published."
              actions={<CopyButton value={JSON.stringify(selected.config, null, 2)} label="Copy JSON" />}
            >
              <pre className="max-h-[640px] overflow-auto rounded bg-gray-50 px-4 py-3 font-mono text-xs leading-5 text-gray-700">
                {JSON.stringify(selected.config, null, 2)}
              </pre>
            </SectionCard>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------ edit */}
      {screen === "edit" && selected && (
        <div className="space-y-4">
          <InlineNotice tone="info">
            Changes are saved to the policy definition. Guardrails that use it apply the change in
            their next published version; live versions keep the snapshot they were published with.
          </InlineNotice>
          {saveError && <InlineNotice tone="error">{saveError}</InlineNotice>}
          <PolicyForm
            key={`edit-${selected.policy_id}`}
            mode="edit"
            initial={{
              name: selected.name,
              policyId: selected.policy_id,
              type: selected.type,
              scope: selected.scope ?? "PROJECT",
              enabled: selected.enabled,
              phases: selected.phases,
              config: selected.config,
            }}
            existingIds={existingIds}
            submitting={saving}
            submitLabel="Save changes"
            onSubmit={handleEdit}
            onCancel={() => openDetail(selected.policy_id)}
          />
        </div>
      )}

      {/* ------------------------------------------------------------ create */}
      {screen === "create" && (
        <div className="space-y-6">
          <section className="rounded border border-secondary/30 bg-secondary/5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-secondary/20 px-5 py-4">
              <div>
                <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <Sparkles className="h-4 w-4 text-secondary" /> Draft with AI
                </h2>
                <p className="mt-0.5 text-xs text-gray-600">
                  Describe what the policy should protect against. UMAI drafts the instructions,
                  categories and examples; you review and adjust them in the form below.
                </p>
              </div>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="block text-xs font-medium text-gray-500" htmlFor="draft-intent">
                  What should this policy protect against?
                </label>
                <textarea
                  id="draft-intent"
                  className={`${INPUT} mt-1 h-24 leading-6`}
                  placeholder="Example: Block customer account numbers, IBANs and card numbers in both customer messages and AI responses."
                  value={intent}
                  onChange={(event) => setIntent(event.target.value)}
                />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">Starting points</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {STARTERS.map((starter) => {
                    const active = starter.id === starterId;
                    return (
                      <button
                        key={starter.id}
                        type="button"
                        aria-pressed={active}
                        title={starter.description}
                        className={`rounded border px-2.5 py-1 text-xs font-medium transition ${
                          active
                            ? "border-secondary bg-secondary text-white"
                            : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                        }`}
                        onClick={() => {
                          setStarterId(active ? null : starter.id);
                          if (!active && !intent.trim()) setIntent(starter.defaultIntent);
                        }}
                      >
                        {starter.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                className="inline-flex items-center gap-1 text-sm font-medium text-secondary hover:underline"
                onClick={() => setExamplesOpen((open) => !open)}
                aria-expanded={examplesOpen}
              >
                {examplesOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Examples and tailoring
              </button>
              {examplesOpen && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-500" htmlFor="draft-blocked">
                      Should be blocked
                    </label>
                    <textarea
                      id="draft-blocked"
                      className={`${INPUT} mt-1 h-28 font-mono text-xs leading-5`}
                      placeholder={"TR33 0006 1005 1978 6457 8413 26\nAccount no: 1234567890"}
                      value={blockedExamplesText}
                      onChange={(event) => setBlockedExamplesText(event.target.value)}
                    />
                    <p className="mt-1 text-xs text-gray-500">One example per line.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500" htmlFor="draft-allowed">
                      Should be allowed
                    </label>
                    <textarea
                      id="draft-allowed"
                      className={`${INPUT} mt-1 h-28 font-mono text-xs leading-5`}
                      placeholder={"What is my account balance?\nHow do I update my address?"}
                      value={allowedExamplesText}
                      onChange={(event) => setAllowedExamplesText(event.target.value)}
                    />
                    <p className="mt-1 text-xs text-gray-500">One example per line.</p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-500" htmlFor="draft-tailoring">
                      Tailor it for your business
                    </label>
                    <textarea
                      id="draft-tailoring"
                      className={`${INPUT} mt-1 h-20 leading-6`}
                      placeholder="Example: Account numbers are 10 digits and start with 1 or 2. Prefer redaction over blocking for outgoing responses."
                      value={tailoring}
                      onChange={(event) => setTailoring(event.target.value)}
                    />
                  </div>
                </div>
              )}

              {draftError && <InlineNotice tone="error">{draftError}</InlineNotice>}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  disabled={generating}
                  onClick={handleGenerateDraft}
                >
                  <Sparkles className="h-4 w-4" />
                  {generating ? "Drafting…" : draft ? "Regenerate draft" : "Generate draft"}
                </button>
                <p className="text-xs text-gray-500">
                  Nothing is created until you save the form below.
                </p>
              </div>

              {draft && (
                <div className="rounded border border-gray-200 bg-white">
                  <div className="border-b border-gray-200 px-4 py-3">
                    <p className="text-sm font-semibold text-gray-900">{draft.name}</p>
                    <p className="mt-0.5 text-sm text-gray-600">{draft.summary}</p>
                  </div>
                  <div className="grid gap-4 px-4 py-3 lg:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium text-gray-500">Why it was drafted this way</p>
                      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-gray-700">
                        {draft.rationale.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500">Example decisions</p>
                      <ul className="mt-1.5 space-y-1.5">
                        {draft.previewExamples.map((example) => (
                          <li
                            key={`${example.decision}-${example.text}`}
                            className="flex items-start justify-between gap-3 text-sm text-gray-700"
                          >
                            <span>{example.text}</span>
                            <span className={example.decision === "BLOCK" ? TAG_RED : TAG_GREEN}>
                              {example.decision}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <p className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
                    The form below has been filled from this draft. Adjust anything before saving.
                  </p>
                </div>
              )}
            </div>
          </section>

          {saveError && <InlineNotice tone="error">{saveError}</InlineNotice>}
          <PolicyForm
            key={`create-${formKey}`}
            mode="create"
            initial={formInitial}
            existingIds={existingIds}
            submitting={saving}
            submitLabel="Create policy"
            onSubmit={handleCreate}
            onCancel={goList}
          />
        </div>
      )}

      {/* ------------------------------------------------------------ library */}
      {screen === "library" && (
        <PolicyLibrary
          items={library}
          loading={libraryLoading}
          error={libraryError}
          deployedIds={existingIds}
          deployingId={deployingTemplate}
          onDeploy={handleDeploy}
        />
      )}

      {pendingToggle && (
        <ConfirmDialog
          title={pendingToggle.enabled ? "Disable policy?" : "Enable policy?"}
          confirmLabel={pendingToggle.enabled ? "Disable" : "Enable"}
          danger={pendingToggle.enabled}
          busy={toggling}
          onCancel={() => (toggling ? undefined : setPendingToggle(null))}
          onConfirm={confirmToggle}
          body={
            <>
              <p>
                <span className="font-medium text-gray-900">{pendingToggle.name}</span>{" "}
                {pendingToggle.enabled
                  ? "will be skipped at runtime by guardrails that include it."
                  : "will run again inside guardrails that include it."}
              </p>
              <p className="mt-2">
                The change applies when those guardrails publish their next version.
              </p>
            </>
          }
        />
      )}
    </div>
  );
}
