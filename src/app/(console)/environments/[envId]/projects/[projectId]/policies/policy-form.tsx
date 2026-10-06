"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Policy, PolicyPhase, PolicyScope } from "src/lib/api";
import { PHASE_LABELS, PHASE_OPTIONS, formatScope, slugify } from "./policy-drafts";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  INPUT,
  LABEL,
  TAG,
  InlineNotice,
  typeHint,
  typeLabel,
} from "./policy-ui";

export type PolicyType = Policy["type"];

export interface PolicyFormValues {
  name: string;
  policyId: string;
  type: PolicyType;
  scope: PolicyScope;
  enabled: boolean;
  phases: PolicyPhase[];
  config: Record<string, unknown>;
}

// Engine tarafındaki HeuristicConfig / ContextAwareConfig modelleriyle bire bir.
const TARGETS = [
  { value: "LAST_MESSAGE", label: "Last message" },
  { value: "FULL_HISTORY", label: "Full conversation" },
  { value: "ATTACHMENTS", label: "Attachments" },
  { value: "FULL_CONTEXT", label: "Full context" },
] as const;
type Target = (typeof TARGETS)[number]["value"];

type RuleAction = "block" | "step_up" | "redact" | "flag";
const RULE_ACTIONS: Array<{ value: RuleAction; label: string }> = [
  { value: "block", label: "Block" },
  { value: "step_up", label: "Require approval" },
  { value: "redact", label: "Redact" },
  { value: "flag", label: "Flag only" },
];

const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
type Confidence = (typeof CONFIDENCE_LEVELS)[number];

const DEFAULT_OUTPUT_SCHEMA = {
  violation_field: "violation",
  category_field: "policy_category",
  confidence_field: "confidence",
  rationale_field: "rationale",
};

interface RuleRow {
  key: string;
  id: string;
  mode: "REGEX" | "EXACT";
  pattern: string;
  action: RuleAction;
  replacement: string;
}

interface HeuristicForm {
  target: Target;
  rules: RuleRow[];
  maxLength: string;
}

interface ContextForm {
  target: Target;
  instructions: string;
  definitions: string;
  examples: string;
  minConfidence: Confidence;
  failClosed: boolean;
  stepUpCategories: string;
}

let ruleSeq = 0;
const newRuleKey = () => `rule-${ruleSeq++}`;
const emptyRule = (): RuleRow => ({
  key: newRuleKey(),
  id: "",
  mode: "REGEX",
  pattern: "",
  action: "block",
  replacement: "[REDACTED]",
});

const str = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const asTarget = (value: unknown): Target =>
  TARGETS.some((item) => item.value === value) ? (value as Target) : "LAST_MESSAGE";

function heuristicFromConfig(config: Record<string, unknown>): HeuristicForm {
  const raw = Array.isArray(config.rules) ? config.rules : [];
  const rules = raw.map((item): RuleRow => {
    const rule = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    // Engine'de block_on_match varsayılanı true.
    const block = rule.block_on_match === undefined ? true : Boolean(rule.block_on_match);
    return {
      key: newRuleKey(),
      id: str(rule.id),
      mode: rule.mode === "EXACT" ? "EXACT" : "REGEX",
      pattern: str(rule.pattern),
      action: block
        ? "block"
        : rule.step_up_on_match
          ? "step_up"
          : rule.redact_on_match
            ? "redact"
            : "flag",
      replacement: str(rule.replacement, "[REDACTED]"),
    };
  });
  return {
    target: asTarget(config.target),
    rules: rules.length > 0 ? rules : [emptyRule()],
    maxLength: typeof config.max_length === "number" ? String(config.max_length) : "",
  };
}

