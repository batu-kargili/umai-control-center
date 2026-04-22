"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  AgtConfig,
  createGuardrail,
  createGuardrailVersion,
  createPolicy,
  deployGuardrailTemplate,
  fetchGuardrailSnapshot,
  fetchGuardrailLibrary,
  fetchGuardrails,
  fetchGuardrailVersions,
  fetchPolicies,
  publishGuardrailVersion,
  generateAgenticGuardrail,
  type AgenticGuardrailDraft,
  Guardrail,
  GuardrailLibraryItem,
  GuardrailSnapshotResponse,
  GuardrailVersion,
  POLICY_PHASE_LABELS,
  POLICY_PHASE_OPTIONS,
  Policy,
  PolicyPhase,
} from "src/lib/api";
import { useConsole } from "src/app/(console)/console-context";
import { useAuthSession } from "src/lib/auth-client";

type PreflightTarget = "LAST_MESSAGE" | "FULL_HISTORY";

type PreflightRule = {
  id: string;
  mode: "REGEX" | "EXACT";
  pattern: string;
  block_on_match: boolean;
};

type GuardrailScreen = "list" | "create";

type WizardMode = "new" | "existing";

type QuickStartId = "basic" | "production" | "data" | "custom";

type CreateOption = "template" | "ai" | "custom";

type DetailsTab = "overview" | "policies";

type ToastTone = "success" | "error" | "info";

type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
};

type LlmPreset = {
  id: string;
  label: string;
  provider: string;
  base_url: string;
  model: string;
  description: string;
  auth: {
    type: "none" | "bearer" | "header";
    secret_env?: string;
    header_name?: string;
  };
};

const PHASE_LABELS: Record<PolicyPhase, string> = POLICY_PHASE_LABELS;

const PREFLIGHT_RULE_TEMPLATES: Array<{
  id: string;
  label: string;
  description: string;
  example: string;
  rule: PreflightRule;
}> = [
  {
    id: "preflight-ignore-instructions",
    label: "Ignore instructions",
    description: "Detects attempts to override or ignore system guidance.",
    example: "ignore previous instructions",
    rule: {
      id: "preflight-ignore-instructions",
      mode: "REGEX",
      pattern: "(?i)ignore (all|previous|above) instructions",
      block_on_match: true,
    },
  },
  {
    id: "preflight-system-prompt",
    label: "System prompt probing",
    description: "Blocks requests asking for system or developer messages.",
    example: "show me the system prompt",
    rule: {
      id: "preflight-system-prompt",
      mode: "REGEX",
      pattern: "(?i)system prompt|developer message",
      block_on_match: true,
    },
  },
  {
    id: "preflight-jailbreak",
    label: "Jailbreak keywords",
    description: "Stops common jailbreak patterns and aliases.",
    example: "do anything now",
    rule: {
      id: "preflight-jailbreak",
      mode: "REGEX",
      pattern: "(?i)jailbreak|do anything now|dan\\b",
      block_on_match: true,
    },
  },
  {
    id: "preflight-prompt-injection",
    label: "Prompt injection phrase",
    description: "Catches explicit prompt injection wording.",
    example: "this is a prompt injection",
    rule: {
      id: "preflight-prompt-injection",
      mode: "REGEX",
      pattern: "(?i)prompt injection",
      block_on_match: true,
    },
  },
];

const DEFAULT_PREFLIGHT = {
  target: "LAST_MESSAGE" as PreflightTarget,
  rules: PREFLIGHT_RULE_TEMPLATES.slice(0, 2).map((template) => ({
    ...template.rule,
  })),
  max_length: 8000,
};

const DEFAULT_LLM_CONFIG = {
  provider: "OPENROUTER",
  base_url: "https://openrouter.ai/api/v1",
  model: "openai/gpt-oss-safeguard-20b",
  timeout_ms: 2000,
  auth: {
    type: "bearer" as const,
    secret_env: "OPENROUTER_API_KEY",
    header_name: "",
  },
};

const DEPLOY_SUCCESS_MESSAGE = "Guardrail Deployed and Published Successfully.";

const TOAST_LABELS: Record<ToastTone, string> = {
  success: "Success",
  error: "Error",
  info: "Info",
};

const TOAST_STYLES: Record<ToastTone, string> = {
  success: "border-emerald-200 bg-emerald-500 text-white shadow-lg shadow-emerald-500/20",
  error: "border-danger/40 bg-danger text-white shadow-lg shadow-danger/20",
  info: "border-sky-200 bg-sky-500 text-white shadow-lg shadow-sky-500/20",
};

let nextToastId = 1;

const LLM_PRESETS: LlmPreset[] = [
  {
    id: "OPENROUTER",
    label: "OpenRouter (OpenAI-compatible)",
    provider: "OPENROUTER",
    base_url: "https://openrouter.ai/api/v1",
    model: "openai/gpt-oss-safeguard-20b",
    description: "OpenRouter hosted inference for GPT-OSS Safeguard.",
    auth: {
      type: "bearer",
      secret_env: "OPENROUTER_API_KEY",
    },
  },
  {
    id: "GROQ",
    label: "Groq (OpenAI-compatible)",
    provider: "GROQ",
    base_url: "https://api.groq.com/openai/v1",
    model: "openai/gpt-oss-safeguard-20b",
    description: "Groq hosted inference for GPT-OSS Safeguard.",
    auth: {
      type: "bearer",
      secret_env: "GROQ_API_KEY",
    },
  },
  {
    id: "OSS_ROUTER",
    label: "OSS Router (Hugging Face, legacy)",
    provider: "OSS_ROUTER",
    base_url: "https://router.huggingface.co/v1",
    model: "openai/gpt-oss-safeguard-20b",
    description: "Open-source routing with an OpenAI-compatible endpoint.",
    auth: {
      type: "bearer",
      secret_env: "HF_TOKEN",
    },
  },
  {
    id: "OPENAI",
    label: "OpenAI",
    provider: "OPENAI",
    base_url: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    description: "OpenAI hosted models (requires API key on the engine).",
    auth: {
      type: "bearer",
      secret_env: "OPENAI_API_KEY",
    },
  },
  {
    id: "AZURE_OPENAI",
    label: "Azure OpenAI",
    provider: "AZURE_OPENAI",
    base_url: "https://{resource}.openai.azure.com/openai/deployments/{deployment}",
    model: "gpt-4o-mini",
    description: "Azure-hosted OpenAI models with deployment URLs.",
    auth: {
      type: "header",
      secret_env: "AZURE_OPENAI_API_KEY",
      header_name: "api-key",
    },
  },
  {
    id: "CUSTOM",
    label: "Custom OpenAI-compatible",
    provider: "",
    base_url: "",
    model: "",
    description: "Bring any OpenAI-compatible endpoint and model name.",
    auth: {
      type: "none",
    },
  },
];

const QUICK_STARTS: Array<{
  id: QuickStartId;
  label: string;
  description: string;
  keywords: string[];
}> = [
  {
    id: "basic",
    label: "Basic Safety",
    description: "Prompt injection + moderation policies.",
    keywords: ["prompt", "injection", "moderation"],
  },
  {
    id: "production",
    label: "Production Ready",
    description: "Attach all available policies for full coverage.",
    keywords: [],
  },
  {
    id: "data",
    label: "Data Protection",
    description: "Focus on PII and sensitive data detection.",
    keywords: ["pii", "redaction", "sensitive", "data"],
  },
  {
    id: "custom",
    label: "Custom",
    description: "Hand-pick policies manually.",
    keywords: [],
  },
];

const CREATE_OPTIONS: Array<{
  id: CreateOption;
  label: string;
  eyebrow: string;
  description: string;
}> = [
  {
    id: "template",
    label: "Use Template",
    eyebrow: "Starter",
    description: "Use a pre-generated template by UMAI.",
  },
  {
    id: "ai",
    label: "AI Builder",
    eyebrow: "Assisted",
    description: "Describe what you need to UMAI and create your deployable guardrail.",
  },
  {
    id: "custom",
    label: "Create Own",
    eyebrow: "Manual",
    description: "Create with your own configurations from scratch.",
  },
];

const AGENTIC_ARCHITECTURES = ["RAG", "Tool Calling", "DB Access", "MCP", "Multi Agent"];
const AGENTIC_AGENT_TYPES = [
  "Chat assistant",
  "Content creation",
  "Classifier",
  "Code agent",
  "NL2SQL",
  "Tool orchestrator",
];

const WIZARD_STEPS = [
  { id: 0, label: "Start" },
  { id: 1, label: "Basics" },
  { id: 2, label: "Policies" },
  { id: 3, label: "Pre-AI filters" },
  { id: 4, label: "LLM config" },
  { id: 5, label: "Review" },
];

const createPreflightRule = (): PreflightRule => ({
  id: "",
  mode: "REGEX",
  pattern: "",
  block_on_match: true,
});

