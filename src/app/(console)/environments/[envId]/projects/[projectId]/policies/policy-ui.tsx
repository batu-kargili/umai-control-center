"use client";

import type { Policy, PolicyPhase } from "src/lib/api";
import { TAG, TAG_BLUE, TAG_GREEN } from "src/app/(console)/console-ui";
import { PHASE_LABELS } from "./policy-drafts";

export * from "src/app/(console)/console-ui";

export function typeLabel(type: Policy["type"]) {
  return type === "HEURISTIC" ? "Heuristic" : "Context-aware";
}

export function typeHint(type: Policy["type"]) {
  return type === "HEURISTIC"
    ? "Pattern rules, evaluated locally in milliseconds."
    : "LLM classification against written instructions.";
}

export function TypeTag({ type }: { type: Policy["type"] }) {
  return (
    <span className={type === "HEURISTIC" ? TAG : TAG_BLUE} title={typeHint(type)}>
      {typeLabel(type)}
    </span>
  );
}

export function StatusTag({ enabled }: { enabled: boolean }) {
  return <span className={enabled ? TAG_GREEN : TAG}>{enabled ? "Enabled" : "Disabled"}</span>;
}

export function PhaseTags({ phases, max }: { phases: PolicyPhase[]; max?: number }) {
  const visible = max ? phases.slice(0, max) : phases;
  const rest = phases.length - visible.length;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {visible.map((phase) => (
        <span key={phase} className={TAG}>
          {PHASE_LABELS[phase]}
        </span>
      ))}
      {rest > 0 && (
        <span className={TAG} title={phases.slice(max).map((p) => PHASE_LABELS[p]).join(", ")}>
          +{rest}
        </span>
      )}
    </span>
  );
}