function heuristicToConfig(form: HeuristicForm, base: Record<string, unknown>) {
  const config: Record<string, unknown> = {
    ...base,
    target: form.target,
    rules: form.rules.map((rule) => ({
      id: rule.id.trim(),
      mode: rule.mode,
      pattern: rule.pattern,
      block_on_match: rule.action === "block",
      step_up_on_match: rule.action === "step_up",
      redact_on_match: rule.action === "redact",
      ...(rule.action === "redact" ? { replacement: rule.replacement || "[REDACTED]" } : {}),
    })),
  };
  const maxLength = Number(form.maxLength);
  if (form.maxLength.trim() && Number.isFinite(maxLength) && maxLength > 0) {
    config.max_length = Math.round(maxLength);
  } else {
    delete config.max_length;
  }
  return config;
}

function contextFromConfig(config: Record<string, unknown>): ContextForm {
  const confidence = config.min_confidence_for_block;
  return {
    target: asTarget(config.target),
    instructions: str(config.instructions),
    definitions: str(config.definitions_and_category_map),
    examples: str(config.examples),
    minConfidence: CONFIDENCE_LEVELS.includes(confidence as Confidence)
      ? (confidence as Confidence)
      : "medium",
    failClosed: config.fail_closed_on_error !== false,
    stepUpCategories: Array.isArray(config.step_up_categories)
      ? config.step_up_categories.map(String).join(", ")
      : "",
  };
}

function contextToConfig(form: ContextForm, base: Record<string, unknown>) {
  const stepUp = form.stepUpCategories
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    ...base,
    target: form.target,
    instructions: form.instructions,
    definitions_and_category_map: form.definitions,
    examples: form.examples,
    output_schema: base.output_schema ?? DEFAULT_OUTPUT_SCHEMA,
    min_confidence_for_block: form.minConfidence,
    fail_closed_on_error: form.failClosed,
    step_up_categories: stepUp,
  };
}

export function defaultConfigFor(type: PolicyType): Record<string, unknown> {
  return type === "HEURISTIC"
    ? { target: "LAST_MESSAGE", rules: [] }
    : {
        target: "LAST_MESSAGE",
        instructions: "",
        definitions_and_category_map: "",
        examples: "",
        output_schema: DEFAULT_OUTPUT_SCHEMA,
        min_confidence_for_block: "medium",
        fail_closed_on_error: true,
        step_up_categories: [],
      };
}

interface PolicyFormProps {
  mode: "create" | "edit";
  initial: PolicyFormValues;
  existingIds: Set<string>;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (values: PolicyFormValues) => void;
  onCancel: () => void;
}