export default function GuardrailsPage() {
  const { envId, projectId } = useParams() as { envId: string; projectId: string };
  const { tenantId } = useConsole();
  const { user } = useAuthSession();
  const searchParams = useSearchParams();
  const [guardrails, setGuardrails] = useState<Guardrail[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [guardrailVersions, setGuardrailVersions] = useState<GuardrailVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [guardrailLibrary, setGuardrailLibrary] = useState<GuardrailLibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [deployingTemplate, setDeployingTemplate] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [screen, setScreen] = useState<GuardrailScreen>("list");
  const [createOption, setCreateOption] = useState<CreateOption | null>(null);

  const [agenticDescription, setAgenticDescription] = useState("");
  const [agenticAgentType, setAgenticAgentType] = useState("");
  const [agenticAudience, setAgenticAudience] = useState("");
  const [agenticCountries, setAgenticCountries] = useState("");
  const [agenticArchitecture, setAgenticArchitecture] = useState<string[]>([]);
  const [agenticLoading, setAgenticLoading] = useState(false);
  const [agenticApproving, setAgenticApproving] = useState(false);
  const [agenticDraft, setAgenticDraft] = useState<AgenticGuardrailDraft | null>(null);

  const [wizardStep, setWizardStep] = useState(0);
  const [wizardMode, setWizardMode] = useState<WizardMode>("new");
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  const [guardrailId, setGuardrailId] = useState("");
  const [guardrailName, setGuardrailName] = useState("");
  const [guardrailMode, setGuardrailMode] = useState<Guardrail["mode"]>("ENFORCE");
  const [wizardGuardrailId, setWizardGuardrailId] = useState("");
  const [existingVersionBase, setExistingVersionBase] = useState<number | null>(null);
  const [versionOverride, setVersionOverride] = useState("");

  const [selectedGuardrailId, setSelectedGuardrailId] = useState("");
  const [selectedPolicyIds, setSelectedPolicyIds] = useState<string[]>([]);
  const [policySearch, setPolicySearch] = useState("");
  const [quickStartId, setQuickStartId] = useState<QuickStartId>("custom");

  const [preflightTarget, setPreflightTarget] = useState<PreflightTarget>(
    DEFAULT_PREFLIGHT.target
  );
  const [preflightMaxLength, setPreflightMaxLength] = useState(
    DEFAULT_PREFLIGHT.max_length?.toString() ?? ""
  );
  const [preflightRules, setPreflightRules] = useState<PreflightRule[]>(
    DEFAULT_PREFLIGHT.rules.map((rule) => ({ ...rule }))
  );
  const [preflightAdvanced, setPreflightAdvanced] = useState(false);
  const [preflightJsonText, setPreflightJsonText] = useState("");
  const [preflightJsonTouched, setPreflightJsonTouched] = useState(false);

  const [llmPresetId, setLlmPresetId] = useState(LLM_PRESETS[0]?.id ?? "CUSTOM");
  const [llmProvider, setLlmProvider] = useState(DEFAULT_LLM_CONFIG.provider);
  const [llmBaseUrl, setLlmBaseUrl] = useState(DEFAULT_LLM_CONFIG.base_url);
  const [llmModel, setLlmModel] = useState(DEFAULT_LLM_CONFIG.model);
  const [llmTimeout, setLlmTimeout] = useState(DEFAULT_LLM_CONFIG.timeout_ms.toString());
  const [llmAuthType, setLlmAuthType] = useState<"none" | "bearer" | "header">(
    DEFAULT_LLM_CONFIG.auth.type
  );
  const [llmAuthSecretEnv, setLlmAuthSecretEnv] = useState(
    DEFAULT_LLM_CONFIG.auth.secret_env ?? ""
  );
  const [llmAuthHeaderName, setLlmAuthHeaderName] = useState(
    DEFAULT_LLM_CONFIG.auth.header_name ?? ""
  );
  const [llmAdvanced, setLlmAdvanced] = useState(false);
  const [llmJsonText, setLlmJsonText] = useState("");
  const [llmJsonTouched, setLlmJsonTouched] = useState(false);
  const [guardrailAgt, setGuardrailAgt] = useState<AgtConfig | null>(null);
  const [loadingExistingConfig, setLoadingExistingConfig] = useState(false);

  const [publishNow, setPublishNow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [publishingDetailsVersion, setPublishingDetailsVersion] = useState(false);

  const [detailsVersion, setDetailsVersion] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<GuardrailSnapshotResponse | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [detailsTab, setDetailsTab] = useState<DetailsTab>("overview");
  const [detailsPolicyIndex, setDetailsPolicyIndex] = useState(0);
  const [detailsPolicyPhase, setDetailsPolicyPhase] = useState<PolicyPhase | "ALL">("ALL");
  const [toastItems, setToastItems] = useState<ToastItem[]>([]);
  const toastTimeouts = useRef<Record<number, number>>({});

  const selectedGuardrail = useMemo(
    () => guardrails.find((item) => item.guardrail_id === selectedGuardrailId) || null,
    [guardrails, selectedGuardrailId]
  );

  const availableDetailsPolicyPhases = useMemo(() => {
    const phaseSet = new Set<PolicyPhase>();
    (snapshot?.snapshot.policies ?? []).forEach((policy) => {
      policy.phases.forEach((phase) => phaseSet.add(phase));
    });
    return POLICY_PHASE_OPTIONS.filter((phase) => phaseSet.has(phase));
  }, [snapshot]);

  const filteredDetailsPolicies = useMemo(() => {
    const source = snapshot?.snapshot.policies ?? [];
    if (detailsPolicyPhase === "ALL") {
      return source;
    }
    return source.filter((policy) => policy.phases.includes(detailsPolicyPhase));
  }, [detailsPolicyPhase, snapshot]);

  const safeDetailsPolicyIndex =
    filteredDetailsPolicies.length === 0
      ? 0
      : Math.min(detailsPolicyIndex, filteredDetailsPolicies.length - 1);
  const activeDetailsPolicy = filteredDetailsPolicies[safeDetailsPolicyIndex] ?? null;
  const detailsPolicyTabOffset = Math.max(0, safeDetailsPolicyIndex - 1) * 224;

  const selectedTemplate = useMemo(
    () => guardrailLibrary.find((item) => item.template_id === selectedTemplateId) || null,
    [guardrailLibrary, selectedTemplateId]
  );

  const selectedWizardGuardrail = useMemo(
    () => guardrails.find((item) => item.guardrail_id === wizardGuardrailId) || null,
    [guardrails, wizardGuardrailId]
  );

  const visibleWizardSteps = useMemo(
    () =>
      WIZARD_STEPS.filter((step) => {
        if (createOption === "custom" && step.id === 0) {
          return false;
        }
        if (createOption === "template" && step.id === 4) {
          return false;
        }
        return true;
      }),
    [createOption]
  );

  const visibleWizardStepIds = useMemo(
    () => visibleWizardSteps.map((step) => step.id),
    [visibleWizardSteps]
  );

  const wizardDisplayStep = useMemo(() => {
    const index = visibleWizardSteps.findIndex((step) => step.id === wizardStep);
    return index >= 0 ? index + 1 : 1;
  }, [visibleWizardSteps, wizardStep]);

  const dismissToast = (toastId: number) => {
    const timeoutId = toastTimeouts.current[toastId];
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      delete toastTimeouts.current[toastId];
    }
    setToastItems((current) => current.filter((item) => item.id !== toastId));
  };

  const pushToast = (tone: ToastTone, message: string) => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;

    const toastId = nextToastId++;
    setToastItems((current) => [...current.slice(-2), { id: toastId, message: trimmedMessage, tone }]);
    toastTimeouts.current[toastId] = window.setTimeout(() => {
      setToastItems((current) => current.filter((item) => item.id !== toastId));
      delete toastTimeouts.current[toastId];
    }, 5000);
  };

  useEffect(() => {
    if (!envId || !projectId || !tenantId) return;
    setLoading(true);
    setLibraryLoading(true);
    Promise.allSettled([
      fetchGuardrails(tenantId, envId, projectId),
      fetchPolicies(tenantId, envId, projectId),
      fetchGuardrailLibrary(),
    ])
      .then(([guardrailResult, policyResult, libraryResult]) => {
        let loadFailed = false;
        if (guardrailResult.status === "fulfilled") {
          setGuardrails(guardrailResult.value);
          setSelectedGuardrailId(
            (current) => current || guardrailResult.value[0]?.guardrail_id || ""
          );
          setWizardGuardrailId(
            (current) => current || guardrailResult.value[0]?.guardrail_id || ""
          );
        } else {
          console.error(guardrailResult.reason);
          loadFailed = true;
        }
        if (policyResult.status === "fulfilled") {
          setPolicies(policyResult.value);
        } else {
          console.error(policyResult.reason);
          loadFailed = true;
        }
        if (loadFailed) {
          pushToast("error", "Unable to load guardrails or policies.");
        }
        if (libraryResult.status === "fulfilled") {
          setGuardrailLibrary(libraryResult.value);
          setLibraryError(null);
        } else {
          console.error(libraryResult.reason);
          setLibraryError("Unable to load the guardrail library.");
          pushToast("error", "Unable to load the guardrail library.");
        }
      })
      .finally(() => {
        setLoading(false);
        setLibraryLoading(false);
      });
  }, [envId, projectId, tenantId]);

  useEffect(() => {
    return () => {
      Object.values(toastTimeouts.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      toastTimeouts.current = {};
    };
  }, []);

  useEffect(() => {
    if (searchParams?.get("agentic") === "1") {
      setScreen("create");
      setCreateOption("ai");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!detailsOpen || !selectedGuardrailId || !envId || !projectId || !tenantId) {
      setGuardrailVersions([]);
      setDetailsVersion(null);
      setSnapshot(null);
      return;
    }
    setSnapshotError(null);
    fetchGuardrailVersions(tenantId, envId, projectId, selectedGuardrailId)
      .then((data) => {
        const sorted = [...data].sort((a, b) => b.version - a.version);
        setGuardrailVersions(sorted);
        const preferred = selectedGuardrail?.current_version ?? sorted[0]?.version ?? null;
        setDetailsVersion((current) => {
          if (current && sorted.some((item) => item.version === current)) {
            return current;
          }
          return preferred;
        });
      })
      .catch((err: Error) => {
        console.error(err);
        setSnapshotError("Unable to load guardrail versions.");
        setGuardrailVersions([]);
        setDetailsVersion(selectedGuardrail?.current_version ?? null);
      });
  }, [detailsOpen, envId, projectId, selectedGuardrailId, selectedGuardrail?.current_version, tenantId]);

  useEffect(() => {
    if (!detailsOpen || !selectedGuardrailId || !envId || !projectId || !detailsVersion || !tenantId) {
      setSnapshot(null);
      return;
    }
    setSnapshotLoading(true);
    setSnapshotError(null);
    fetchGuardrailSnapshot(
      tenantId,
      envId,
      projectId,
      selectedGuardrailId,
      detailsVersion
    )
      .then((data) => setSnapshot(data))
      .catch((err: Error) => {
        console.error(err);
        setSnapshotError("Unable to load guardrail snapshot.");
        setSnapshot(null);
      })
      .finally(() => setSnapshotLoading(false));
  }, [detailsOpen, envId, projectId, selectedGuardrailId, detailsVersion, tenantId]);

  useEffect(() => {
    if (detailsPolicyPhase !== "ALL" && !availableDetailsPolicyPhases.includes(detailsPolicyPhase)) {
      setDetailsPolicyPhase("ALL");
    }
  }, [availableDetailsPolicyPhases, detailsPolicyPhase]);

  useEffect(() => {
    setDetailsPolicyIndex((current) => {
      if (filteredDetailsPolicies.length === 0) {
        return 0;
      }
      return Math.min(current, filteredDetailsPolicies.length - 1);
    });
  }, [filteredDetailsPolicies.length]);

  useEffect(() => {
    setDetailsPolicyIndex(0);
  }, [detailsVersion, selectedGuardrailId, detailsPolicyPhase]);

  useEffect(() => {
    if (wizardMode === "new") {
      setPublishNow(true);
    }
  }, [wizardMode]);

  const preflightPreview = useMemo(() => {
    const normalizedRules = preflightRules
      .map((rule) => ({
        id: rule.id.trim(),
        mode: rule.mode,
        pattern: rule.pattern.trim(),
        block_on_match: rule.block_on_match,
      }))
      .filter((rule) => rule.id || rule.pattern);
    const maxLengthValue = Number(preflightMaxLength);
    const preview: Record<string, unknown> = {
      target: preflightTarget,
      rules: normalizedRules,
    };
    if (Number.isFinite(maxLengthValue) && maxLengthValue > 0) {
      preview.max_length = maxLengthValue;
    }
    return preview;
  }, [preflightRules, preflightTarget, preflightMaxLength]);

  const llmPreview = useMemo(
    () => ({
      provider: llmProvider.trim(),
      base_url: llmBaseUrl.trim(),
      model: llmModel.trim(),
      timeout_ms: Number(llmTimeout),
      auth: {
        type: llmAuthType,
        secret_env: llmAuthType === "none" ? null : llmAuthSecretEnv.trim() || null,
        header_name:
          llmAuthType === "header" ? llmAuthHeaderName.trim() || null : null,
      },
    }),
    [llmProvider, llmBaseUrl, llmModel, llmTimeout, llmAuthType, llmAuthSecretEnv, llmAuthHeaderName]
  );

  useEffect(() => {
    if (preflightAdvanced && !preflightJsonTouched) {
      setPreflightJsonText(JSON.stringify(preflightPreview, null, 2));
    }
  }, [preflightAdvanced, preflightJsonTouched, preflightPreview]);

  useEffect(() => {
    if (llmAdvanced && !llmJsonTouched) {
      setLlmJsonText(JSON.stringify(llmPreview, null, 2));
    }
  }, [llmAdvanced, llmJsonTouched, llmPreview]);

  const policyMap = useMemo(
    () => new Map(policies.map((policy) => [policy.policy_id, policy])),
    [policies]
  );

  const requiredPolicies = useMemo(
    () =>
      policies.filter(
        (policy) =>
          policy.scope === "ORGANIZATION" ||
          (policy.scope === "ENVIRONMENT" && policy.environment_id === envId)
      ),
    [policies, envId]
  );

  const requiredPolicyIds = useMemo(
    () => requiredPolicies.map((policy) => policy.policy_id),
    [requiredPolicies]
  );

  const requiredPolicyIdSet = useMemo(
    () => new Set(requiredPolicyIds),
    [requiredPolicyIds]
  );

  useEffect(() => {
    if (requiredPolicyIds.length === 0) return;
    setSelectedPolicyIds((current) => {
      const merged = new Set([...current, ...requiredPolicyIds]);
      return Array.from(merged);
    });
  }, [requiredPolicyIds]);

  const filteredPolicies = useMemo(() => {
    const term = policySearch.trim().toLowerCase();
    if (!term) return policies;
    return policies.filter((policy) => {
      const haystack = `${policy.name} ${policy.policy_id}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [policies, policySearch]);

  const selectedPolicies = useMemo(
    () =>
      selectedPolicyIds
        .map((policyId) => policyMap.get(policyId))
        .filter((policy): policy is Policy => Boolean(policy)),
    [policyMap, selectedPolicyIds]
  );

  const reviewPolicies = useMemo(
    () =>
      selectedPolicyIds
        .map((policyId) => {
          const existing = policyMap.get(policyId);
          if (existing) {
            return {
              policy_id: existing.policy_id,
              name: existing.name,
              phases: existing.phases,
            };
          }
          const templatePolicy = selectedTemplate?.policies.find(
            (policy) => policy.default_policy_id === policyId
          );
          if (!templatePolicy) return null;
          return {
            policy_id: templatePolicy.default_policy_id,
            name: templatePolicy.name,
            phases: templatePolicy.phases,
          };
        })
        .filter(
          (
            policy
          ): policy is { policy_id: string; name: string; phases: PolicyPhase[] } => Boolean(policy)
        ),
    [policyMap, selectedPolicyIds, selectedTemplate]
  );

  const missingPolicyIds = useMemo(
    () => selectedPolicyIds.filter((policyId) => !policyMap.has(policyId)),
    [policyMap, selectedPolicyIds]
  );

  const nextVersion = useMemo(() => {
    if (wizardMode === "new") {
      return selectedTemplate?.version ?? 1;
    }
    return existingVersionBase ?? (selectedWizardGuardrail ? selectedWizardGuardrail.current_version + 1 : 1);
  }, [wizardMode, existingVersionBase, selectedWizardGuardrail, selectedTemplate?.version]);

  const resolvedVersion = useMemo(() => {
    const parsed = Number(versionOverride);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    return nextVersion;
  }, [versionOverride, nextVersion]);

  const phaseSummary = useMemo(() => {
    const summary = Object.fromEntries(
      POLICY_PHASE_OPTIONS.map((phase) => [phase, 0])
    ) as Record<PolicyPhase, number>;
    selectedPolicies.forEach((policy) => {
      policy.phases.forEach((phase) => {
        summary[phase] = (summary[phase] ?? 0) + 1;
      });
    });
    if (createOption === "template" && selectedTemplate?.agt?.enabled) {
      selectedTemplate.agt.enforced_phases.forEach((phase) => {
        summary[phase] = (summary[phase] ?? 0) + 1;
      });
    }
    return summary;
  }, [createOption, selectedPolicies, selectedTemplate]);

  const phaseSummaryText = useMemo(() => {
    const active = POLICY_PHASE_OPTIONS.filter((phase) => (phaseSummary[phase] ?? 0) > 0);
    if (active.length === 0) {
      return "No phases selected yet.";
    }
    return active
      .map((phase) => `${PHASE_LABELS[phase]}: ${phaseSummary[phase] ?? 0}`)
      .join(" | ");
  }, [phaseSummary]);

  const guardrailIdTrimmed = guardrailId.trim();
  const guardrailNameTrimmed = guardrailName.trim();
  const guardrailIdPattern = /^[a-z0-9-]+$/;
  const guardrailIdExists = useMemo(
    () => guardrails.some((item) => item.guardrail_id === guardrailIdTrimmed),
    [guardrails, guardrailIdTrimmed]
  );

  const guardrailIdStatus = useMemo(() => {
    if (!guardrailIdTrimmed) {
      return { tone: "text-slate/60", message: "Required." };
    }
    if (!guardrailIdPattern.test(guardrailIdTrimmed)) {
      return { tone: "text-danger", message: "Use lowercase letters, numbers, and dashes." };
    }
    if (guardrailIdExists) {
      return { tone: "text-danger", message: "This ID already exists." };
    }
    return { tone: "text-mint", message: "ID is available." };
  }, [guardrailIdExists, guardrailIdPattern, guardrailIdTrimmed]);

  const slugifyId = (value: string, fallback: string) => {
    const normalized = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/--+/g, "-");
    return normalized || fallback;
  };

  const ensureUniqueId = (base: string, used: Set<string>) => {
    let candidate = base;
    let index = 1;
    while (used.has(candidate)) {
      candidate = `${base}-${index}`;
      index += 1;
    }
    used.add(candidate);
    return candidate;
  };

  const normalizeAgenticDraft = (draft: AgenticGuardrailDraft) => {
    const usedGuardrailIds = new Set(guardrails.map((item) => item.guardrail_id));
    const usedPolicyIds = new Set(policies.map((item) => item.policy_id));
    const defaultPhases: PolicyPhase[] = ["PRE_LLM"];

    const baseGuardrailId = slugifyId(
      draft.guardrail.guardrail_id || draft.guardrail.name || `guardrail-${projectId}`,
      `guardrail-${projectId}`
    );
    const guardrailId = ensureUniqueId(baseGuardrailId, usedGuardrailIds);

    const normalizedPolicies = (draft.policies || []).map((policy) => {
      const basePolicyId = slugifyId(
        policy.policy_id || policy.name || `${guardrailId}-policy`,
        `${guardrailId}-policy`
      );
      const policyId = ensureUniqueId(basePolicyId, usedPolicyIds);
      return {
        ...policy,
        policy_id: policyId,
        enabled: policy.enabled ?? true,
        phases:
          policy.phases && policy.phases.length > 0 ? policy.phases : defaultPhases,
        config: policy.config ?? {},
      };
    });

    const guardrail = {
      ...draft.guardrail,
      guardrail_id: guardrailId,
      name: draft.guardrail.name?.trim() || "AI Guardrail",
      mode: draft.guardrail.mode || "ENFORCE",
      phases:
        draft.guardrail.phases && draft.guardrail.phases.length > 0
          ? draft.guardrail.phases
          : defaultPhases,
      preflight: draft.guardrail.preflight || DEFAULT_PREFLIGHT,
      llm_config: draft.guardrail.llm_config || DEFAULT_LLM_CONFIG,
    };

    return {
      ...draft,
      guardrail,
      policies: normalizedPolicies,
      rationale: draft.rationale || "No rationale provided.",
      notes: draft.notes || [],
    };
  };

  const formatJson = (value: unknown) => JSON.stringify(value ?? {}, null, 2);

  const openDetails = (guardrailId: string) => {
    setSelectedGuardrailId(guardrailId);
    const guardrail = guardrails.find((item) => item.guardrail_id === guardrailId);
    setDetailsVersion(guardrail?.current_version ?? null);
    setDetailsTab("overview");
    setDetailsPolicyPhase("ALL");
    setDetailsPolicyIndex(0);
    setDetailsOpen(true);
  };

  const closeDetails = () => {
    setDetailsOpen(false);
    setSnapshot(null);
    setSnapshotError(null);
    setGuardrailVersions([]);
    setDetailsVersion(null);
    setDetailsTab("overview");
    setDetailsPolicyPhase("ALL");
    setDetailsPolicyIndex(0);
  };

  const handlePublishSelectedVersion = async () => {
    if (!tenantId || !selectedGuardrailId || !detailsVersion) {
      pushToast("error", "Select a guardrail version before publishing.");
      return;
    }
    setPublishingDetailsVersion(true);
    try {
      const actorId = user?.username || user?.email || user?.sub || undefined;
      await publishGuardrailVersion(selectedGuardrailId, detailsVersion, {
        tenant_id: tenantId,
        environment_id: envId,
        project_id: projectId,
        publisher_id: actorId,
        approver_id: actorId,
      });
      const [updatedGuardrails, versions, snapshotResponse] = await Promise.all([
        fetchGuardrails(tenantId, envId, projectId),
        fetchGuardrailVersions(tenantId, envId, projectId, selectedGuardrailId),
        fetchGuardrailSnapshot(
          tenantId,
          envId,
          projectId,
          selectedGuardrailId,
          detailsVersion
        ),
      ]);
      setGuardrails(updatedGuardrails);
      setGuardrailVersions([...versions].sort((a, b) => b.version - a.version));
      setSnapshot(snapshotResponse);
      pushToast("success", `Guardrail version v${detailsVersion} published.`);
    } catch (err) {
      console.error(err);
      pushToast(
        "error",
        err instanceof Error ? err.message : "Publishing failed. Try again."
      );
    } finally {
      setPublishingDetailsVersion(false);
    }
  };

  const openCreateScreen = () => {
    setScreen("create");
    setCreateOption(null);
    setWizardError(null);
    setLoadingExistingConfig(false);
    setExistingVersionBase(null);
  };

  const closeCreateScreen = () => {
    setScreen("list");
    setCreateOption(null);
    setWizardError(null);
    setLoadingExistingConfig(false);
    setExistingVersionBase(null);
  };

  const selectCreateOption = (option: CreateOption) => {
    setScreen("create");
    setCreateOption(option);
    setWizardError(null);
    setLoadingExistingConfig(false);

    if (option === "template") {
      setWizardMode("new");
      setWizardStep(0);
      setGuardrailAgt(null);
      setExistingVersionBase(null);
    }

    if (option === "custom") {
      setSelectedTemplateId(null);
      setWizardMode("new");
      setWizardStep(1);
      setGuardrailAgt(null);
      setExistingVersionBase(null);
    }
  };

  const togglePolicy = (policyId: string) => {
    if (requiredPolicyIdSet.has(policyId)) {
      return;
    }
    setSelectedPolicyIds((current) =>
      current.includes(policyId)
        ? current.filter((value) => value !== policyId)
        : [...current, policyId]
    );
  };

  const updatePreflightRule = <K extends keyof PreflightRule>(
    index: number,
    field: K,
    value: PreflightRule[K]
  ) => {
    setPreflightRules((current) =>
      current.map((rule, idx) => (idx === index ? { ...rule, [field]: value } : rule))
    );
  };

  const addPreflightRule = () => {
    setPreflightRules((current) => [...current, createPreflightRule()]);
  };

  const removePreflightRule = (index: number) => {
    setPreflightRules((current) => current.filter((_, idx) => idx !== index));
  };

  const addPreflightTemplate = (templateId: string) => {
    const template = PREFLIGHT_RULE_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    setPreflightRules((current) => [...current, { ...template.rule }]);
  };

  const mergeRequiredPolicies = (policyIds: string[]) =>
    Array.from(new Set([...policyIds, ...requiredPolicyIds]));

  const toggleAgenticArchitecture = (value: string) => {
    setAgenticArchitecture((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    );
  };

  const handleAgenticGenerate = async () => {
    setAgenticDraft(null);

    if (!tenantId) {
      pushToast("error", "Tenant not configured.");
      return;
    }

    if (!agenticDescription.trim() || !agenticAgentType.trim() || !agenticAudience.trim()) {
      pushToast("error", "Please answer the first three questions before continuing.");
      return;
    }

    const countries = agenticCountries
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    setAgenticLoading(true);
    try {
      const draft = await generateAgenticGuardrail({
        tenant_id: tenantId,
        environment_id: envId,
        project_id: projectId,
        agent_description: agenticDescription.trim(),
        agent_type: agenticAgentType.trim(),
        target_audience: agenticAudience.trim(),
        available_countries: countries,
        architecture: agenticArchitecture,
      });
      const normalized = normalizeAgenticDraft(draft);
      setAgenticDraft(normalized);
      pushToast("info", "Draft generated. Review and approve before publishing.");
    } catch (err) {
      console.error(err);
      pushToast("error", "Unable to generate a guardrail draft right now.");
    } finally {
      setAgenticLoading(false);
    }
  };

  const handleAgenticApprove = async () => {
    if (!tenantId || !agenticDraft) return;
    setAgenticApproving(true);

    const guardrailIdValue = agenticDraft.guardrail.guardrail_id;
    if (guardrails.some((item) => item.guardrail_id === guardrailIdValue)) {
      pushToast("error", "Guardrail ID already exists. Regenerate to continue.");
      setAgenticApproving(false);
      return;
    }

    try {
      const createdPolicies: Policy[] = [];
      for (const policy of agenticDraft.policies) {
        if (policies.some((item) => item.policy_id === policy.policy_id)) {
          continue;
        }
        const created = await createPolicy({
          tenant_id: tenantId,
          environment_id: envId,
          project_id: projectId,
          policy_id: policy.policy_id,
          name: policy.name,
          type: policy.type,
          enabled: policy.enabled,
          phases: policy.phases,
          config: policy.config,
        });
        createdPolicies.push(created);
      }
      if (createdPolicies.length > 0) {
        setPolicies((current) => [...createdPolicies, ...current]);
      }

      await createGuardrail({
        tenant_id: tenantId,
        environment_id: envId,
        project_id: projectId,
        guardrail_id: guardrailIdValue,
        name: agenticDraft.guardrail.name,
        mode: agenticDraft.guardrail.mode,
        current_version: 1,
      });

      await createGuardrailVersion(guardrailIdValue, {
        tenant_id: tenantId,
        environment_id: envId,
        project_id: projectId,
        version: 1,
        policy_ids: agenticDraft.policies.map((policy) => policy.policy_id),
        preflight: agenticDraft.guardrail.preflight,
        llm_config: agenticDraft.guardrail.llm_config,
        phases: agenticDraft.guardrail.phases,
        agt: agenticDraft.guardrail.agt ?? undefined,
      });

      const updatedGuardrails = await fetchGuardrails(tenantId, envId, projectId);
      setGuardrails(updatedGuardrails);
      setSelectedGuardrailId(guardrailIdValue);
      setWizardGuardrailId(guardrailIdValue);
      try {
        await publishGuardrailVersion(guardrailIdValue, 1, {
          tenant_id: tenantId,
          environment_id: envId,
          project_id: projectId,
        });
        pushToast("success", DEPLOY_SUCCESS_MESSAGE);
      } catch (publishErr) {
        console.error(publishErr);
        pushToast(
          "error",
          `Guardrail draft created, but publishing was blocked: ${
            publishErr instanceof Error ? publishErr.message : "Unknown publish error."
          }`
        );
      }
    } catch (err) {
      console.error(err);
      pushToast(
        "error",
        err instanceof Error ? err.message : "Guardrail creation failed. Check the draft and try again."
      );
    } finally {
      setAgenticApproving(false);
    }
  };

  const applyQuickStart = (presetId: QuickStartId) => {
    setQuickStartId(presetId);
    if (presetId === "custom") {
      return;
    }
    const preset = QUICK_STARTS.find((item) => item.id === presetId);
    if (!preset) return;
    if (presetId === "production") {
      setSelectedPolicyIds(
        mergeRequiredPolicies(policies.map((policy) => policy.policy_id))
      );
      return;
    }
    const matches = policies.filter((policy) => {
      const haystack = `${policy.name} ${policy.policy_id}`.toLowerCase();
      return preset.keywords.some((keyword) => haystack.includes(keyword));
    });
    setSelectedPolicyIds(mergeRequiredPolicies(matches.map((policy) => policy.policy_id)));
    if (matches.length === 0) {
      pushToast(
        "info",
        "No matching policies were found. Deploy templates from the Policies tab to use this preset."
      );
    }
  };

  const applyTemplateSettings = (template: GuardrailLibraryItem) => {
    setSelectedTemplateId(template.template_id);
    setWizardMode("new");
    setGuardrailId(template.default_guardrail_id);
    setGuardrailName(template.name);
    setGuardrailMode(template.mode);
    setSelectedPolicyIds(
      mergeRequiredPolicies(template.policies.map((policy) => policy.default_policy_id))
    );
    const preflight = template.preflight as Record<string, unknown>;
    const preflightRules = Array.isArray(preflight?.rules)
      ? (preflight.rules as PreflightRule[])
      : [];
    setPreflightTarget(
      (preflight?.target as PreflightTarget) || DEFAULT_PREFLIGHT.target
    );
    setPreflightRules(preflightRules.map((rule) => ({ ...rule })));
    setPreflightMaxLength(
      typeof preflight?.max_length === "number"
        ? preflight.max_length.toString()
        : ""
    );
    const llmConfig = template.llm_config as Record<string, unknown>;
    setLlmProvider((llmConfig?.provider as string) || DEFAULT_LLM_CONFIG.provider);
    setLlmBaseUrl((llmConfig?.base_url as string) || DEFAULT_LLM_CONFIG.base_url);
    setLlmModel((llmConfig?.model as string) || DEFAULT_LLM_CONFIG.model);
    setLlmTimeout(
      typeof llmConfig?.timeout_ms === "number"
        ? llmConfig.timeout_ms.toString()
        : DEFAULT_LLM_CONFIG.timeout_ms.toString()
    );
    const auth = (llmConfig?.auth as Record<string, unknown> | undefined) || {};
    setLlmAuthType(
      ((auth.type as "none" | "bearer" | "header" | undefined) ??
        DEFAULT_LLM_CONFIG.auth.type)
    );
    setLlmAuthSecretEnv(
      (auth.secret_env as string | undefined) ?? DEFAULT_LLM_CONFIG.auth.secret_env ?? ""
    );
    setLlmAuthHeaderName(
      (auth.header_name as string | undefined) ?? DEFAULT_LLM_CONFIG.auth.header_name ?? ""
    );
    setGuardrailAgt(template.agt ?? null);
    setExistingVersionBase(null);
    setPublishNow(true);
    setVersionOverride("");
    setWizardStep(1);
    pushToast("info", "Template settings applied. Review and edit as needed.");
  };

  const applySnapshotSettings = (snapshotResponse: GuardrailSnapshotResponse) => {
    const snapshotPayload = snapshotResponse.snapshot;
    const preflight = snapshotPayload.preflight as Record<string, unknown>;
    const snapshotRules = Array.isArray(preflight?.rules)
      ? (preflight.rules as PreflightRule[])
      : [];
    const llmConfig = snapshotPayload.llm_config as Record<string, unknown>;
    const auth = (llmConfig?.auth as Record<string, unknown> | undefined) || {};

    setSelectedTemplateId(null);
    setSelectedPolicyIds(
      mergeRequiredPolicies(snapshotPayload.policies.map((policy) => policy.id))
    );
    setPreflightTarget(
      (preflight?.target as PreflightTarget) || DEFAULT_PREFLIGHT.target
    );
    setPreflightRules(snapshotRules.map((rule) => ({ ...rule })));
    setPreflightMaxLength(
      typeof preflight?.max_length === "number"
        ? preflight.max_length.toString()
        : ""
    );
    setLlmProvider((llmConfig?.provider as string) || DEFAULT_LLM_CONFIG.provider);
    setLlmBaseUrl((llmConfig?.base_url as string) || DEFAULT_LLM_CONFIG.base_url);
    setLlmModel((llmConfig?.model as string) || DEFAULT_LLM_CONFIG.model);
    setLlmTimeout(
      typeof llmConfig?.timeout_ms === "number"
        ? llmConfig.timeout_ms.toString()
        : DEFAULT_LLM_CONFIG.timeout_ms.toString()
    );
    setLlmAuthType(
      ((auth.type as "none" | "bearer" | "header" | undefined) ??
        DEFAULT_LLM_CONFIG.auth.type)
    );
    setLlmAuthSecretEnv(
      (auth.secret_env as string | undefined) ?? DEFAULT_LLM_CONFIG.auth.secret_env ?? ""
    );
    setLlmAuthHeaderName(
      (auth.header_name as string | undefined) ?? DEFAULT_LLM_CONFIG.auth.header_name ?? ""
    );
    setGuardrailAgt(snapshotPayload.agt ?? null);
    setPublishNow(false);
    setVersionOverride("");
    setPreflightAdvanced(false);
    setPreflightJsonTouched(false);
    setLlmAdvanced(false);
    setLlmJsonTouched(false);
  };

  const loadExistingGuardrailConfig = async (guardrailId: string) => {
    if (!tenantId) {
      pushToast("error", "Tenant not configured.");
      return;
    }
    const guardrail = guardrails.find((item) => item.guardrail_id === guardrailId);
    if (!guardrail) {
      pushToast("error", "Guardrail could not be found.");
      return;
    }

    setLoadingExistingConfig(true);
    setExistingVersionBase(null);
    try {
      const [snapshotResponse, versions] = await Promise.all([
        fetchGuardrailSnapshot(
          tenantId,
          envId,
          projectId,
          guardrailId,
          guardrail.current_version
        ),
        fetchGuardrailVersions(tenantId, envId, projectId, guardrailId),
      ]);
      const highestVersion = versions.reduce(
        (maxVersion, item) => Math.max(maxVersion, item.version),
        guardrail.current_version
      );
      setWizardMode("existing");
      setWizardGuardrailId(guardrailId);
      setExistingVersionBase(highestVersion + 1);
      setVersionOverride("");
      applySnapshotSettings(snapshotResponse);
    } catch (err) {
      console.error(err);
      pushToast(
        "error",
        err instanceof Error
          ? err.message
          : "Unable to load the current guardrail version."
      );
    } finally {
      setLoadingExistingConfig(false);
    }
  };

  const startExistingGuardrailVersion = async (guardrailId: string) => {
    setScreen("create");
    setCreateOption("custom");
    setWizardStep(1);
    setWizardError(null);
    await loadExistingGuardrailConfig(guardrailId);
  };

  const applyLlmPreset = (presetId: string) => {
    setLlmPresetId(presetId);
    const preset = LLM_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    if (preset.id !== "CUSTOM") {
      setLlmProvider(preset.provider);
      setLlmBaseUrl(preset.base_url);
      setLlmModel(preset.model);
      setLlmAuthType(preset.auth.type);
      setLlmAuthSecretEnv(preset.auth.secret_env ?? "");
      setLlmAuthHeaderName(preset.auth.header_name ?? "");
    }
  };

  const buildPreflightPayload = () => {
    if (preflightAdvanced) {
      const trimmed = preflightJsonText.trim();
      if (!trimmed) {
        return { error: "Preflight JSON cannot be empty." };
      }
      try {
        return { payload: JSON.parse(trimmed) as Record<string, unknown> };
      } catch (err) {
        return { error: "Preflight JSON must be valid JSON." };
      }
    }

    const normalizedRules = preflightRules
      .map((rule) => ({
        id: rule.id.trim(),
        mode: rule.mode,
        pattern: rule.pattern.trim(),
        block_on_match: rule.block_on_match,
      }))
      .filter((rule) => rule.id || rule.pattern);

    const invalidRule = normalizedRules.find((rule) => !rule.id || !rule.pattern);
    if (invalidRule) {
      return { error: "Each preflight rule needs an ID and a pattern." };
    }

    const maxLengthRaw = preflightMaxLength.trim();
    if (maxLengthRaw) {
      const maxLengthValue = Number(maxLengthRaw);
      if (!Number.isFinite(maxLengthValue) || maxLengthValue <= 0) {
        return { error: "Max length must be a positive number." };
      }
    }

    const maxLengthValue = Number(preflightMaxLength);
    const payload: Record<string, unknown> = {
      target: preflightTarget,
      rules: normalizedRules,
    };
    if (Number.isFinite(maxLengthValue) && maxLengthValue > 0) {
      payload.max_length = maxLengthValue;
    }

    return { payload };
  };

  const buildLlmPayload = () => {
    if (llmAdvanced) {
      const trimmed = llmJsonText.trim();
      if (!trimmed) {
        return { error: "LLM config JSON cannot be empty." };
      }
      try {
        return { payload: JSON.parse(trimmed) as Record<string, unknown> };
      } catch (err) {
        return { error: "LLM config JSON must be valid JSON." };
      }
    }

    const provider = llmProvider.trim();
    const baseUrl = llmBaseUrl.trim();
    const model = llmModel.trim();
    const timeoutValue = Number(llmTimeout);

    if (!provider || !baseUrl || !model) {
      return { error: "Provider, base URL, and model are required." };
    }
    if (!Number.isFinite(timeoutValue) || timeoutValue <= 0) {
      return { error: "Timeout must be a positive number." };
    }
    if (llmAuthType !== "none" && !llmAuthSecretEnv.trim()) {
      return { error: "Secret env is required unless auth type is None." };
    }
    if (llmAuthType === "header" && !llmAuthHeaderName.trim()) {
      return { error: "Header name is required for custom header auth." };
    }

    return {
      payload: {
        provider,
        base_url: baseUrl,
        model,
        timeout_ms: timeoutValue,
        auth: {
          type: llmAuthType,
          secret_env: llmAuthType === "none" ? null : llmAuthSecretEnv.trim(),
          header_name: llmAuthType === "header" ? llmAuthHeaderName.trim() : null,
        },
      },
    };
  };

  const validateStep = (step: number) => {
    if (step === 1) {
      if (wizardMode === "new") {
        if (!guardrailIdTrimmed || !guardrailNameTrimmed) {
          return "Guardrail ID and name are required.";
        }
        if (!guardrailIdPattern.test(guardrailIdTrimmed)) {
          return "Guardrail ID must use lowercase letters, numbers, and dashes.";
        }
        if (guardrailIdExists) {
          return "Guardrail ID already exists.";
        }
      } else if (!wizardGuardrailId) {
        return "Select an existing guardrail to update.";
      }
    }

    if (step === 2) {
      if (selectedPolicyIds.length === 0) {
        return "Select at least one policy.";
      }
      if (missingPolicyIds.length > 0 && !selectedTemplate) {
        return "Some selected policies are missing. Deploy them or choose existing policies.";
      }
    }

    if (step === 3) {
      const result = buildPreflightPayload();
      if ("error" in result) {
        return result.error as string;
      }
    }

    if (step === 4) {
      const result = buildLlmPayload();
      if ("error" in result) {
        return result.error as string;
      }
    }

    return null;
  };

  const ensureTemplatePolicies = async (policyIds: string[]) => {
    if (!selectedTemplate || policyIds.length === 0) return;
    if (!tenantId) {
      throw new Error("Tenant not configured.");
    }
    const existingIds = new Set(policies.map((policy) => policy.policy_id));
    const missing = policyIds.filter((policyId) => !existingIds.has(policyId));
    if (missing.length === 0) return;

    const createdPolicies: Policy[] = [];
    for (const policyId of missing) {
      const templatePolicy = selectedTemplate.policies.find(
        (policy) => policy.default_policy_id === policyId
      );
      if (!templatePolicy) {
        throw new Error(`Missing policy template for ${policyId}.`);
      }
      const created = await createPolicy({
        tenant_id: tenantId,
        environment_id: envId,
        project_id: projectId,
        policy_id: templatePolicy.default_policy_id,
        name: templatePolicy.name,
        type: templatePolicy.type,
        enabled: templatePolicy.enabled,
        phases: templatePolicy.phases,
        config: templatePolicy.config,
      });
      createdPolicies.push(created);
    }

    if (createdPolicies.length > 0) {
      setPolicies((current) => [...createdPolicies, ...current]);
    }
  };

  const handleDeployGuardrail = async (template: GuardrailLibraryItem) => {
    if (!envId || !projectId || !tenantId) {
      pushToast("error", "Tenant not configured.");
      return;
    }
    setDeployingTemplate(template.template_id);
    try {
      const result = await deployGuardrailTemplate({
        tenant_id: tenantId,
        environment_id: envId,
        project_id: projectId,
        template_id: template.template_id,
        publish: true,
      });
      setSelectedGuardrailId(result.guardrail.guardrail_id);
      setWizardGuardrailId(result.guardrail.guardrail_id);
      pushToast("success", DEPLOY_SUCCESS_MESSAGE);
      const [guardrailData, policyData] = await Promise.all([
        fetchGuardrails(tenantId, envId, projectId),
        fetchPolicies(tenantId, envId, projectId),
      ]);
      setGuardrails(guardrailData);
      setPolicies(policyData);
    } catch (err) {
      console.error(err);
      pushToast(
        "error",
        err instanceof Error ? err.message : "Guardrail deployment failed. Try again."
      );
    } finally {
      setDeployingTemplate(null);
    }
  };

  const handleWizardSubmit = async () => {
    setWizardError(null);

    const stepError = validateStep(5);
    if (stepError) {
      setWizardError(stepError);
      return;
    }

    if (!tenantId) {
      pushToast("error", "Tenant not configured.");
      return;
    }

    const guardrailIdValue =
      wizardMode === "new" ? guardrailIdTrimmed : wizardGuardrailId;
    const guardrailNameValue =
      wizardMode === "new" ? guardrailNameTrimmed : selectedWizardGuardrail?.name;
    const guardrailModeValue =
      wizardMode === "new" ? guardrailMode : selectedWizardGuardrail?.mode;

    if (!guardrailIdValue || !guardrailNameValue || !guardrailModeValue) {
      setWizardError("Guardrail details are incomplete.");
      return;
    }

    const preflightResult = buildPreflightPayload();
    if ("error" in preflightResult) {
      setWizardError(preflightResult.error as string);
      return;
    }
    const llmResult = buildLlmPayload();
    if ("error" in llmResult) {
      setWizardError(llmResult.error as string);
      return;
    }

    setSubmitting(true);
    try {
      if (wizardMode === "new") {
        await createGuardrail({
          tenant_id: tenantId,
          environment_id: envId,
          project_id: projectId,
          guardrail_id: guardrailIdValue,
          name: guardrailNameValue,
          mode: guardrailModeValue,
          current_version: resolvedVersion,
        });
      }

      if (missingPolicyIds.length > 0) {
        await ensureTemplatePolicies(missingPolicyIds);
      }

      await createGuardrailVersion(guardrailIdValue, {
        tenant_id: tenantId,
        environment_id: envId,
        project_id: projectId,
        version: resolvedVersion,
        policy_ids: selectedPolicyIds,
        preflight: preflightResult.payload,
        llm_config: llmResult.payload,
        agt: guardrailAgt ?? undefined,
      });

      let publishBlockedMessage: string | null = null;
      if (publishNow) {
        try {
          const actorId = user?.username || user?.email || user?.sub || undefined;
          await publishGuardrailVersion(guardrailIdValue, resolvedVersion, {
            tenant_id: tenantId,
            environment_id: envId,
            project_id: projectId,
            publisher_id: actorId,
            approver_id: actorId,
          });
        } catch (publishErr) {
          console.error(publishErr);
          publishBlockedMessage =
            publishErr instanceof Error
              ? publishErr.message
              : "Publishing was blocked by the backend.";
        }
      }

      const updatedGuardrails = await fetchGuardrails(tenantId, envId, projectId);
      setGuardrails(updatedGuardrails);
      setSelectedGuardrailId(guardrailIdValue);
      setWizardGuardrailId(guardrailIdValue);
      if (publishBlockedMessage) {
        pushToast(
          "error",
          `Guardrail version created, but publishing was blocked: ${publishBlockedMessage}`
        );
      } else if (wizardMode === "new" || publishNow) {
        pushToast("success", DEPLOY_SUCCESS_MESSAGE);
      } else {
        pushToast("info", "Guardrail version created successfully.");
      }
    } catch (err) {
      console.error(err);
      pushToast(
        "error",
        err instanceof Error ? err.message : "Guardrail creation failed. Check the fields and try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    const error = validateStep(wizardStep);
    if (error) {
      setWizardError(error);
      return;
    }
    setWizardError(null);
    setWizardStep((current) => {
      const currentIndex = visibleWizardStepIds.indexOf(current);
      if (currentIndex === -1) {
        return current;
      }
      return visibleWizardStepIds[currentIndex + 1] ?? current;
    });
  };

  const handleBack = () => {
    setWizardError(null);
    if (createOption === "custom" && wizardStep === 1) {
      setCreateOption(null);
      return;
    }
    setWizardStep((current) => {
      const currentIndex = visibleWizardStepIds.indexOf(current);
      if (currentIndex <= 0) {
        return current;
      }
      return visibleWizardStepIds[currentIndex - 1] ?? current;
    });
  };

  return (
    <div className="space-y-10 fade-up">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">Guardrails</p>
          <h2 className="font-display text-4xl font-bold text-ink tracking-tight">Guardrail Control</h2>
          <p className="mt-1 text-sm text-slate">
            Review active guardrails first, then start a new one only when you are ready.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-full bg-slate/10 px-4 py-2 text-xs font-semibold text-slate">
            {guardrails.length} guardrails
          </div>
          {screen === "list" ? (
            <button
              type="button"
              className="rounded-xl bg-ink px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-ink/90"
              onClick={openCreateScreen}
            >
              Create New Guardrail
            </button>
          ) : (
            <button
              type="button"
              className="rounded-xl border border-slate/10 px-4 py-2 text-xs font-bold text-slate hover:bg-slate/5"
              onClick={closeCreateScreen}
            >
              Back to Guardrails
            </button>
          )}
        </div>
      </header>

      {screen === "create" && (
        <section className="rounded-3xl border border-slate/10 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                Create Flow
              </p>
              <h3 className="mt-2 font-display text-2xl font-bold text-ink">Create New Guardrail</h3>
              <p className="mt-2 max-w-2xl text-sm text-slate">
                Choose how you want to start. We can go deeper into each path after this first
                decision.
              </p>
            </div>
            {createOption && (
              <button
                type="button"
                className="rounded-xl border border-slate/10 px-4 py-2 text-xs font-bold text-slate hover:bg-slate/5"
                onClick={() => setCreateOption(null)}
              >
                Back to options
              </button>
            )}
          </div>

          <div className="mt-8 grid gap-4 xl:grid-cols-3">
            {CREATE_OPTIONS.map((option, index) => {
              const active = createOption === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => selectCreateOption(option.id)}
                  className={`rounded-3xl border px-6 py-6 text-left transition ${
                    active
                      ? "border-ink bg-ink text-white shadow-sm"
                      : "border-slate/10 bg-white hover:border-slate/20 hover:bg-slate/5"
                  }`}
                >
                  <p
                    className={`text-[10px] font-bold uppercase tracking-[0.3em] ${
                      active ? "text-white/70" : "text-slate/60"
                    }`}
                  >
                    {String(index + 1).padStart(2, "0")} {option.eyebrow}
                  </p>
                  <h4 className="mt-5 text-xl font-bold">{option.label}</h4>
                  <p className={`mt-3 text-sm ${active ? "text-white/80" : "text-slate"}`}>
                    {option.description}
                  </p>
                  <span
                    className={`mt-8 inline-flex text-[10px] font-bold uppercase tracking-[0.3em] ${
                      active ? "text-white" : "text-accent"
                    }`}
                  >
                    {active ? "Selected" : "Choose option"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {screen === "create" && createOption === "ai" && (
        <section
          id="agentic-builder"
          className="rounded-3xl border border-slate/10 bg-white p-8 shadow-sm space-y-6"
        >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
              AI Builder
            </p>
            <h3 className="mt-2 text-2xl font-bold text-ink">
              Describe the guardrail you need
            </h3>
            <p className="mt-2 text-sm text-slate max-w-2xl">
              Answer a short questionnaire and UMAI will draft policies and a deployable
              guardrail for approval.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                  1. Describe your agent functionality
                </label>
                <textarea
                  className="h-28 w-full rounded-2xl border border-slate/10 bg-white px-3 py-3 text-sm"
                  value={agenticDescription}
                  onChange={(event) => setAgenticDescription(event.target.value)}
                  placeholder="Paste the prompt or describe the workflow."
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                    2. What is this agent for
                  </label>
                  <input
                    list="agentic-agent-types"
                    className="w-full rounded-2xl border border-slate/10 bg-white px-3 py-2 text-sm"
                    value={agenticAgentType}
                    onChange={(event) => setAgenticAgentType(event.target.value)}
                    placeholder="Chat assistant, classifier, code agent..."
                  />
                  <datalist id="agentic-agent-types">
                    {AGENTIC_AGENT_TYPES.map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                    3. Target audience
                  </label>
                  <input
                    className="w-full rounded-2xl border border-slate/10 bg-white px-3 py-2 text-sm"
                    value={agenticAudience}
                    onChange={(event) => setAgenticAudience(event.target.value)}
                    placeholder="Internal users, enterprise customers, students..."
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                    4. Available countries
                  </label>
                  <input
                    className="w-full rounded-2xl border border-slate/10 bg-white px-3 py-2 text-sm"
                    value={agenticCountries}
                    onChange={(event) => setAgenticCountries(event.target.value)}
                    placeholder="US, UK, DE (comma separated)"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                    5. Agent architecture
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {AGENTIC_ARCHITECTURES.map((item) => {
                      const active = agenticArchitecture.includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => toggleAgenticArchitecture(item)}
                          className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                            active
                              ? "border-ink/10 bg-ink text-white"
                              : "border-slate/10 bg-white text-slate"
                          }`}
                        >
                          {item}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="inline-flex items-center justify-center rounded-xl bg-accent px-4 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-accent/90 disabled:opacity-60"
                onClick={handleAgenticGenerate}
                disabled={agenticLoading}
              >
                {agenticLoading ? "Generating..." : "Generate guardrail draft"}
              </button>
            </div>

            <div className="rounded-2xl border border-slate/10 bg-slate/5 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                  Draft review
                </p>
                {agenticDraft && (
                  <span className="text-[10px] font-semibold text-slate">
                    {agenticDraft.policies.length} policies
                  </span>
                )}
              </div>

              {!agenticDraft ? (
                <p className="text-sm text-slate">
                  No draft yet. Generate to preview the recommended guardrail.
                </p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-ink">{agenticDraft.guardrail.name}</p>
                    <p className="text-[11px] text-slate">{agenticDraft.guardrail.guardrail_id}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate">
                      <span className="rounded-full bg-white px-2 py-1">
                        {agenticDraft.guardrail.mode}
                      </span>
                      {agenticDraft.guardrail.phases.map((phase) => (
                        <span key={phase} className="rounded-full bg-white px-2 py-1">
                          {phase}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate/10 bg-white p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                      Preflight
                    </p>
                    <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-lg bg-slate/5 px-3 py-2 text-[11px] text-slate">
                      {formatJson(agenticDraft.guardrail.preflight)}
                    </pre>
                  </div>

                  <div className="rounded-xl border border-slate/10 bg-white p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                      LLM config
                    </p>
                    <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded-lg bg-slate/5 px-3 py-2 text-[11px] text-slate">
                      {formatJson(agenticDraft.guardrail.llm_config)}
                    </pre>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                      Policies
                    </p>
                    <div className="space-y-2">
                      {agenticDraft.policies.map((policy) => (
                        <div
                          key={policy.policy_id}
                          className="rounded-xl border border-slate/10 bg-white px-3 py-2"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-semibold text-ink">{policy.name}</p>
                              <p className="text-[10px] text-slate">{policy.policy_id}</p>
                            </div>
                            <span className="text-[10px] font-semibold text-slate">
                              {policy.type}
                            </span>
                          </div>
                          <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded-lg bg-slate/5 px-3 py-2 text-[11px] text-slate">
                            {formatJson(policy.config)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate/10 bg-white p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                      Rationale
                    </p>
                    <p className="mt-2 text-xs text-slate">{agenticDraft.rationale}</p>
                  </div>

                  {agenticDraft.notes.length > 0 && (
                    <div className="rounded-xl border border-slate/10 bg-white p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                        Notes
                      </p>
                      <ul className="mt-2 space-y-1 text-xs text-slate">
                        {agenticDraft.notes.map((note) => (
                          <li key={note}>- {note}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <button
                    type="button"
                    className="w-full rounded-xl bg-ink px-4 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-ink/90 disabled:opacity-60"
                    onClick={handleAgenticApprove}
                    disabled={agenticApproving}
                  >
                    {agenticApproving ? "Publishing..." : "Approve and publish"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-6">
        {screen === "list" && (
          <section className="rounded-3xl border border-slate/10 bg-white p-8 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl font-bold text-ink">Active Guardrails</h3>
            <span className="text-xs text-slate">{loading ? "Loading..." : `${guardrails.length} total`}</span>
          </div>
          <div className="mt-6 grid gap-4">
            {loading ? (
              <div className="py-10 text-center text-sm text-slate/50">Loading guardrails...</div>
            ) : guardrails.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate/20 bg-slate/5 px-6 py-12 text-center">
                <p className="text-sm font-semibold text-ink">No active guardrails yet.</p>
                <p className="mt-2 text-sm text-slate">
                  Create your first guardrail to start protecting runtime traffic.
                </p>
                <button
                  type="button"
                  className="mt-6 rounded-xl bg-ink px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-ink/90"
                  onClick={openCreateScreen}
                >
                  Create New Guardrail
                </button>
              </div>
            ) : (
              guardrails.map((guardrail) => (
                <div
                  key={guardrail.guardrail_id}
                  className={`w-full rounded-2xl border px-5 py-4 shadow-sm transition ${
                    guardrail.guardrail_id === selectedGuardrailId
                      ? "border-accent/40 bg-accent/5"
                      : "border-slate/10 bg-white"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => openDetails(guardrail.guardrail_id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-ink">{guardrail.name}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-slate/50">
                          {guardrail.guardrail_id}
                        </p>
                      </div>
                      <span className="rounded-full bg-slate/10 px-3 py-1 text-[10px] font-bold text-slate">
                        {guardrail.mode}
                      </span>
                    </div>
                  </button>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-xs text-slate">
                      Current version: {guardrail.current_version}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded-xl border border-slate/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate hover:bg-slate/5"
                        onClick={() => void startExistingGuardrailVersion(guardrail.guardrail_id)}
                      >
                        Create version
                      </button>
                      <button
                        type="button"
                        className="text-[10px] font-bold uppercase tracking-[0.3em] text-accent"
                        onClick={() => openDetails(guardrail.guardrail_id)}
                      >
                        View details
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          </section>
        )}

        {screen === "create" && createOption && createOption !== "ai" && (
          <aside className="rounded-3xl border border-slate/10 bg-white p-8 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                {createOption === "template" ? "Use Template" : "Create Own"}
              </p>
              <h3 className="mt-2 text-lg font-bold text-ink">
                {createOption === "template" ? "Start from a UMAI template" : "Build from scratch"}
              </h3>
              <p className="mt-1 text-xs text-slate">
                {createOption === "template"
                  ? "Pick a template first, then review policies, pre-AI filters, and runtime settings."
                  : "Configure the guardrail basics, policies, pre-AI filters, and runtime settings manually."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-xl border border-slate/10 px-4 py-2 text-xs font-bold text-slate hover:bg-slate/5"
                onClick={() => setCreateOption(null)}
              >
                Change option
              </button>
              <div className="flex items-center gap-2 text-[11px] text-slate">
                Step {wizardDisplayStep} of {visibleWizardSteps.length}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate">
            {visibleWizardSteps.map((step) => (
              <span
                key={step.id}
                className={`rounded-full px-3 py-1 ${
                  wizardStep === step.id
                    ? "bg-accent text-white"
                    : wizardStep > step.id
                      ? "bg-accent/10 text-accent"
                      : "bg-slate/10 text-slate/60"
                }`}
              >
                {step.label}
              </span>
            ))}
          </div>

          {wizardError && (
            <div className="mt-4 rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-xs text-danger">
              {wizardError}
            </div>
          )}

          {wizardStep === 0 && createOption === "template" && (
            <div className="mt-6 space-y-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                  Start from a template
                </p>
                <p className="mt-2 text-xs text-slate">
                  Templates ship with policies, fast pre-AI filters, and LLM config already tuned.
                </p>
              </div>

              <div className="grid gap-4">
                {libraryLoading ? (
                  <div className="rounded-2xl border border-slate/10 bg-slate/5 px-4 py-6 text-center text-xs text-slate/60">
                    Loading guardrail templates...
                  </div>
                ) : libraryError ? (
                  <div className="rounded-2xl border border-slate/10 bg-slate/5 px-4 py-6 text-center text-xs text-slate/60">
                    {libraryError}
                  </div>
                ) : guardrailLibrary.length === 0 ? (
                  <div className="rounded-2xl border border-slate/10 bg-slate/5 px-4 py-6 text-center text-xs text-slate/60">
                    No guardrail templates are available yet.
                  </div>
                ) : (
                  guardrailLibrary.map((template) => {
                    const isDeploying = deployingTemplate === template.template_id;
                    return (
                      <div
                        key={template.template_id}
                        className="rounded-2xl border border-slate/10 bg-white px-5 py-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-ink">{template.name}</p>
                            <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-slate/50">
                              {template.default_guardrail_id}
                            </p>
                          </div>
                          <span className="rounded-full bg-slate/10 px-3 py-1 text-[10px] font-bold text-slate">
                            {template.mode}
                          </span>
                        </div>
                        {template.description && (
                          <p className="mt-3 text-xs text-slate">{template.description}</p>
                        )}
                        <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-semibold text-slate/70">
                          {template.phases.map((phase) => (
                            <span key={phase} className="rounded-full bg-slate/10 px-2 py-1">
                              {PHASE_LABELS[phase]}
                            </span>
                          ))}
                          {template.managed && (
                            <span className="rounded-full bg-slate/10 px-2 py-1">Managed</span>
                          )}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="flex-1 rounded-xl border border-slate/10 px-4 py-2 text-xs font-bold text-slate hover:bg-slate/5"
                            onClick={() => applyTemplateSettings(template)}
                          >
                            Use template
                          </button>
                          <button
                            type="button"
                            className="flex-1 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-accent/90"
                            disabled={isDeploying}
                            onClick={() => handleDeployGuardrail(template)}
                          >
                            {isDeploying ? "Deploying..." : "Deploy now"}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

            </div>
          )}

          {wizardStep === 1 && (
            <div className="mt-6 space-y-6">
              <div className="rounded-2xl border border-slate/10 bg-slate/5 p-4 space-y-4">
                <div className="flex flex-wrap gap-4 text-xs text-slate">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={wizardMode === "new"}
                      onChange={() => {
                        setWizardMode("new");
                        setGuardrailAgt(null);
                        setLoadingExistingConfig(false);
                        setExistingVersionBase(null);
                        setVersionOverride("");
                      }}
                    />
                    Create new guardrail
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={wizardMode === "existing"}
                      onChange={() => {
                        const nextGuardrailId =
                          wizardGuardrailId || selectedGuardrailId || guardrails[0]?.guardrail_id || "";
                        if (nextGuardrailId) {
                          void loadExistingGuardrailConfig(nextGuardrailId);
                        } else {
                          setWizardMode("existing");
                          setExistingVersionBase(null);
                        }
                      }}
                    />
                    Update existing guardrail
                  </label>
                </div>

                {wizardMode === "existing" ? (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                      Guardrail to update
                    </label>
                    <select
                      className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm"
                      value={wizardGuardrailId}
                      onChange={(event) => void loadExistingGuardrailConfig(event.target.value)}
                    >
                      <option value="">Select guardrail</option>
                      {guardrails.map((guardrail) => (
                        <option key={guardrail.guardrail_id} value={guardrail.guardrail_id}>
                          {guardrail.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-slate/60">
                      A new version will be created for the selected guardrail.
                    </p>
                    {loadingExistingConfig && (
                      <p className="text-[11px] text-accent">
                        Loading current guardrail settings...
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                        Guardrail ID
                      </label>
                      <input
                        className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm"
                        value={guardrailId}
                        onChange={(event) => setGuardrailId(event.target.value)}
                        placeholder="gr-main-chat"
                      />
                      <p className={`text-[11px] ${guardrailIdStatus.tone}`}>
                        {guardrailIdStatus.message}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                        Guardrail Name
                      </label>
                      <input
                        className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm"
                        value={guardrailName}
                        onChange={(event) => setGuardrailName(event.target.value)}
                        placeholder="Primary Chat Guardrail"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                        Mode
                      </label>
                      <select
                        className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm"
                        value={guardrailMode}
                        onChange={(event) =>
                          setGuardrailMode(event.target.value as Guardrail["mode"])
                        }
                      >
                        <option value="ENFORCE">ENFORCE (blocks)</option>
                        <option value="MONITOR">MONITOR (observe only)</option>
                      </select>
                      <p className="text-[11px] text-slate/60">
                        ENFORCE blocks traffic. MONITOR logs decisions without blocking.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="mt-6 space-y-6">
              {createOption !== "template" && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                    Quick-start presets
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {QUICK_STARTS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyQuickStart(preset.id)}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                          quickStartId === preset.id
                            ? "border-accent/40 bg-accent/5"
                            : "border-slate/10 bg-white"
                        }`}
                      >
                        <p className="text-sm font-semibold text-ink">{preset.label}</p>
                        <p className="mt-1 text-xs text-slate">{preset.description}</p>
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-slate/60">
                    Presets pick policies already in this project. You can still customize below.
                  </p>
                </div>
              )}

              <div className="rounded-2xl border border-slate/10 bg-slate/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                    Policies in scope
                  </p>
                  <span className="text-[11px] text-slate/60">
                    {policies.length} available
                  </span>
                </div>

                <input
                  className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm"
                  placeholder="Search policies by name or ID"
                  value={policySearch}
                  onChange={(event) => setPolicySearch(event.target.value)}
                />
                {createOption === "template" && (
                  <p className="text-[11px] text-slate/60">
                    Template policies are already selected. Add or remove policies only if you want
                    to customize this template.
                  </p>
                )}
                {requiredPolicyIds.length > 0 && (
                  <p className="text-[11px] text-slate/60">
                    Organization and environment policies are required and cannot be removed.
                  </p>
                )}

                {policies.length === 0 ? (
                  <div className="rounded-xl border border-slate/10 bg-white px-4 py-4 text-xs text-slate/60">
                    No policies available yet. Create policies first, then attach them here.
                  </div>
                ) : (
                  <div className="max-h-64 space-y-3 overflow-y-auto">
                    {filteredPolicies.map((policy) => {
                      const isRequired = requiredPolicyIdSet.has(policy.policy_id);
                      const isSelected = selectedPolicyIds.includes(policy.policy_id) || isRequired;
                      return (
                        <label
                          key={policy.policy_id}
                          className="flex items-start gap-3 rounded-xl border border-slate/10 bg-white px-3 py-3"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isRequired}
                            onChange={() => togglePolicy(policy.policy_id)}
                          />
                          <div>
                            <p className="text-sm font-semibold text-ink">{policy.name}</p>
                            <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-slate/50">
                              {policy.policy_id}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate">
                              <span className="rounded-full bg-slate/10 px-2 py-1">
                                {policy.type === "HEURISTIC"
                                  ? "Fast pattern check"
                                  : "AI-assisted decision"}
                              </span>
                              {policy.scope && (
                                <span className="rounded-full bg-slate/10 px-2 py-1">
                                  {policy.scope === "ORGANIZATION"
                                    ? "Organization"
                                    : policy.scope === "ENVIRONMENT"
                                      ? "Environment"
                                      : "Project"}
                                </span>
                              )}
                              {isRequired && (
                                <span className="rounded-full bg-accent/10 px-2 py-1 text-accent">
                                  Required
                                </span>
                              )}
                              {policy.phases.map((phase) => (
                                <span key={phase} className="rounded-full bg-slate/10 px-2 py-1">
                                  {PHASE_LABELS[phase]} ({phase})
                                </span>
                              ))}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}

                {missingPolicyIds.length > 0 && (
                  <div className="rounded-xl border border-accent/30 bg-accent/5 px-3 py-2 text-[11px] text-accent">
                    {selectedTemplate
                      ? `${missingPolicyIds.length} policies are missing locally and will be created from the selected template.`
                      : `${missingPolicyIds.length} policies are missing locally. Deploy them before continuing.`}
                  </div>
                )}
              </div>
            </div>
          )}

          {wizardStep === 3 && (
            <div className="mt-6 space-y-6">
              <div className="rounded-2xl border border-slate/10 bg-slate/5 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                    Pre-AI Request Filters
                  </p>
                  <span className="text-[11px] text-slate/60">Runs before the policy engine</span>
                </div>

                <div className="rounded-xl border border-slate/10 bg-white p-4">
                  <p className="text-xs font-semibold text-ink">
                    These are not the same as policies.
                  </p>
                  <p className="mt-2 text-[11px] text-slate">
                    Pre-AI filters are lightweight exact-match or regex blockers for obvious prompt
                    patterns. They run first and fail fast.
                  </p>
                  <p className="mt-2 text-[11px] text-slate">
                    Policies are the main guardrail rules attached to this guardrail. They can
                    evaluate richer logic before or after the AI call.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                      Filter target
                    </label>
                    <select
                      className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm"
                      value={preflightTarget}
                      onChange={(event) => setPreflightTarget(event.target.value as PreflightTarget)}
                    >
                      <option value="LAST_MESSAGE">Last user message</option>
                      <option value="FULL_HISTORY">Full conversation history</option>
                    </select>
                    <p className="text-[11px] text-slate/60">
                      Choose which request text is scanned before the normal policy checks run.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                      Scan length limit
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={20000}
                      step={500}
                      value={Number(preflightMaxLength) || 0}
                      onChange={(event) => setPreflightMaxLength(event.target.value)}
                    />
                    <div className="flex items-center justify-between text-[11px] text-slate/60">
                      <span>0</span>
                      <span>{preflightMaxLength || "0"} chars</span>
                      <span>20k</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                    Filter rule templates
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {PREFLIGHT_RULE_TEMPLATES.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        title={`${template.description} Example: ${template.example}`}
                        className="rounded-full border border-slate/10 bg-white px-3 py-1 text-[10px] font-semibold text-slate"
                        onClick={() => addPreflightTemplate(template.id)}
                      >
                        + {template.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  {preflightRules.map((rule, index) => (
                    <div
                      key={`preflight-rule-${index}`}
                      className="rounded-xl border border-slate/10 bg-white p-3 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-ink">Filter rule {index + 1}</p>
                        <button
                          type="button"
                          className="text-[10px] font-semibold text-danger"
                          onClick={() => removePreflightRule(index)}
                        >
                          Remove
                        </button>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                            Rule ID
                          </label>
                          <input
                            className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm"
                            value={rule.id}
                            onChange={(event) => updatePreflightRule(index, "id", event.target.value)}
                            placeholder="preflight-ignore-instructions"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                            Match mode
                          </label>
                          <select
                            className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm"
                            value={rule.mode}
                            onChange={(event) =>
                              updatePreflightRule(index, "mode", event.target.value as PreflightRule["mode"])
                            }
                          >
                            <option value="REGEX">REGEX</option>
                            <option value="EXACT">EXACT</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                          Pattern
                        </label>
                        <input
                          className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm"
                          value={rule.pattern}
                          onChange={(event) => updatePreflightRule(index, "pattern", event.target.value)}
                          placeholder="ignore previous instructions"
                        />
                      </div>

                      <label className="flex items-center gap-2 text-xs text-slate">
                        <input
                          type="checkbox"
                          checked={rule.block_on_match}
                          onChange={(event) => updatePreflightRule(index, "block_on_match", event.target.checked)}
                        />
                        Block when this rule matches
                      </label>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="w-full rounded-xl border border-slate/10 px-4 py-2 text-xs font-bold text-slate hover:bg-slate/5"
                  onClick={addPreflightRule}
                >
                  + Add Filter Rule
                </button>

                <div className="rounded-xl border border-slate/10 bg-white p-3">
                  <button
                    type="button"
                    className="text-xs font-semibold text-slate"
                    onClick={() => {
                      setPreflightAdvanced((current) => !current);
                      setPreflightJsonTouched(false);
                    }}
                  >
                    {preflightAdvanced ? "Hide advanced filter JSON" : "Show advanced filter JSON"}
                  </button>

                  {preflightAdvanced && (
                    <div className="mt-3 space-y-2">
                      <textarea
                        className="h-40 w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-xs font-mono"
                        value={preflightJsonText}
                        onChange={(event) => {
                          setPreflightJsonText(event.target.value);
                          setPreflightJsonTouched(true);
                        }}
                      />
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-slate"
                        onClick={() => {
                          setPreflightJsonText(JSON.stringify(preflightPreview, null, 2));
                          setPreflightJsonTouched(false);
                        }}
                      >
                        Reset JSON from builder
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {wizardStep === 4 && (
            <div className="mt-6 space-y-6">
              <div className="rounded-2xl border border-slate/10 bg-slate/5 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                    LLM provider
                  </p>
                  <span className="text-[11px] text-slate/60">
                    Used by context-aware policies
                  </span>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                    Preset
                  </label>
                  <select
                    className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm"
                    value={llmPresetId}
                    onChange={(event) => applyLlmPreset(event.target.value)}
                  >
                    {LLM_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate/60">
                    {LLM_PRESETS.find((preset) => preset.id === llmPresetId)?.description}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                      Provider ID
                    </label>
                    <input
                      className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm"
                      value={llmProvider}
                      onChange={(event) => setLlmProvider(event.target.value)}
                      placeholder="OSS_ROUTER"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                      Model
                    </label>
                    <input
                      className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm"
                      value={llmModel}
                      onChange={(event) => setLlmModel(event.target.value)}
                      placeholder="gpt-4o-mini"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                    Base URL
                  </label>
                  <input
                    className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm"
                    value={llmBaseUrl}
                    onChange={(event) => setLlmBaseUrl(event.target.value)}
                    placeholder="https://api.openai.com/v1"
                  />
                  <p className="text-[11px] text-slate/60">
                    Must be OpenAI-compatible. Choose whether the endpoint uses no auth,
                    bearer auth, or a custom header.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                      Timeout (ms)
                    </label>
                    <input
                      type="number"
                      className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm"
                      value={llmTimeout}
                      onChange={(event) => setLlmTimeout(event.target.value)}
                      min={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                      Auth type
                    </label>
                    <select
                      className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm"
                      value={llmAuthType}
                      onChange={(event) =>
                        setLlmAuthType(event.target.value as "none" | "bearer" | "header")
                      }
                    >
                      <option value="none">None</option>
                      <option value="bearer">Bearer</option>
                      <option value="header">Custom header</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                      Secret env
                    </label>
                    <input
                      className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm"
                      value={llmAuthSecretEnv}
                      onChange={(event) => setLlmAuthSecretEnv(event.target.value)}
                      placeholder={llmAuthType === "none" ? "Not required" : "LLM_API_KEY"}
                      disabled={llmAuthType === "none"}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                      Header name
                    </label>
                    <input
                      className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm"
                      value={llmAuthHeaderName}
                      onChange={(event) => setLlmAuthHeaderName(event.target.value)}
                      placeholder={llmAuthType === "header" ? "api-key" : "Only for custom header auth"}
                      disabled={llmAuthType !== "header"}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-slate/10 bg-white p-3">
                  <button
                    type="button"
                    className="text-xs font-semibold text-slate"
                    onClick={() => {
                      setLlmAdvanced((current) => !current);
                      setLlmJsonTouched(false);
                    }}
                  >
                    {llmAdvanced ? "Hide advanced JSON" : "Show advanced JSON"}
                  </button>

                  {llmAdvanced && (
                    <div className="mt-3 space-y-2">
                      <textarea
                        className="h-36 w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-xs font-mono"
                        value={llmJsonText}
                        onChange={(event) => {
                          setLlmJsonText(event.target.value);
                          setLlmJsonTouched(true);
                        }}
                      />
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-slate"
                        onClick={() => {
                          setLlmJsonText(JSON.stringify(llmPreview, null, 2));
                          setLlmJsonTouched(false);
                        }}
                      >
                        Reset JSON from builder
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {wizardStep === 5 && (
            <div className="mt-6 space-y-6">
              <div className="rounded-2xl border border-slate/10 bg-slate/5 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                    Review summary
                  </p>
                  <span className="text-[11px] text-slate/60">Version {resolvedVersion}</span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                      Guardrail
                    </p>
                    <p className="mt-2 text-sm font-semibold text-ink">
                      {wizardMode === "new"
                        ? guardrailNameTrimmed || "Not set"
                        : selectedWizardGuardrail?.name || "Not set"}
                    </p>
                    <p className="mt-1 text-xs text-slate">
                      {wizardMode === "new"
                        ? guardrailIdTrimmed || "Not set"
                        : wizardGuardrailId || "Not set"}
                    </p>
                    <p className="mt-2 text-xs text-slate">
                      Mode: {wizardMode === "new" ? guardrailMode : selectedWizardGuardrail?.mode}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                      Policies
                    </p>
                    <p className="mt-2 text-sm font-semibold text-ink">
                      {selectedPolicyIds.length} selected
                    </p>
                    <p className="mt-1 text-xs text-slate">
                      {phaseSummaryText}
                    </p>
                    {missingPolicyIds.length > 0 && (
                      <p className="mt-2 text-xs text-accent">
                        {selectedTemplate
                          ? `${missingPolicyIds.length} policies will be created from the template.`
                          : `${missingPolicyIds.length} policies are missing and must be deployed.`}
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate/10 bg-white p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                    What this will do
                  </p>
                  <p className="mt-2 text-xs text-slate">
                    This guardrail first applies fast request filters to the{" "}
                    {preflightTarget === "LAST_MESSAGE" ? "last user message" : "full history"} and
                    then runs {selectedPolicyIds.length} attached policies.
                    {createOption === "template" && selectedTemplate?.agt?.enabled
                      ? " It also enables AGT action governance for the managed action phases."
                      : ""}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate/10 bg-white p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                      Pre-AI filter preview
                    </p>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-slate/5 px-3 py-2 text-[11px] text-slate">
                      {formatJson(preflightPreview)}
                    </pre>
                  </div>
                  <div className="rounded-xl border border-slate/10 bg-white p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                      Policy names
                    </p>
                    {reviewPolicies.length === 0 ? (
                      <p className="mt-2 text-xs text-slate">No policies selected.</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {reviewPolicies.map((policy) => (
                          <div
                            key={policy.policy_id}
                            className="rounded-lg bg-slate/5 px-3 py-2 text-[11px] text-slate"
                          >
                            <p className="font-semibold text-ink">{policy.name}</p>
                            <p className="mt-1">{policy.policy_id}</p>
                            <p className="mt-1">
                              {policy.phases.map((phase) => PHASE_LABELS[phase]).join(" | ")}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                    Version override (optional)
                  </label>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm"
                    value={versionOverride}
                    onChange={(event) => setVersionOverride(event.target.value)}
                    min={1}
                    placeholder={nextVersion.toString()}
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-slate">
                  <input
                    type="checkbox"
                    checked={publishNow}
                    disabled={wizardMode === "new"}
                    onChange={(event) => setPublishNow(event.target.checked)}
                  />
                  Publish immediately (updates current version)
                </label>
                {wizardMode === "new" && (
                  <p className="text-[11px] text-slate/60">
                    First versions auto-publish when created.
                  </p>
                )}
                {wizardMode === "existing" && (
                  <p className="text-[11px] text-slate/60">
                    Existing guardrails now load from the current snapshot. If you publish here,
                    the new version is approved with your current operator identity.
                  </p>
                )}
              </div>
            </div>
          )}

          {wizardStep > 0 && wizardStep < WIZARD_STEPS.length - 1 && (
            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                className="rounded-xl border border-slate/10 px-4 py-2 text-xs font-bold text-slate hover:bg-slate/5"
                onClick={handleBack}
              >
                Back
              </button>
              <button
                type="button"
                className="rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-accent/90"
                onClick={handleNext}
              >
                Next
              </button>
            </div>
          )}

          {wizardStep === WIZARD_STEPS.length - 1 && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                className="rounded-xl border border-slate/10 px-4 py-2 text-xs font-bold text-slate hover:bg-slate/5"
                onClick={handleBack}
              >
                Back
              </button>
              <button
                type="button"
                className="rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-accent/90"
                disabled={submitting}
                onClick={handleWizardSubmit}
              >
                {submitting ? "Saving..." : publishNow ? "Create & publish" : "Create version"}
              </button>
            </div>
          )}
          </aside>
        )}
      </div>

      {toastItems.length > 0 && (
        <div className="pointer-events-none fixed bottom-4 left-4 right-4 z-[70] flex flex-col gap-3 sm:bottom-6 sm:left-auto sm:right-6 sm:w-full sm:max-w-sm">
          {toastItems.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto rounded-2xl border px-4 py-3 backdrop-blur ${TOAST_STYLES[toast.tone]}`}
              role={toast.tone === "error" ? "alert" : "status"}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/80">
                    {TOAST_LABELS[toast.tone]}
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-5 text-white">
                    {toast.message}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-full px-2 py-1 text-xs font-bold text-white/80 transition hover:bg-white/10 hover:text-white"
                  onClick={() => dismissToast(toast.id)}
                  aria-label="Dismiss notification"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {detailsOpen && selectedGuardrail ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(247,244,239,0.78)] px-4 py-6 backdrop-blur-sm"
          onClick={closeDetails}
        >
          <div
            className="flex h-[min(88vh,860px)] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-slate/10 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.10)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Guardrail details"
          >
            <div className="border-b border-slate/10 px-8 pb-5 pt-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                    Guardrail Details
                  </p>
                  <h3 className="mt-2 font-display text-2xl font-bold text-ink">
                    {selectedGuardrail.name}
                  </h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate">
                    <span>{selectedGuardrail.guardrail_id}</span>
                    <span className="rounded-full bg-slate/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate">
                      {selectedGuardrail.mode}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                <div className="inline-flex rounded-full border border-slate/10 bg-slate/5 p-1">
                  <button
                    type="button"
                    className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                      detailsTab === "overview"
                        ? "bg-white text-ink shadow-sm"
                        : "text-slate hover:text-ink"
                    }`}
                    onClick={() => setDetailsTab("overview")}
                  >
                    Overview
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                      detailsTab === "policies"
                        ? "bg-white text-ink shadow-sm"
                        : "text-slate hover:text-ink"
                    }`}
                    onClick={() => setDetailsTab("policies")}
                  >
                    Policies
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {detailsTab === "policies" && filteredDetailsPolicies.length > 0 ? (
                    <div className="flex items-center gap-2 text-xs text-slate">
                      <span>
                        {safeDetailsPolicyIndex + 1} of {filteredDetailsPolicies.length}
                      </span>
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate/10 text-slate transition hover:bg-slate/5 disabled:opacity-40"
                        onClick={() =>
                          setDetailsPolicyIndex((current) =>
                            filteredDetailsPolicies.length === 0
                              ? 0
                              : current === 0
                                ? filteredDetailsPolicies.length - 1
                                : current - 1
                          )
                        }
                        disabled={filteredDetailsPolicies.length <= 1}
                        aria-label="Previous policy"
                      >
                        <svg
                          viewBox="0 0 20 20"
                          fill="none"
                          className="h-4 w-4"
                          aria-hidden="true"
                        >
                          <path
                            d="M11.75 4.5 6.25 10l5.5 5.5"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate/10 text-slate transition hover:bg-slate/5 disabled:opacity-40"
                        onClick={() =>
                          setDetailsPolicyIndex((current) =>
                            filteredDetailsPolicies.length === 0
                              ? 0
                              : current >= filteredDetailsPolicies.length - 1
                                ? 0
                                : current + 1
                          )
                        }
                        disabled={filteredDetailsPolicies.length <= 1}
                        aria-label="Next policy"
                      >
                        <svg
                          viewBox="0 0 20 20"
                          fill="none"
                          className="h-4 w-4"
                          aria-hidden="true"
                        >
                          <path
                            d="m8.25 4.5 5.5 5.5-5.5 5.5"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className="rounded-full border border-slate/10 bg-white px-4 py-2 text-xs font-semibold text-ink shadow-sm transition hover:bg-slate/5"
                    onClick={closeDetails}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-8 pb-8 pt-6">
              {snapshotError && (
                <div className="mb-4 rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-xs text-danger">
                  {snapshotError}
                </div>
              )}

              {snapshotLoading ? (
                <div className="flex h-full items-center justify-center text-sm text-slate/50">
                  Loading snapshot details...
                </div>
              ) : snapshot ? (
                detailsTab === "overview" ? (
                  <div className="grid h-full gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                    <div className="min-h-0 space-y-6 overflow-y-auto pr-1">
                      <div className="rounded-[28px] border border-slate/10 bg-[linear-gradient(135deg,_#ffffff_0%,_#f9f7f1_100%)] p-5">
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/50">
                              Current Version
                            </p>
                            <p className="mt-2 text-lg font-semibold text-ink">
                              v{selectedGuardrail.current_version}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/50">
                              Snapshot Version
                            </p>
                            <select
                              className="mt-2 w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-sm text-ink"
                              value={detailsVersion ?? ""}
                              onChange={(event) =>
                                setDetailsVersion(
                                  event.target.value ? Number(event.target.value) : null
                                )
                              }
                              disabled={guardrailVersions.length === 0}
                            >
                              <option value="">Select version</option>
                              {guardrailVersions.map((item) => (
                                <option key={item.version} value={item.version}>
                                  v{item.version}
                                  {item.version === selectedGuardrail.current_version
                                    ? " (current)"
                                    : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/50">
                              Redis Snapshot
                            </p>
                            <p className="mt-2 text-sm font-semibold text-ink">
                              {snapshot.redis_available
                                ? snapshot.redis_present
                                  ? "Published"
                                  : "Not published"
                                : "Unavailable"}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/50">
                              Attached Policies
                            </p>
                            <p className="mt-2 text-sm font-semibold text-ink">
                              {snapshot.snapshot.policies.length}
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 flex flex-wrap items-center gap-3">
                          {detailsVersion &&
                          (detailsVersion !== selectedGuardrail.current_version ||
                            !snapshot.redis_present) ? (
                            <button
                              type="button"
                              className="rounded-xl bg-ink px-4 py-2 text-[11px] font-bold text-white shadow-sm transition hover:bg-ink/90 disabled:opacity-60"
                              onClick={handlePublishSelectedVersion}
                              disabled={snapshotLoading || publishingDetailsVersion}
                            >
                              {publishingDetailsVersion
                                ? "Publishing..."
                                : detailsVersion === selectedGuardrail.current_version
                                  ? `Publish v${detailsVersion}`
                                  : `Promote v${detailsVersion} to current`}
                            </button>
                          ) : null}
                          {detailsVersion === selectedGuardrail.current_version &&
                          snapshot.redis_present ? (
                            <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">
                              Live version
                            </span>
                          ) : null}
                          {snapshot.redis_key ? (
                            <span className="text-[11px] text-slate/60">
                              Redis key: {snapshot.redis_key}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-3xl border border-slate/10 bg-slate/5 p-5">
                          <p className="text-xs font-semibold text-ink">Preflight</p>
                          <pre className="mt-3 max-h-[260px] overflow-auto whitespace-pre-wrap rounded-2xl bg-white px-4 py-3 text-[11px] text-slate">
                            {formatJson(snapshot.snapshot.preflight)}
                          </pre>
                        </div>

                        <div className="rounded-3xl border border-slate/10 bg-slate/5 p-5">
                          <p className="text-xs font-semibold text-ink">LLM Config</p>
                          <pre className="mt-3 max-h-[260px] overflow-auto whitespace-pre-wrap rounded-2xl bg-white px-4 py-3 text-[11px] text-slate">
                            {formatJson(snapshot.snapshot.llm_config)}
                          </pre>
                        </div>

                        {snapshot.snapshot.agt ? (
                          <div className="rounded-3xl border border-slate/10 bg-slate/5 p-5 lg:col-span-2">
                            <p className="text-xs font-semibold text-ink">AGT Action Governance</p>
                            <pre className="mt-3 max-h-[240px] overflow-auto whitespace-pre-wrap rounded-2xl bg-white px-4 py-3 text-[11px] text-slate">
                              {formatJson(snapshot.snapshot.agt)}
                            </pre>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <aside className="min-h-0 rounded-[28px] border border-slate/10 bg-slate/5 p-5">
                      <div className="flex h-full flex-col">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/50">
                            Snapshot Overview
                          </p>
                          <p className="mt-2 text-lg font-semibold text-ink">
                            v{snapshot.version} configuration
                          </p>
                          <p className="mt-1 text-sm text-slate">
                            Review phases and jump straight into the policy viewer when needed.
                          </p>
                        </div>

                        <div className="mt-5">
                          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/50">
                            Active Phases
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold text-slate">
                            {snapshot.snapshot.phases?.length ? (
                              snapshot.snapshot.phases.map((phase) => (
                                <span
                                  key={phase}
                                  className="rounded-full bg-white px-3 py-1 uppercase tracking-[0.2em]"
                                >
                                  {PHASE_LABELS[phase]}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate/60">No phases configured.</span>
                            )}
                          </div>
                        </div>

                        <div className="mt-5 min-h-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/50">
                              Policies In This Version
                            </p>
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-accent transition hover:text-ink"
                              onClick={() => setDetailsTab("policies")}
                            >
                              Open policy view
                            </button>
                          </div>
                          <div className="mt-3 space-y-2 overflow-y-auto pr-1">
                            {snapshot.snapshot.policies.length === 0 ? (
                              <div className="rounded-2xl border border-dashed border-slate/15 bg-white px-4 py-6 text-center text-xs text-slate/60">
                                No policies are attached to this version.
                              </div>
                            ) : (
                              snapshot.snapshot.policies.map((policy, index) => (
                                <button
                                  key={policy.id}
                                  type="button"
                                  className="w-full rounded-2xl border border-transparent bg-white px-4 py-3 text-left transition hover:border-slate/10 hover:bg-slate/5"
                                  onClick={() => {
                                    setDetailsPolicyPhase("ALL");
                                    setDetailsPolicyIndex(index);
                                    setDetailsTab("policies");
                                  }}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold text-ink">
                                        {policy.name}
                                      </p>
                                      <p className="mt-1 truncate text-[10px] uppercase tracking-[0.25em] text-slate/50">
                                        {policy.id}
                                      </p>
                                    </div>
                                    <span className="rounded-full bg-slate/10 px-2 py-1 text-[10px] font-bold text-slate">
                                      {policy.type}
                                    </span>
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </aside>
                  </div>
                ) : (
                  <div className="flex h-full flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className={`rounded-full px-3 py-2 text-[11px] font-semibold transition ${
                          detailsPolicyPhase === "ALL"
                            ? "bg-ink text-white"
                            : "border border-slate/10 bg-white text-slate hover:bg-slate/5"
                        }`}
                        onClick={() => setDetailsPolicyPhase("ALL")}
                      >
                        All policies
                      </button>
                      {availableDetailsPolicyPhases.map((phase) => (
                        <button
                          key={phase}
                          type="button"
                          className={`rounded-full px-3 py-2 text-[11px] font-semibold transition ${
                            detailsPolicyPhase === phase
                              ? "bg-ink text-white"
                              : "border border-slate/10 bg-white text-slate hover:bg-slate/5"
                          }`}
                          onClick={() => setDetailsPolicyPhase(phase)}
                        >
                          {PHASE_LABELS[phase]}
                        </button>
                      ))}
                    </div>

                    {filteredDetailsPolicies.length === 0 ? (
                      <div className="flex flex-1 items-center justify-center rounded-[28px] border border-dashed border-slate/15 bg-slate/5 px-6 text-sm text-slate/60">
                        No policies match the selected phase.
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                          <button
                            type="button"
                            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate/10 bg-white text-slate transition hover:bg-slate/5 disabled:opacity-40"
                            onClick={() =>
                              setDetailsPolicyIndex((current) =>
                                current === 0
                                  ? filteredDetailsPolicies.length - 1
                                  : current - 1
                              )
                            }
                            disabled={filteredDetailsPolicies.length <= 1}
                            aria-label="Previous policy tab"
                          >
                            <svg
                              viewBox="0 0 20 20"
                              fill="none"
                              className="h-4 w-4"
                              aria-hidden="true"
                            >
                              <path
                                d="M11.75 4.5 6.25 10l5.5 5.5"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>

                          <div className="overflow-hidden">
                            <div
                              className="flex gap-3 transition-transform duration-300 ease-out"
                              style={{
                                transform: `translateX(-${detailsPolicyTabOffset}px)`,
                              }}
                            >
                              {filteredDetailsPolicies.map((policy, index) => (
                                <button
                                  key={policy.id}
                                  type="button"
                                  className={`w-[212px] shrink-0 rounded-[22px] border px-4 py-3 text-left transition ${
                                    index === safeDetailsPolicyIndex
                                      ? "border-ink bg-ink text-white shadow-sm"
                                      : "border-slate/10 bg-white text-ink hover:border-slate/20 hover:bg-slate/5"
                                  }`}
                                  onClick={() => setDetailsPolicyIndex(index)}
                                >
                                  <p className="truncate text-sm font-semibold">{policy.name}</p>
                                  <p
                                    className={`mt-1 truncate text-[10px] uppercase tracking-[0.2em] ${
                                      index === safeDetailsPolicyIndex
                                        ? "text-white/70"
                                        : "text-slate/50"
                                    }`}
                                  >
                                    {policy.id}
                                  </p>
                                </button>
                              ))}
                            </div>
                          </div>

                          <button
                            type="button"
                            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate/10 bg-white text-slate transition hover:bg-slate/5 disabled:opacity-40"
                            onClick={() =>
                              setDetailsPolicyIndex((current) =>
                                current >= filteredDetailsPolicies.length - 1
                                  ? 0
                                  : current + 1
                              )
                            }
                            disabled={filteredDetailsPolicies.length <= 1}
                            aria-label="Next policy tab"
                          >
                            <svg
                              viewBox="0 0 20 20"
                              fill="none"
                              className="h-4 w-4"
                              aria-hidden="true"
                            >
                              <path
                                d="m8.25 4.5 5.5 5.5-5.5 5.5"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        </div>

                        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
                          <div className="flex min-h-0 h-full flex-col rounded-[28px] border border-slate/10 bg-white p-5">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div className="min-w-0">
                                <p className="text-lg font-semibold text-ink">
                                  {activeDetailsPolicy?.name}
                                </p>
                                <p className="mt-1 break-all text-[10px] uppercase tracking-[0.3em] text-slate/50">
                                  {activeDetailsPolicy?.id}
                                </p>
                              </div>
                              <span className="rounded-full bg-slate/10 px-3 py-1 text-[10px] font-bold text-slate">
                                {activeDetailsPolicy?.type}
                              </span>
                            </div>

                            <pre className="mt-4 min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-2xl bg-slate/5 px-4 py-3 text-[11px] text-slate">
                              {formatJson(activeDetailsPolicy?.config)}
                            </pre>
                          </div>

                          <aside className="rounded-[28px] border border-slate/10 bg-slate/5 p-5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/50">
                              Policy Summary
                            </p>
                            <p className="mt-2 text-sm text-slate">
                              Use the arrows to move through policies without scrolling the whole dialog.
                            </p>

                            <div className="mt-5 space-y-4 text-sm text-slate">
                              <div className="rounded-2xl bg-white px-4 py-3">
                                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate/50">
                                  Status
                                </p>
                                <p className="mt-2 font-semibold text-ink">
                                  {activeDetailsPolicy?.enabled ? "Enabled" : "Disabled"}
                                </p>
                              </div>

                              <div className="rounded-2xl bg-white px-4 py-3">
                                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate/50">
                                  Phases
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold text-slate">
                                  {activeDetailsPolicy?.phases?.map((phase) => (
                                    <span
                                      key={`${activeDetailsPolicy?.id ?? "policy"}-${phase}`}
                                      className="rounded-full bg-slate/10 px-3 py-1"
                                    >
                                      {PHASE_LABELS[phase]}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              <div className="rounded-2xl bg-white px-4 py-3">
                                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate/50">
                                  Position
                                </p>
                                <p className="mt-2 font-semibold text-ink">
                                  {safeDetailsPolicyIndex + 1} / {filteredDetailsPolicies.length}
                                </p>
                              </div>
                            </div>
                          </aside>
                        </div>
                      </>
                    )}
                  </div>
                )
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate/50">
                  No snapshot loaded yet.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
