import type { ApplicationCategory, ApplicationRiskLevel } from "src/lib/api";

export const RISK_ORDER: ApplicationRiskLevel[] = ["critical", "high", "medium", "low", "none"];

export const RISK_COLORS: Record<ApplicationRiskLevel, string> = {
  critical: "#dc2626",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#3b82f6",
  none: "#94a3b8",
};

export const RISK_LABELS: Record<ApplicationRiskLevel, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "None",
};

export const CATEGORY_LABELS: Record<ApplicationCategory, string> = {
  llm_chat: "LLM Chat",
  code_assistant: "Code Assistant",
  image_gen: "Image Gen",
  ai_search: "AI Search",
  productivity: "Productivity",
  other: "Other",
};

export function riskBadgeClass(risk: ApplicationRiskLevel): string {
  switch (risk) {
    case "critical":
      return "border-red-200 bg-red-50 text-red-700";
    case "high":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "low":
      return "border-blue-200 bg-blue-50 text-blue-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

export function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}