export function PolicyForm({
  mode,
  initial,
  existingIds,
  submitting,
  submitLabel,
  onSubmit,
  onCancel,
}: PolicyFormProps) {
  const [name, setName] = useState(initial.name);
  const [policyId, setPolicyId] = useState(initial.policyId);
  const [idTouched, setIdTouched] = useState(Boolean(initial.policyId));
  const [type, setType] = useState<PolicyType>(initial.type);
  const [scope, setScope] = useState<PolicyScope>(initial.scope);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [phases, setPhases] = useState<PolicyPhase[]>(initial.phases);

  // Bilinmeyen anahtarlar kaybolmasın diye orijinal config taban olarak tutulur.
  const [baseConfig, setBaseConfig] = useState<Record<string, unknown>>(initial.config);
  const [heuristic, setHeuristic] = useState<HeuristicForm>(() =>
    initial.type === "HEURISTIC"
      ? heuristicFromConfig(initial.config)
      : heuristicFromConfig(defaultConfigFor("HEURISTIC"))
  );
  const [context, setContext] = useState<ContextForm>(() =>
    initial.type === "CONTEXT_AWARE"
      ? contextFromConfig(initial.config)
      : contextFromConfig(defaultConfigFor("CONTEXT_AWARE"))
  );

  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buildConfig = (): Record<string, unknown> =>
    type === "HEURISTIC" ? heuristicToConfig(heuristic, baseConfig) : contextToConfig(context, baseConfig);

  const enterJsonMode = () => {
    setJsonText(JSON.stringify(buildConfig(), null, 2));
    setJsonError(null);
    setJsonMode(true);
  };

  const parseJson = (): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setJsonError("Config must be a JSON object.");
        return null;
      }
      setJsonError(null);
      return parsed as Record<string, unknown>;
    } catch {
      setJsonError("Config is not valid JSON.");
      return null;
    }
  };

  const leaveJsonMode = () => {
    const parsed = parseJson();
    if (!parsed) return;
    setBaseConfig(parsed);
    if (type === "HEURISTIC") setHeuristic(heuristicFromConfig(parsed));
    else setContext(contextFromConfig(parsed));
    setJsonMode(false);
  };

  const switchType = (next: PolicyType) => {
    if (next === type || mode === "edit") return;
    setType(next);
    setBaseConfig(defaultConfigFor(next));
    setJsonMode(false);
    setJsonError(null);
  };

  const updateRule = (key: string, patch: Partial<RuleRow>) =>
    setHeuristic((current) => ({
      ...current,
      rules: current.rules.map((rule) => (rule.key === key ? { ...rule, ...patch } : rule)),
    }));

  const togglePhase = (phase: PolicyPhase) =>
    setPhases((current) =>
      current.includes(phase) ? current.filter((item) => item !== phase) : [...current, phase]
    );

  const handleSubmit = () => {
    setError(null);
    const trimmedName = name.trim();
    const trimmedId = policyId.trim();
    if (!trimmedName) return setError("Policy name is required.");
    if (mode === "create") {
      if (!trimmedId) return setError("Policy ID is required.");
      if (!/^[a-z0-9][a-z0-9-]*$/.test(trimmedId)) {
        return setError("Policy ID must use lowercase letters, numbers and dashes.");
      }
      if (existingIds.has(trimmedId)) return setError("A policy with this ID already exists.");
    }
    if (phases.length === 0) return setError("Select at least one phase.");

    let config: Record<string, unknown>;
    if (jsonMode) {
      const parsed = parseJson();
      if (!parsed) return setError("Fix the JSON config before saving.");
      config = parsed;
    } else if (type === "HEURISTIC") {
      if (heuristic.rules.length === 0) return setError("Add at least one rule.");
      const incomplete = heuristic.rules.find((rule) => !rule.id.trim() || !rule.pattern.trim());
      if (incomplete) return setError("Every rule needs an ID and a pattern.");
      const ids = heuristic.rules.map((rule) => rule.id.trim());
      if (new Set(ids).size !== ids.length) return setError("Rule IDs must be unique.");
      config = heuristicToConfig(heuristic, baseConfig);
    } else {
      if (!context.instructions.trim()) return setError("Instructions are required.");
      config = contextToConfig(context, baseConfig);
    }

    onSubmit({ name: trimmedName, policyId: trimmedId, type, scope, enabled, phases, config });
  };

  return (
    <div className="space-y-6">
      {/* Basics */}
      <section className="rounded border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900">Basics</h2>
        </div>
        <div className="grid gap-5 px-5 py-5 lg:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="policy-name">
              Name
            </label>
            <input
              id="policy-name"
              className={`${INPUT} mt-1`}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (mode === "create" && !idTouched) {
                  setPolicyId(`pol-${slugify(event.target.value) || "custom"}`);
                }
              }}
              placeholder="Customer identifier protection"
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="policy-id">
              Policy ID
            </label>
            <input
              id="policy-id"
              className={`${INPUT} mt-1 font-mono`}
              value={policyId}
              disabled={mode === "edit"}
              onChange={(event) => {
                setIdTouched(true);
                setPolicyId(event.target.value);
              }}
              placeholder="pol-customer-identifiers"
            />
            <p className="mt-1 text-xs text-gray-500">
              {mode === "edit"
                ? "IDs cannot change after creation."
                : "Lowercase letters, numbers and dashes. Used in guardrail snapshots and audit logs."}
            </p>
          </div>

          <div>
            <p className={LABEL}>Type</p>
            {mode === "edit" ? (
              <p className="mt-1 text-sm text-gray-900">
                {typeLabel(type)}{" "}
                <span className="text-xs text-gray-500">· {typeHint(type)}</span>
              </p>
            ) : (
              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                {(["HEURISTIC", "CONTEXT_AWARE"] as PolicyType[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={type === option}
                    onClick={() => switchType(option)}
                    className={`rounded border px-3 py-2.5 text-left transition ${
                      type === option
                        ? "border-secondary bg-secondary/5"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <p className="text-sm font-medium text-gray-900">{typeLabel(option)}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{typeHint(option)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className={LABEL} htmlFor="policy-scope">
              Scope
            </label>
            {mode === "edit" ? (
              <p className="mt-1 text-sm text-gray-900">{formatScope(scope)}</p>
            ) : (
              <select
                id="policy-scope"
                className={`${INPUT} mt-1`}
                value={scope}
                onChange={(event) => setScope(event.target.value as PolicyScope)}
              >
                {(["PROJECT", "ENVIRONMENT", "ORGANIZATION"] as PolicyScope[]).map((option) => (
                  <option key={option} value={option}>
                    {formatScope(option)}
                  </option>
                ))}
              </select>
            )}
            <p className="mt-1 text-xs text-gray-500">
              {mode === "edit"
                ? "Scope cannot change after creation."
                : "Where the policy is visible for attachment: this project, every project in the environment, or the whole organization."}
            </p>
          </div>

          <div>
            <p className={LABEL}>Phases</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {PHASE_OPTIONS.map((phase) => {
                const active = phases.includes(phase);
                return (
                  <button
                    key={phase}
                    type="button"
                    aria-pressed={active}
                    onClick={() => togglePhase(phase)}
                    className={`rounded border px-2.5 py-1 text-xs font-medium transition ${
                      active
                        ? "border-secondary bg-secondary text-white"
                        : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {PHASE_LABELS[phase]}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-gray-500">When the policy runs inside a guardrail.</p>
          </div>

          <div>
            <p className={LABEL}>Status</p>
            <label className="mt-1.5 flex items-center gap-2 text-sm text-gray-900">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-secondary focus:ring-secondary/30"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
              />
              Enabled
            </label>
            <p className="mt-1 text-xs text-gray-500">
              Disabled policies stay attached to guardrails but are skipped at runtime.
            </p>
          </div>
        </div>
      </section>

      {/* Configuration */}
      <section className="rounded border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Configuration</h2>
            <p className="mt-0.5 text-xs text-gray-500">{typeHint(type)}</p>
          </div>
          <button
            type="button"
            className="text-sm font-medium text-secondary hover:underline"
            onClick={jsonMode ? leaveJsonMode : enterJsonMode}
          >
            {jsonMode ? "Back to form" : "Edit as JSON"}
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {jsonMode ? (
            <div>
              <textarea
                className={`${INPUT} h-96 font-mono text-xs leading-5`}
                value={jsonText}
                onChange={(event) => setJsonText(event.target.value)}
                spellCheck={false}
              />
              {jsonError && <p className="mt-1 text-xs text-red-700">{jsonError}</p>}
            </div>
          ) : (
            <>
              <div className="grid gap-5 lg:grid-cols-3">
                <div>
                  <label className={LABEL} htmlFor="policy-target">
                    Evaluate
                  </label>
                  <select
                    id="policy-target"
                    className={`${INPUT} mt-1`}
                    value={type === "HEURISTIC" ? heuristic.target : context.target}
                    onChange={(event) => {
                      const target = event.target.value as Target;
                      if (type === "HEURISTIC") setHeuristic((c) => ({ ...c, target }));
                      else setContext((c) => ({ ...c, target }));
                    }}
                  >
                    {TARGETS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                {type === "HEURISTIC" ? (
                  <div>
                    <label className={LABEL} htmlFor="policy-max-length">
                      Max scan length (characters)
                    </label>
                    <input
                      id="policy-max-length"
                      type="number"
                      min={1}
                      className={`${INPUT} mt-1`}
                      value={heuristic.maxLength}
                      onChange={(event) =>
                        setHeuristic((c) => ({ ...c, maxLength: event.target.value }))
                      }
                      placeholder="No limit"
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className={LABEL} htmlFor="policy-confidence">
                        Block when confidence is at least
                      </label>
                      <select
                        id="policy-confidence"
                        className={`${INPUT} mt-1`}
                        value={context.minConfidence}
                        onChange={(event) =>
                          setContext((c) => ({
                            ...c,
                            minConfidence: event.target.value as Confidence,
                          }))
                        }
                      >
                        {CONFIDENCE_LEVELS.map((level) => (
                          <option key={level} value={level}>
                            {level.charAt(0).toUpperCase() + level.slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <p className={LABEL}>On classifier error</p>
                      <label className="mt-2 flex items-center gap-2 text-sm text-gray-900">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-secondary focus:ring-secondary/30"
                          checked={context.failClosed}
                          onChange={(event) =>
                            setContext((c) => ({ ...c, failClosed: event.target.checked }))
                          }
                        />
                        Fail closed (block the request)
                      </label>
                    </div>
                  </>
                )}
              </div>

              {type === "HEURISTIC" ? (
                <div>
                  <div className="flex items-center justify-between">
                    <p className={LABEL}>Rules</p>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-sm font-medium text-secondary hover:underline"
                      onClick={() =>
                        setHeuristic((c) => ({ ...c, rules: [...c.rules, emptyRule()] }))
                      }
                    >
                      <Plus className="h-4 w-4" /> Add rule
                    </button>
                  </div>
                  <div className="mt-2 overflow-x-auto rounded border border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500">
                        <tr>
                          <th className="w-[20%] px-3 py-2 font-medium">Rule ID</th>
                          <th className="w-[12%] px-3 py-2 font-medium">Mode</th>
                          <th className="px-3 py-2 font-medium">Pattern</th>
                          <th className="w-[18%] px-3 py-2 font-medium">On match</th>
                          <th className="w-10 px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {heuristic.rules.map((rule) => (
                          <tr key={rule.key} className="align-top">
                            <td className="px-3 py-2">
                              <input
                                className={`${INPUT} font-mono text-xs`}
                                value={rule.id}
                                onChange={(event) => updateRule(rule.key, { id: event.target.value })}
                                placeholder="ignore-instructions"
                                aria-label="Rule ID"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <select
                                className={INPUT}
                                value={rule.mode}
                                onChange={(event) =>
                                  updateRule(rule.key, { mode: event.target.value as RuleRow["mode"] })
                                }
                                aria-label="Match mode"
                              >
                                <option value="REGEX">Regex</option>
                                <option value="EXACT">Exact</option>
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                className={`${INPUT} font-mono text-xs`}
                                value={rule.pattern}
                                onChange={(event) =>
                                  updateRule(rule.key, { pattern: event.target.value })
                                }
                                placeholder="(?i)ignore (all|previous) instructions"
                                aria-label="Pattern"
                                spellCheck={false}
                              />
                              {rule.action === "redact" && (
                                <input
                                  className={`${INPUT} mt-2 text-xs`}
                                  value={rule.replacement}
                                  onChange={(event) =>
                                    updateRule(rule.key, { replacement: event.target.value })
                                  }
                                  placeholder="Replacement text"
                                  aria-label="Replacement text"
                                />
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <select
                                className={INPUT}
                                value={rule.action}
                                onChange={(event) =>
                                  updateRule(rule.key, { action: event.target.value as RuleAction })
                                }
                                aria-label="Action on match"
                              >
                                {RULE_ACTIONS.map((action) => (
                                  <option key={action.value} value={action.value}>
                                    {action.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-2">
                              <button
                                type="button"
                                className="mt-1.5 rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-red-700"
                                aria-label="Remove rule"
                                title="Remove rule"
                                onClick={() =>
                                  setHeuristic((c) => ({
                                    ...c,
                                    rules: c.rules.filter((item) => item.key !== rule.key),
                                  }))
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {heuristic.rules.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-500">
                              No rules yet. Add at least one.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-500">
                    Regex patterns use Python syntax; prefix with <code className="font-mono">(?i)</code> for
                    case-insensitive matching. Rules are evaluated in order.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <label className={LABEL} htmlFor="policy-instructions">
                      Instructions
                    </label>
                    <textarea
                      id="policy-instructions"
                      className={`${INPUT} mt-1 h-40 leading-6`}
                      value={context.instructions}
                      onChange={(event) =>
                        setContext((c) => ({ ...c, instructions: event.target.value }))
                      }
                      placeholder="You are a compliance classifier. Decide whether the text violates the policy below…"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      System instructions the classifier follows for every request.
                    </p>
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="policy-definitions">
                      Definitions and category map
                    </label>
                    <textarea
                      id="policy-definitions"
                      className={`${INPUT} mt-1 h-48 font-mono text-xs leading-5`}
                      value={context.definitions}
                      onChange={(event) =>
                        setContext((c) => ({ ...c, definitions: event.target.value }))
                      }
                      placeholder={"A. CATEGORY\n- A1: Definition…"}
                      spellCheck={false}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Categories the classifier can return. Category codes appear in alerts and audit logs.
                    </p>
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="policy-examples">
                      Examples
                    </label>
                    <textarea
                      id="policy-examples"
                      className={`${INPUT} mt-1 h-40 font-mono text-xs leading-5`}
                      value={context.examples}
                      onChange={(event) =>
                        setContext((c) => ({ ...c, examples: event.target.value }))
                      }
                      placeholder={'Input: "…"\nOutput: {"violation": 1, "policy_category": "A1", "confidence": "high", "rationale": "…"}'}
                      spellCheck={false}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Worked examples that steer the classifier toward the decisions you expect.
                    </p>
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="policy-stepup">
                      Step-up categories
                    </label>
                    <input
                      id="policy-stepup"
                      className={`${INPUT} mt-1 font-mono text-xs`}
                      value={context.stepUpCategories}
                      onChange={(event) =>
                        setContext((c) => ({ ...c, stepUpCategories: event.target.value }))
                      }
                      placeholder="A2, C1"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Comma-separated category codes that require approval instead of a block.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {error && <InlineNotice tone="error">{error}</InlineNotice>}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="button" className={BTN_PRIMARY} onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}

export function RuleTable({ config }: { config: Record<string, unknown> }) {
  const form = heuristicFromConfig(config);
  const hasRules = Array.isArray(config.rules) && config.rules.length > 0;
  if (!hasRules) return <p className="text-sm text-gray-500">No rules configured.</p>;
  return (
    <div className="overflow-x-auto rounded border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500">
          <tr>
            <th className="px-3 py-2 font-medium">Rule ID</th>
            <th className="px-3 py-2 font-medium">Mode</th>
            <th className="px-3 py-2 font-medium">Pattern</th>
            <th className="px-3 py-2 font-medium">On match</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {form.rules.map((rule) => (
            <tr key={rule.key}>
              <td className="px-3 py-2 font-mono text-xs text-gray-900">{rule.id}</td>
              <td className="px-3 py-2 text-gray-700">{rule.mode === "REGEX" ? "Regex" : "Exact"}</td>
              <td className="max-w-[520px] break-all px-3 py-2 font-mono text-xs text-gray-700">
                {rule.pattern}
              </td>
              <td className="px-3 py-2">
                <span className={TAG}>
                  {RULE_ACTIONS.find((item) => item.value === rule.action)?.label}
                  {rule.action === "redact" && ` → ${rule.replacement}`}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function contextSummary(config: Record<string, unknown>) {
  return contextFromConfig(config);
}

export function targetLabel(value: unknown) {
  return TARGETS.find((item) => item.value === value)?.label ?? "Last message";
}
