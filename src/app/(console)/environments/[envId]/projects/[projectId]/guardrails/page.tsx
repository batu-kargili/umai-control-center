"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Check, Copy } from "lucide-react";
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

type GuardrailScreen = "list" | "create" | "edit";

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

// Fluent/Carbon tarzı düz butonlar: 4 px köşe, gölgesiz, mavi yalnızca primary.
const BTN_PRIMARY =
  "inline-flex h-8 items-center justify-center rounded bg-secondary px-3 text-sm font-medium text-white transition hover:bg-secondary/90 disabled:cursor-not-allowed disabled:opacity-60";
const BTN_SECONDARY =
  "inline-flex h-8 items-center justify-center rounded border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60";
const TAG = "inline-flex rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700";

const TOAST_LABELS: Record<ToastTone, string> = {
  success: "Success",
  error: "Error",
  info: "Info",
};

const TOAST_STYLES: Record<ToastTone, string> = {
  success: "border-emerald-700 bg-emerald-600 text-white",
  error: "border-red-700 bg-danger text-white",
  info: "border-secondary bg-secondary text-white",
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
  const [copiedId, setCopiedId] = useState<string | null>(null);
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
        // Mevcut guardrail'e yeni sürüm: kimlik zaten belli, Start ve Basics atlanır.
        if (screen === "edit" && step.id <= 1) {
          return false;
        }
        if (createOption === "custom" && step.id === 0) {
          return false;
        }
        if (createOption === "template" && step.id === 4) {
          return false;
        }
        return true;
      }),
    [createOption, screen]
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
      return { tone: "text-gray-500", message: "Required." };
    }
    if (!guardrailIdPattern.test(guardrailIdTrimmed)) {
      return { tone: "text-danger", message: "Use lowercase letters, numbers, and dashes." };
    }
    if (guardrailIdExists) {
      return { tone: "text-danger", message: "This ID already exists." };
    }
    return { tone: "text-emerald-700", message: "ID is available." };
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

  const copyGuardrailId = async (guardrailId: string) => {
    try {
      await navigator.clipboard.writeText(guardrailId);
      setCopiedId(guardrailId);
      window.setTimeout(
        () => setCopiedId((current) => (current === guardrailId ? null : current)),
        1500
      );
    } catch {
      pushToast("error", "Could not copy to clipboard.");
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
    setScreen("edit");
    setCreateOption("custom");
    setWizardMode("existing");
    setWizardGuardrailId(guardrailId);
    setWizardStep(2);
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
    if (screen === "edit" && visibleWizardStepIds.indexOf(wizardStep) <= 0) {
      closeCreateScreen();
      return;
    }
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
    <div className="space-y-8">
      <header className="flex flex-col gap-4 border-b border-gray-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        {screen === "edit" && selectedWizardGuardrail ? (
          <div>
            <p className="text-xs font-medium text-gray-500">Guardrail</p>
            <h1 className="mt-0.5 text-2xl font-semibold text-gray-900">
              {selectedWizardGuardrail.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <span className="font-mono text-xs">{selectedWizardGuardrail.guardrail_id}</span>
              <span className={TAG}>{selectedWizardGuardrail.mode}</span>
              <span>Current version v{selectedWizardGuardrail.current_version}</span>
            </div>
          </div>
        ) : (
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Guardrails</h1>
            <p className="mt-1 text-sm text-gray-500">
              {loading
                ? "Loading…"
                : `${guardrails.length} ${guardrails.length === 1 ? "guardrail" : "guardrails"}`}
              {" · "}
              {projectId}
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {screen === "list" ? (
            <button type="button" className={BTN_PRIMARY} onClick={openCreateScreen}>
              Create guardrail
            </button>
          ) : (
            <button type="button" className={BTN_SECONDARY} onClick={closeCreateScreen}>
              Back to guardrails
            </button>
          )}
        </div>
      </header>

      {screen === "create" && (
        <section className="rounded border border-gray-200 bg-white p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Create guardrail</h2>
              <p className="mt-1 text-sm text-gray-500">Choose how to start.</p>
            </div>
            {createOption && (
              <button
                type="button"
                className={BTN_SECONDARY}
                onClick={() => setCreateOption(null)}
              >
                Back to options
              </button>
            )}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            {CREATE_OPTIONS.map((option) => {
              const active = createOption === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => selectCreateOption(option.id)}
                  aria-pressed={active}
                  className={`rounded border p-5 text-left transition ${
                    active
                      ? "border-secondary bg-secondary/5"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">{option.label}</p>
                  <p className="mt-1 text-sm text-gray-500">{option.description}</p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {screen === "create" && createOption === "ai" && (
        <section
          id="agentic-builder"
          className="rounded border border-gray-200 bg-white p-6 space-y-6"
        >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Describe the guardrail you need
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Answer a short questionnaire and UMAI will draft policies and a deployable
              guardrail for approval.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500">
                  1. Describe your agent functionality
                </label>
                <textarea
                  className="h-28 w-full rounded border border-gray-200 bg-white px-3 py-3 text-sm"
                  value={agenticDescription}
                  onChange={(event) => setAgenticDescription(event.target.value)}
                  placeholder="Paste the prompt or describe the workflow."
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-500">
                    2. What is this agent for
                  </label>
                  <input
                    list="agentic-agent-types"
                    className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
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
                  <label className="text-xs font-medium text-gray-500">
                    3. Target audience
                  </label>
                  <input
                    className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                    value={agenticAudience}
                    onChange={(event) => setAgenticAudience(event.target.value)}
                    placeholder="Internal users, enterprise customers, students..."
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-500">
                    4. Available countries
                  </label>
                  <input
                    className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                    value={agenticCountries}
                    onChange={(event) => setAgenticCountries(event.target.value)}
                    placeholder="US, UK, DE (comma separated)"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-500">
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
                          className={`rounded border px-3 py-1 text-xs font-semibold transition ${
                            active
                              ? "border-ink/10 bg-secondary text-white"
                              : "border-gray-200 bg-white text-gray-600"
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
                className="inline-flex items-center justify-center rounded bg-secondary px-4 py-3 text-sm font-medium text-white transition hover:bg-secondary/90 disabled:opacity-60"
                onClick={handleAgenticGenerate}
                disabled={agenticLoading}
              >
                {agenticLoading ? "Generating..." : "Generate guardrail draft"}
              </button>
            </div>

            <div className="rounded border border-gray-200 bg-gray-50 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500">
                  Draft review
                </p>
                {agenticDraft && (
                  <span className="text-xs font-medium text-gray-600">
                    {agenticDraft.policies.length} policies
                  </span>
                )}
              </div>

              {!agenticDraft ? (
                <p className="text-sm text-gray-600">
                  No draft yet. Generate to preview the recommended guardrail.
                </p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-900">{agenticDraft.guardrail.name}</p>
                    <p className="text-xs text-gray-600">{agenticDraft.guardrail.guardrail_id}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                      <span className="rounded bg-white px-2 py-1">
                        {agenticDraft.guardrail.mode}
                      </span>
                      {agenticDraft.guardrail.phases.map((phase) => (
                        <span key={phase} className="rounded bg-white px-2 py-1">
                          {phase}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="rounded border border-gray-200 bg-white p-3">
                    <p className="text-xs font-medium text-gray-500">
                      Preflight
                    </p>
                    <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-gray-50 px-3 py-2 text-xs text-gray-600">
                      {formatJson(agenticDraft.guardrail.preflight)}
                    </pre>
                  </div>

                  <div className="rounded border border-gray-200 bg-white p-3">
                    <p className="text-xs font-medium text-gray-500">
                      LLM config
                    </p>
                    <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-gray-50 px-3 py-2 text-xs text-gray-600">
                      {formatJson(agenticDraft.guardrail.llm_config)}
                    </pre>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-500">
                      Policies
                    </p>
                    <div className="space-y-2">
                      {agenticDraft.policies.map((policy) => (
                        <div
                          key={policy.policy_id}
                          className="rounded border border-gray-200 bg-white px-3 py-2"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-semibold text-gray-900">{policy.name}</p>
                              <p className="text-xs text-gray-600">{policy.policy_id}</p>
                            </div>
                            <span className="text-xs font-medium text-gray-600">
                              {policy.type}
                            </span>
                          </div>
                          <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-gray-50 px-3 py-2 text-xs text-gray-600">
                            {formatJson(policy.config)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded border border-gray-200 bg-white p-3">
                    <p className="text-xs font-medium text-gray-500">
                      Rationale
                    </p>
                    <p className="mt-2 text-xs text-gray-600">{agenticDraft.rationale}</p>
                  </div>

                  {agenticDraft.notes.length > 0 && (
                    <div className="rounded border border-gray-200 bg-white p-3">
                      <p className="text-xs font-medium text-gray-500">
                        Notes
                      </p>
                      <ul className="mt-2 space-y-1 text-xs text-gray-600">
                        {agenticDraft.notes.map((note) => (
                          <li key={note}>- {note}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <button
                    type="button"
                    className="w-full rounded bg-secondary px-4 py-3 text-sm font-medium text-white transition hover:bg-secondary/90 disabled:opacity-60"
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
          <section className="overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Mode</th>
                  <th className="px-4 py-2.5 text-right font-medium">Current version</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                      Loading guardrails…
                    </td>
                  </tr>
                ) : guardrails.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-gray-500">
                      No guardrails yet.{" "}
                      <button
                        type="button"
                        className="font-medium text-secondary hover:underline"
                        onClick={openCreateScreen}
                      >
                        Create the first one
                      </button>
                      .
                    </td>
                  </tr>
                ) : (
                  guardrails.map((guardrail) => (
                    <tr
                      key={guardrail.guardrail_id}
                      onClick={() => openDetails(guardrail.guardrail_id)}
                      className="cursor-pointer transition-colors hover:bg-gray-50"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{guardrail.name}</p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className="font-mono text-xs text-gray-500">{guardrail.guardrail_id}</span>
                          <button
                            type="button"
                            className="rounded p-0.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                            title="Copy ID"
                            aria-label={`Copy ${guardrail.guardrail_id}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              void copyGuardrailId(guardrail.guardrail_id);
                            }}
                          >
                            {copiedId === guardrail.guardrail_id ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={TAG}>{guardrail.mode}</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                        v{guardrail.current_version}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <button
                          type="button"
                          className="font-medium text-secondary hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            void startExistingGuardrailVersion(guardrail.guardrail_id);
                          }}
                        >
                          Create version
                        </button>
                        <span className="mx-2 text-gray-300" aria-hidden="true">
                          |
                        </span>
                        <button
                          type="button"
                          className="font-medium text-gray-700 hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            openDetails(guardrail.guardrail_id);
                          }}
                        >
                          View details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        )}

        {((screen === "create" && createOption && createOption !== "ai") || screen === "edit") && (
          <aside className="rounded border border-gray-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                {screen === "edit"
                  ? `New version v${resolvedVersion}`
                  : createOption === "template"
                    ? "Start from a UMAI template"
                    : "Build from scratch"}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {screen === "edit"
                  ? "Adjust policies, pre-AI filters and LLM config. The current version stays live until you publish the new one."
                  : createOption === "template"
                    ? "Pick a template first, then review policies, pre-AI filters, and runtime settings."
                    : "Configure the guardrail basics, policies, pre-AI filters, and runtime settings manually."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">
                Step {wizardDisplayStep} of {visibleWizardSteps.length}
              </span>
              {screen !== "edit" && (
                <button
                  type="button"
                  className={BTN_SECONDARY}
                  onClick={() => setCreateOption(null)}
                >
                  Change option
                </button>
              )}
            </div>
          </div>

          <ol className="mt-5 flex flex-wrap gap-x-6 gap-y-2" aria-label="Steps">
            {visibleWizardSteps.map((step, index) => {
              const state =
                wizardStep === step.id ? "current" : wizardStep > step.id ? "done" : "todo";
              return (
                <li key={step.id} className="flex items-center gap-2 text-xs">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full border text-xs font-medium ${
                      state === "current"
                        ? "border-secondary bg-secondary text-white"
                        : state === "done"
                          ? "border-secondary text-secondary"
                          : "border-gray-300 text-gray-400"
                    }`}
                    aria-current={state === "current" ? "step" : undefined}
                  >
                    {index + 1}
                  </span>
                  <span
                    className={
                      state === "current"
                        ? "font-semibold text-gray-900"
                        : state === "done"
                          ? "text-gray-700"
                          : "text-gray-400"
                    }
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>

          {screen === "edit" && loadingExistingConfig && (
            <p className="mt-4 text-xs text-secondary">Loading current configuration…</p>
          )}

          {wizardError && (
            <div className="mt-4 rounded border border-danger/20 bg-danger/10 px-4 py-3 text-xs text-danger">
              {wizardError}
            </div>
          )}

          {wizardStep === 0 && createOption === "template" && (
            <div className="mt-6 space-y-6">
              <div>
                <p className="text-xs font-medium text-gray-500">
                  Start from a template
                </p>
                <p className="mt-2 text-xs text-gray-600">
                  Templates ship with policies, fast pre-AI filters, and LLM config already tuned.
                </p>
              </div>

              <div className="grid gap-4">
                {libraryLoading ? (
                  <div className="rounded border border-gray-200 bg-gray-50 px-4 py-6 text-center text-xs text-gray-500">
                    Loading guardrail templates...
                  </div>
                ) : libraryError ? (
                  <div className="rounded border border-gray-200 bg-gray-50 px-4 py-6 text-center text-xs text-gray-500">
                    {libraryError}
                  </div>
                ) : guardrailLibrary.length === 0 ? (
                  <div className="rounded border border-gray-200 bg-gray-50 px-4 py-6 text-center text-xs text-gray-500">
                    No guardrail templates are available yet.
                  </div>
                ) : (
                  guardrailLibrary.map((template) => {
                    const isDeploying = deployingTemplate === template.template_id;
                    return (
                      <div
                        key={template.template_id}
                        className="rounded border border-gray-200 bg-white px-5 py-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{template.name}</p>
                            <p className="mt-1 font-mono text-xs text-gray-500">
                              {template.default_guardrail_id}
                            </p>
                          </div>
                          <span className="rounded bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                            {template.mode}
                          </span>
                        </div>
                        {template.description && (
                          <p className="mt-3 text-xs text-gray-600">{template.description}</p>
                        )}
                        <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-gray-500">
                          {template.phases.map((phase) => (
                            <span key={phase} className="rounded bg-gray-100 px-2 py-1">
                              {PHASE_LABELS[phase]}
                            </span>
                          ))}
                          {template.managed && (
                            <span className="rounded bg-gray-100 px-2 py-1">Managed</span>
                          )}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="flex-1 rounded border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                            onClick={() => applyTemplateSettings(template)}
                          >
                            Use template
                          </button>
                          <button
                            type="button"
                            className="flex-1 rounded bg-secondary px-4 py-2 text-sm font-medium text-white transition hover:bg-secondary/90"
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
              <div className="rounded border border-gray-200 bg-gray-50 p-4 space-y-4">
                <div className="flex flex-wrap gap-4 text-xs text-gray-600">
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
                    <label className="text-xs font-medium text-gray-500">
                      Guardrail to update
                    </label>
                    <select
                      className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
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
                    <p className="text-xs text-gray-500">
                      A new version will be created for the selected guardrail.
                    </p>
                    {loadingExistingConfig && (
                      <p className="text-xs text-secondary">
                        Loading current guardrail settings...
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-gray-500">
                        Guardrail ID
                      </label>
                      <input
                        className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                        value={guardrailId}
                        onChange={(event) => setGuardrailId(event.target.value)}
                        placeholder="gr-main-chat"
                      />
                      <p className={`text-xs ${guardrailIdStatus.tone}`}>
                        {guardrailIdStatus.message}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-gray-500">
                        Guardrail Name
                      </label>
                      <input
                        className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                        value={guardrailName}
                        onChange={(event) => setGuardrailName(event.target.value)}
                        placeholder="Primary Chat Guardrail"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-gray-500">
                        Mode
                      </label>
                      <select
                        className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                        value={guardrailMode}
                        onChange={(event) =>
                          setGuardrailMode(event.target.value as Guardrail["mode"])
                        }
                      >
                        <option value="ENFORCE">ENFORCE (blocks)</option>
                        <option value="MONITOR">MONITOR (observe only)</option>
                      </select>
                      <p className="text-xs text-gray-500">
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
              {createOption !== "template" && screen !== "edit" && (
                <div>
                  <p className="text-xs font-medium text-gray-500">
                    Quick-start presets
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {QUICK_STARTS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyQuickStart(preset.id)}
                        className={`rounded border px-4 py-3 text-left transition ${
                          quickStartId === preset.id
                            ? "border-secondary/40 bg-secondary/5"
                            : "border-gray-200 bg-white"
                        }`}
                      >
                        <p className="text-sm font-semibold text-gray-900">{preset.label}</p>
                        <p className="mt-1 text-xs text-gray-600">{preset.description}</p>
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-gray-500">
                    Presets pick policies already in this project. You can still customize below.
                  </p>
                </div>
              )}

              <div className="rounded border border-gray-200 bg-gray-50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-500">
                    Policies in scope
                  </p>
                  <span className="text-xs text-gray-500">
                    {policies.length} available
                  </span>
                </div>

                <input
                  className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                  placeholder="Search policies by name or ID"
                  value={policySearch}
                  onChange={(event) => setPolicySearch(event.target.value)}
                />
                {createOption === "template" && (
                  <p className="text-xs text-gray-500">
                    Template policies are already selected. Add or remove policies only if you want
                    to customize this template.
                  </p>
                )}
                {requiredPolicyIds.length > 0 && (
                  <p className="text-xs text-gray-500">
                    Organization and environment policies are required and cannot be removed.
                  </p>
                )}

                {policies.length === 0 ? (
                  <div className="rounded border border-gray-200 bg-white px-4 py-4 text-xs text-gray-500">
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
                          className="flex items-start gap-3 rounded border border-gray-200 bg-white px-3 py-3"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isRequired}
                            onChange={() => togglePolicy(policy.policy_id)}
                          />
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{policy.name}</p>
                            <p className="mt-1 font-mono text-xs text-gray-500">
                              {policy.policy_id}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                              <span className="rounded bg-gray-100 px-2 py-1">
                                {policy.type === "HEURISTIC"
                                  ? "Fast pattern check"
                                  : "AI-assisted decision"}
                              </span>
                              {policy.scope && (
                                <span className="rounded bg-gray-100 px-2 py-1">
                                  {policy.scope === "ORGANIZATION"
                                    ? "Organization"
                                    : policy.scope === "ENVIRONMENT"
                                      ? "Environment"
                                      : "Project"}
                                </span>
                              )}
                              {isRequired && (
                                <span className="rounded bg-secondary/10 px-2 py-1 text-secondary">
                                  Required
                                </span>
                              )}
                              {policy.phases.map((phase) => (
                                <span key={phase} className="rounded bg-gray-100 px-2 py-1">
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
                  <div className="rounded border border-secondary/30 bg-secondary/5 px-3 py-2 text-xs text-secondary">
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
              <div className="rounded border border-gray-200 bg-gray-50 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-500">
                    Pre-AI Request Filters
                  </p>
                  <span className="text-xs text-gray-500">Runs before the policy engine</span>
                </div>

                <div className="rounded border border-gray-200 bg-white p-4">
                  <p className="text-xs font-semibold text-gray-900">
                    These are not the same as policies.
                  </p>
                  <p className="mt-2 text-xs text-gray-600">
                    Pre-AI filters are lightweight exact-match or regex blockers for obvious prompt
                    patterns. They run first and fail fast.
                  </p>
                  <p className="mt-2 text-xs text-gray-600">
                    Policies are the main guardrail rules attached to this guardrail. They can
                    evaluate richer logic before or after the AI call.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-500">
                      Filter target
                    </label>
                    <select
                      className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                      value={preflightTarget}
                      onChange={(event) => setPreflightTarget(event.target.value as PreflightTarget)}
                    >
                      <option value="LAST_MESSAGE">Last user message</option>
                      <option value="FULL_HISTORY">Full conversation history</option>
                    </select>
                    <p className="text-xs text-gray-500">
                      Choose which request text is scanned before the normal policy checks run.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-500">
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
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>0</span>
                      <span>{preflightMaxLength || "0"} chars</span>
                      <span>20k</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500">
                    Filter rule templates
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {PREFLIGHT_RULE_TEMPLATES.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        title={`${template.description} Example: ${template.example}`}
                        className="rounded border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600"
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
                      className="rounded border border-gray-200 bg-white p-3 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-900">Filter rule {index + 1}</p>
                        <button
                          type="button"
                          className="text-xs font-medium text-danger"
                          onClick={() => removePreflightRule(index)}
                        >
                          Remove
                        </button>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500">
                            Rule ID
                          </label>
                          <input
                            className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                            value={rule.id}
                            onChange={(event) => updatePreflightRule(index, "id", event.target.value)}
                            placeholder="preflight-ignore-instructions"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500">
                            Match mode
                          </label>
                          <select
                            className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
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
                        <label className="text-xs font-medium text-gray-500">
                          Pattern
                        </label>
                        <input
                          className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                          value={rule.pattern}
                          onChange={(event) => updatePreflightRule(index, "pattern", event.target.value)}
                          placeholder="ignore previous instructions"
                        />
                      </div>

                      <label className="flex items-center gap-2 text-xs text-gray-600">
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
                  className="w-full rounded border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                  onClick={addPreflightRule}
                >
                  + Add Filter Rule
                </button>

                <div className="rounded border border-gray-200 bg-white p-3">
                  <button
                    type="button"
                    className="text-xs font-semibold text-gray-600"
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
                        className="h-40 w-full rounded border border-gray-200 bg-white px-3 py-2 text-xs font-mono"
                        value={preflightJsonText}
                        onChange={(event) => {
                          setPreflightJsonText(event.target.value);
                          setPreflightJsonTouched(true);
                        }}
                      />
                      <button
                        type="button"
                        className="text-xs font-medium text-gray-600"
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
              <div className="rounded border border-gray-200 bg-gray-50 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-500">
                    LLM provider
                  </p>
                  <span className="text-xs text-gray-500">
                    Used by context-aware policies
                  </span>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-500">
                    Preset
                  </label>
                  <select
                    className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                    value={llmPresetId}
                    onChange={(event) => applyLlmPreset(event.target.value)}
                  >
                    {LLM_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500">
                    {LLM_PRESETS.find((preset) => preset.id === llmPresetId)?.description}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-500">
                      Provider ID
                    </label>
                    <input
                      className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                      value={llmProvider}
                      onChange={(event) => setLlmProvider(event.target.value)}
                      placeholder="OSS_ROUTER"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-500">
                      Model
                    </label>
                    <input
                      className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                      value={llmModel}
                      onChange={(event) => setLlmModel(event.target.value)}
                      placeholder="gpt-4o-mini"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-500">
                    Base URL
                  </label>
                  <input
                    className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                    value={llmBaseUrl}
                    onChange={(event) => setLlmBaseUrl(event.target.value)}
                    placeholder="https://api.openai.com/v1"
                  />
                  <p className="text-xs text-gray-500">
                    Must be OpenAI-compatible. Choose whether the endpoint uses no auth,
                    bearer auth, or a custom header.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-500">
                      Timeout (ms)
                    </label>
                    <input
                      type="number"
                      className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                      value={llmTimeout}
                      onChange={(event) => setLlmTimeout(event.target.value)}
                      min={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-500">
                      Auth type
                    </label>
                    <select
                      className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
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
                    <label className="text-xs font-medium text-gray-500">
                      Secret env
                    </label>
                    <input
                      className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                      value={llmAuthSecretEnv}
                      onChange={(event) => setLlmAuthSecretEnv(event.target.value)}
                      placeholder={llmAuthType === "none" ? "Not required" : "LLM_API_KEY"}
                      disabled={llmAuthType === "none"}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-500">
                      Header name
                    </label>
                    <input
                      className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                      value={llmAuthHeaderName}
                      onChange={(event) => setLlmAuthHeaderName(event.target.value)}
                      placeholder={llmAuthType === "header" ? "api-key" : "Only for custom header auth"}
                      disabled={llmAuthType !== "header"}
                    />
                  </div>
                </div>

                <div className="rounded border border-gray-200 bg-white p-3">
                  <button
                    type="button"
                    className="text-xs font-semibold text-gray-600"
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
                        className="h-36 w-full rounded border border-gray-200 bg-white px-3 py-2 text-xs font-mono"
                        value={llmJsonText}
                        onChange={(event) => {
                          setLlmJsonText(event.target.value);
                          setLlmJsonTouched(true);
                        }}
                      />
                      <button
                        type="button"
                        className="text-xs font-medium text-gray-600"
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
              <div className="rounded border border-gray-200 bg-gray-50 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-500">
                    Review summary
                  </p>
                  <span className="text-xs text-gray-500">Version {resolvedVersion}</span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium text-gray-500">
                      Guardrail
                    </p>
                    <p className="mt-2 text-sm font-semibold text-gray-900">
                      {wizardMode === "new"
                        ? guardrailNameTrimmed || "Not set"
                        : selectedWizardGuardrail?.name || "Not set"}
                    </p>
                    <p className="mt-1 text-xs text-gray-600">
                      {wizardMode === "new"
                        ? guardrailIdTrimmed || "Not set"
                        : wizardGuardrailId || "Not set"}
                    </p>
                    <p className="mt-2 text-xs text-gray-600">
                      Mode: {wizardMode === "new" ? guardrailMode : selectedWizardGuardrail?.mode}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500">
                      Policies
                    </p>
                    <p className="mt-2 text-sm font-semibold text-gray-900">
                      {selectedPolicyIds.length} selected
                    </p>
                    <p className="mt-1 text-xs text-gray-600">
                      {phaseSummaryText}
                    </p>
                    {missingPolicyIds.length > 0 && (
                      <p className="mt-2 text-xs text-secondary">
                        {selectedTemplate
                          ? `${missingPolicyIds.length} policies will be created from the template.`
                          : `${missingPolicyIds.length} policies are missing and must be deployed.`}
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded border border-gray-200 bg-white p-3">
                  <p className="text-xs font-medium text-gray-500">
                    What this will do
                  </p>
                  <p className="mt-2 text-xs text-gray-600">
                    This guardrail first applies fast request filters to the{" "}
                    {preflightTarget === "LAST_MESSAGE" ? "last user message" : "full history"} and
                    then runs {selectedPolicyIds.length} attached policies.
                    {createOption === "template" && selectedTemplate?.agt?.enabled
                      ? " It also enables AGT action governance for the managed action phases."
                      : ""}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded border border-gray-200 bg-white p-3">
                    <p className="text-xs font-medium text-gray-500">
                      Pre-AI filter preview
                    </p>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-gray-50 px-3 py-2 text-xs text-gray-600">
                      {formatJson(preflightPreview)}
                    </pre>
                  </div>
                  <div className="rounded border border-gray-200 bg-white p-3">
                    <p className="text-xs font-medium text-gray-500">
                      Policy names
                    </p>
                    {reviewPolicies.length === 0 ? (
                      <p className="mt-2 text-xs text-gray-600">No policies selected.</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {reviewPolicies.map((policy) => (
                          <div
                            key={policy.policy_id}
                            className="rounded bg-gray-50 px-3 py-2 text-xs text-gray-600"
                          >
                            <p className="font-semibold text-gray-900">{policy.name}</p>
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
                  <label className="text-xs font-medium text-gray-500">
                    Version override (optional)
                  </label>
                  <input
                    type="number"
                    className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                    value={versionOverride}
                    onChange={(event) => setVersionOverride(event.target.value)}
                    min={1}
                    placeholder={nextVersion.toString()}
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={publishNow}
                    disabled={wizardMode === "new"}
                    onChange={(event) => setPublishNow(event.target.checked)}
                  />
                  Publish immediately (updates current version)
                </label>
                {wizardMode === "new" && (
                  <p className="text-xs text-gray-500">
                    First versions auto-publish when created.
                  </p>
                )}
                {wizardMode === "existing" && (
                  <p className="text-xs text-gray-500">
                    Publishing makes v{resolvedVersion} the live version immediately. Otherwise the
                    version is saved and can be published later from the guardrail details.
                  </p>
                )}
              </div>
            </div>
          )}

          {wizardStep > 0 && wizardStep < WIZARD_STEPS.length - 1 && (
            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                className="rounded border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                onClick={handleBack}
              >
                Back
              </button>
              <button
                type="button"
                className="rounded bg-secondary px-4 py-2 text-sm font-medium text-white transition hover:bg-secondary/90"
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
                className="rounded border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                onClick={handleBack}
              >
                Back
              </button>
              <button
                type="button"
                className="rounded bg-secondary px-4 py-2 text-sm font-medium text-white transition hover:bg-secondary/90"
                disabled={submitting}
                onClick={handleWizardSubmit}
              >
                {submitting
                  ? "Saving…"
                  : screen === "edit"
                    ? publishNow
                      ? `Save & publish v${resolvedVersion}`
                      : `Save v${resolvedVersion}`
                    : publishNow
                      ? "Create & publish"
                      : "Create version"}
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
              className={`pointer-events-auto rounded border px-4 py-3 ${TOAST_STYLES[toast.tone]}`}
              role={toast.tone === "error" ? "alert" : "status"}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-white/80">
                    {TOAST_LABELS[toast.tone]}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-white">
                    {toast.message}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded px-2 py-1 text-xs font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4 py-6"
          onClick={closeDetails}
        >
          <div
            className="flex h-[min(88vh,860px)] w-full max-w-6xl flex-col overflow-hidden rounded border border-gray-200 bg-white"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Guardrail details"
          >
            <div className="border-b border-gray-200 px-6 pt-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {selectedGuardrail.name}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span className="font-mono">{selectedGuardrail.guardrail_id}</span>
                    <span className={TAG}>{selectedGuardrail.mode}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                <div className="flex gap-6" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={detailsTab === "overview"}
                    className={`-mb-px border-b-2 pb-2.5 text-sm font-medium transition ${
                      detailsTab === "overview"
                        ? "border-secondary text-gray-900"
                        : "border-transparent text-gray-500 hover:text-gray-900"
                    }`}
                    onClick={() => setDetailsTab("overview")}
                  >
                    Overview
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={detailsTab === "policies"}
                    className={`-mb-px border-b-2 pb-2.5 text-sm font-medium transition ${
                      detailsTab === "policies"
                        ? "border-secondary text-gray-900"
                        : "border-transparent text-gray-500 hover:text-gray-900"
                    }`}
                    onClick={() => setDetailsTab("policies")}
                  >
                    Policies
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {detailsTab === "policies" && filteredDetailsPolicies.length > 0 ? (
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <span>
                        {safeDetailsPolicyIndex + 1} of {filteredDetailsPolicies.length}
                      </span>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-200 text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
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
                        className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-200 text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
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

                  <button type="button" className={`${BTN_SECONDARY} mb-2`} onClick={closeDetails}>
                    Close
                  </button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-6 pb-6 pt-5">
              {snapshotError && (
                <div className="mb-4 rounded border border-danger/20 bg-danger/10 px-4 py-3 text-xs text-danger">
                  {snapshotError}
                </div>
              )}

              {snapshotLoading ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">
                  Loading snapshot details...
                </div>
              ) : snapshot ? (
                detailsTab === "overview" ? (
                  <div className="grid h-full gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                    <div className="min-h-0 space-y-6 overflow-y-auto pr-1">
                      <div className="rounded border border-gray-200 bg-white p-5">
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          <div>
                            <p className="text-xs font-medium text-gray-500">
                              Current Version
                            </p>
                            <p className="mt-2 text-lg font-semibold text-gray-900">
                              v{selectedGuardrail.current_version}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500">
                              Snapshot Version
                            </p>
                            <select
                              className="mt-2 w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
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
                            <p className="text-xs font-medium text-gray-500">
                              Runtime status
                            </p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">
                              {snapshot.redis_available
                                ? snapshot.redis_present
                                  ? "Published"
                                  : "Not published"
                                : "Unavailable"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500">
                              Attached Policies
                            </p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">
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
                              className="rounded bg-secondary px-4 py-2 text-sm font-medium text-white transition hover:bg-secondary/90 disabled:opacity-60"
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
                            <span className="rounded bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                              Live version
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded border border-gray-200 bg-gray-50 p-5">
                          <p className="text-xs font-semibold text-gray-900">Preflight</p>
                          <pre className="mt-3 max-h-[260px] overflow-auto whitespace-pre-wrap rounded bg-white px-4 py-3 text-xs text-gray-600">
                            {formatJson(snapshot.snapshot.preflight)}
                          </pre>
                        </div>

                        <div className="rounded border border-gray-200 bg-gray-50 p-5">
                          <p className="text-xs font-semibold text-gray-900">LLM Config</p>
                          <pre className="mt-3 max-h-[260px] overflow-auto whitespace-pre-wrap rounded bg-white px-4 py-3 text-xs text-gray-600">
                            {formatJson(snapshot.snapshot.llm_config)}
                          </pre>
                        </div>

                        {snapshot.snapshot.agt ? (
                          <div className="rounded border border-gray-200 bg-gray-50 p-5 lg:col-span-2">
                            <p className="text-xs font-semibold text-gray-900">AGT Action Governance</p>
                            <pre className="mt-3 max-h-[240px] overflow-auto whitespace-pre-wrap rounded bg-white px-4 py-3 text-xs text-gray-600">
                              {formatJson(snapshot.snapshot.agt)}
                            </pre>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <aside className="min-h-0 rounded border border-gray-200 bg-gray-50 p-5">
                      <div className="flex h-full flex-col">
                        <div>
                          <p className="text-xs font-medium text-gray-500">
                            Snapshot Overview
                          </p>
                          <p className="mt-2 text-lg font-semibold text-gray-900">
                            v{snapshot.version} configuration
                          </p>
                        </div>

                        <div className="mt-5">
                          <p className="text-xs font-medium text-gray-500">
                            Active Phases
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-gray-600">
                            {snapshot.snapshot.phases?.length ? (
                              snapshot.snapshot.phases.map((phase) => (
                                <span
                                  key={phase}
                                  className="rounded bg-white px-2 py-0.5"
                                >
                                  {PHASE_LABELS[phase]}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-gray-500">No phases configured.</span>
                            )}
                          </div>
                        </div>

                        <div className="mt-5 min-h-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-medium text-gray-500">
                              Policies In This Version
                            </p>
                            <button
                              type="button"
                              className="text-xs font-medium text-secondary transition hover:text-gray-900"
                              onClick={() => setDetailsTab("policies")}
                            >
                              Open policy view
                            </button>
                          </div>
                          <div className="mt-3 space-y-2 overflow-y-auto pr-1">
                            {snapshot.snapshot.policies.length === 0 ? (
                              <div className="rounded border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-xs text-gray-500">
                                No policies are attached to this version.
                              </div>
                            ) : (
                              snapshot.snapshot.policies.map((policy, index) => (
                                <button
                                  key={policy.id}
                                  type="button"
                                  className="w-full rounded border border-transparent bg-white px-4 py-3 text-left transition hover:border-gray-200 hover:bg-gray-50"
                                  onClick={() => {
                                    setDetailsPolicyPhase("ALL");
                                    setDetailsPolicyIndex(index);
                                    setDetailsTab("policies");
                                  }}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold text-gray-900">
                                        {policy.name}
                                      </p>
                                      <p className="mt-1 truncate font-mono text-xs text-gray-500">
                                        {policy.id}
                                      </p>
                                    </div>
                                    <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
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
                        className={`rounded px-3 py-2 text-xs font-medium transition ${
                          detailsPolicyPhase === "ALL"
                            ? "bg-secondary text-white"
                            : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                        onClick={() => setDetailsPolicyPhase("ALL")}
                      >
                        All policies
                      </button>
                      {availableDetailsPolicyPhases.map((phase) => (
                        <button
                          key={phase}
                          type="button"
                          className={`rounded px-3 py-2 text-xs font-medium transition ${
                            detailsPolicyPhase === phase
                              ? "bg-secondary text-white"
                              : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                          }`}
                          onClick={() => setDetailsPolicyPhase(phase)}
                        >
                          {PHASE_LABELS[phase]}
                        </button>
                      ))}
                    </div>

                    {filteredDetailsPolicies.length === 0 ? (
                      <div className="flex flex-1 items-center justify-center rounded border border-dashed border-gray-300 bg-gray-50 px-6 text-sm text-gray-500">
                        No policies match the selected phase.
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
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
                                  className={`w-[212px] shrink-0 rounded border px-4 py-3 text-left transition ${
                                    index === safeDetailsPolicyIndex
                                      ? "border-secondary bg-secondary/5 text-gray-900"
                                      : "border-gray-200 bg-white text-gray-900 hover:border-gray-300 hover:bg-gray-50"
                                  }`}
                                  onClick={() => setDetailsPolicyIndex(index)}
                                >
                                  <p className="truncate text-sm font-semibold">{policy.name}</p>
                                  <p
                                    className={`mt-1 truncate font-mono text-xs ${
                                      index === safeDetailsPolicyIndex
                                        ? "text-gray-500"
                                        : "text-gray-500"
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
                            className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
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
                          <div className="flex min-h-0 h-full flex-col rounded border border-gray-200 bg-white p-5">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div className="min-w-0">
                                <p className="text-lg font-semibold text-gray-900">
                                  {activeDetailsPolicy?.name}
                                </p>
                                <p className="mt-1 break-all font-mono text-xs text-gray-500">
                                  {activeDetailsPolicy?.id}
                                </p>
                              </div>
                              <span className="rounded bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                                {activeDetailsPolicy?.type}
                              </span>
                            </div>

                            <pre className="mt-4 min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded bg-gray-50 px-4 py-3 text-xs text-gray-600">
                              {formatJson(activeDetailsPolicy?.config)}
                            </pre>
                          </div>

                          <aside className="rounded border border-gray-200 bg-gray-50 p-5">
                            <p className="text-xs font-medium text-gray-500">
                              Policy Summary
                            </p>

                            <div className="mt-5 space-y-4 text-sm text-gray-600">
                              <div className="rounded bg-white px-4 py-3">
                                <p className="text-xs font-medium text-gray-500">
                                  Status
                                </p>
                                <p className="mt-2 font-semibold text-gray-900">
                                  {activeDetailsPolicy?.enabled ? "Enabled" : "Disabled"}
                                </p>
                              </div>

                              <div className="rounded bg-white px-4 py-3">
                                <p className="text-xs font-medium text-gray-500">
                                  Phases
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-gray-600">
                                  {activeDetailsPolicy?.phases?.map((phase) => (
                                    <span
                                      key={`${activeDetailsPolicy?.id ?? "policy"}-${phase}`}
                                      className="rounded bg-gray-100 px-3 py-1"
                                    >
                                      {PHASE_LABELS[phase]}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              <div className="rounded bg-white px-4 py-3">
                                <p className="text-xs font-medium text-gray-500">
                                  Position
                                </p>
                                <p className="mt-2 font-semibold text-gray-900">
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
                <div className="flex h-full items-center justify-center text-sm text-gray-500">
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
