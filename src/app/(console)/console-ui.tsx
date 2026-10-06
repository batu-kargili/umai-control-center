"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

// Fluent/Carbon tarzı düz kontroller: 4 px köşe, gölgesiz, mavi yalnızca primary.
export const BTN_PRIMARY =
  "inline-flex h-9 items-center justify-center gap-2 rounded bg-secondary px-3.5 text-sm font-medium text-white transition hover:bg-secondary/90 disabled:cursor-not-allowed disabled:opacity-60";
export const BTN_OUTLINE =
  "inline-flex h-9 items-center justify-center gap-2 rounded border border-secondary bg-white px-3.5 text-sm font-medium text-secondary transition hover:bg-secondary/5 disabled:cursor-not-allowed disabled:opacity-60";
export const BTN_SECONDARY =
  "inline-flex h-9 items-center justify-center gap-2 rounded border border-gray-300 bg-white px-3.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60";
export const BTN_DANGER =
  "inline-flex h-9 items-center justify-center gap-2 rounded bg-danger px-3.5 text-sm font-medium text-white transition hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-60";
export const INPUT =
  "w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20 disabled:bg-gray-50 disabled:text-gray-500";
export const LABEL = "block text-xs font-medium text-gray-500";
// Araç çubuğu select'leri: içeriğe göre genişlik.
export const SELECT = INPUT.replace("w-full ", "");
export const TAG = "inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700";
export const TAG_BLUE =
  "inline-flex items-center rounded bg-secondary/10 px-1.5 py-0.5 text-xs font-medium text-secondary";
export const TAG_GREEN =
  "inline-flex items-center rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700";
export const TAG_RED = "inline-flex items-center rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700";

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      className="rounded p-0.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
      title={label ?? "Copy"}
      aria-label={label ?? `Copy ${value}`}
      onClick={(event) => {
        event.stopPropagation();
        navigator.clipboard
          .writeText(value)
          .then(() => setCopied(true))
          .catch(() => {});
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export type NoticeTone = "info" | "success" | "error";

export function InlineNotice({
  tone,
  children,
  onDismiss,
}: {
  tone: NoticeTone;
  children: ReactNode;
  onDismiss?: () => void;
}) {
  const styles: Record<NoticeTone, string> = {
    info: "border-secondary/30 bg-secondary/5 text-gray-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    error: "border-red-200 bg-red-50 text-red-800",
  };
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start justify-between gap-4 rounded border px-4 py-3 text-sm ${styles[tone]}`}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button
          type="button"
          className="shrink-0 text-xs font-medium text-gray-500 hover:text-gray-900"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4"
      onClick={busy ? undefined : onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded border border-gray-200 bg-white"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-5 pt-5">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <div className="mt-2 text-sm text-gray-600">{body}</div>
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button type="button" className={BTN_SECONDARY} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={danger ? BTN_DANGER : BTN_PRIMARY}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded border border-gray-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 bg-gray-50 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className={LABEL}>{label}</p>
      <div className="mt-1 text-sm text-gray-900">{children}</div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
      {children}
    </div>
  );
}

// Guardrail karar etiketleri (Test, Evaluation, Alerts…)
const DECISION_META: Record<string, { label: string; tag: string; panel: string }> = {
  ALLOW: {
    label: "Allowed",
    tag: "bg-emerald-50 text-emerald-700",
    panel: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  BLOCK: {
    label: "Blocked",
    tag: "bg-red-50 text-red-700",
    panel: "border-red-200 bg-red-50 text-red-800",
  },
  FLAG: {
    label: "Flagged",
    tag: "bg-amber-50 text-amber-800",
    panel: "border-amber-200 bg-amber-50 text-amber-800",
  },
  STEP_UP_APPROVAL: {
    label: "Approval required",
    tag: "bg-violet-50 text-violet-700",
    panel: "border-violet-200 bg-violet-50 text-violet-800",
  },
  ALLOW_WITH_MODIFICATIONS: {
    label: "Allowed with modifications",
    tag: "bg-secondary/10 text-secondary",
    panel: "border-secondary/30 bg-secondary/5 text-secondary",
  },
};

export function decisionLabel(action: string | null | undefined) {
  if (!action) return "—";
  return DECISION_META[action]?.label ?? action;
}

export function decisionPanelClass(action: string) {
  return DECISION_META[action]?.panel ?? "border-gray-200 bg-gray-50 text-gray-800";
}

export function DecisionTag({ action }: { action: string | null | undefined }) {
  if (!action) return <span className="text-gray-400">—</span>;
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${
        DECISION_META[action]?.tag ?? "bg-gray-100 text-gray-700"
      }`}
    >
      {decisionLabel(action)}
    </span>
  );
}
