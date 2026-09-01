"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Code2, Download, Globe, LayoutGrid, RefreshCw, Server } from "lucide-react";

import { useConsole } from "src/app/(console)/console-context";
import {
  type ApplicationsDashboard,
  type ApplicationRiskLevel,
  exportApplicationsCsv,
  fetchApplicationsDashboard,
} from "src/lib/api";
import { ApplicationsTable } from "./components/applications-table";
import { CatalogPanel } from "./components/catalog-panel";
import { CategoryBar } from "./components/category-bar";
import { EmptyTab } from "./components/empty-tab";
import { RiskDonut } from "./components/risk-donut";
import { TopAppCards } from "./components/top-app-cards";

type Tab = "applications" | "code-assistance" | "browser-extensions" | "mcp-servers";

const TABS: { id: Tab; label: string; icon: typeof LayoutGrid }[] = [
  { id: "applications", label: "Applications", icon: LayoutGrid },
  { id: "code-assistance", label: "Code assistance", icon: Code2 },
  { id: "browser-extensions", label: "Browser extensions", icon: Globe },
  { id: "mcp-servers", label: "MCP servers", icon: Server },
];

const DAY_OPTIONS = [7, 30, 90];

const EMPTY_RISK_DISTRIBUTION: Record<ApplicationRiskLevel, number> = {
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
  none: 0,
};

export default function ApplicationsPage() {
  const { tenantId } = useConsole();
  const [activeTab, setActiveTab] = useState<Tab>("applications");
  const [days, setDays] = useState(30);
  const [dashboard, setDashboard] = useState<ApplicationsDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const refresh = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      setDashboard(await fetchApplicationsDashboard(tenantId, days));
    } catch (err) {
      console.error(err);
      setError("Failed to load applications dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, days]);

  const onExport = async () => {
    if (!tenantId) return;
    setExporting(true);
    try {
      const content = await exportApplicationsCsv(tenantId, days);
      const blob = new Blob([content], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `umai-applications-${days}d.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError("Failed to export applications.");
    } finally {
      setExporting(false);
    }
  };

  const apps = dashboard?.apps ?? [];
  const codeAssistanceApps = useMemo(
    () => apps.filter((app) => app.category === "code_assistant"),
    [apps]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-secondary/70">Organization</p>
          <h2 className="font-display text-3xl text-ink">Applications</h2>
          <p className="text-sm text-slate">
            AI application usage by risk, category, and session activity.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCatalogOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-secondary/15 bg-white px-4 py-2 text-xs font-semibold text-secondary transition-colors hover:bg-secondary/5"
          >
            <BookOpen className="h-4 w-4" />
            Application catalog
          </button>
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="h-9 rounded-lg border border-secondary/15 bg-white px-3 text-xs text-ink focus:border-secondary/40 focus:outline-none"
          >
            {DAY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                Last {option} days
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void onExport()}
            disabled={exporting || !tenantId || apps.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-secondary/15 bg-white px-4 py-2 text-xs font-semibold text-secondary transition-colors hover:bg-secondary/5 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || !tenantId}
            className="inline-flex items-center gap-2 rounded-lg border border-secondary/15 bg-white px-4 py-2 text-xs font-semibold text-secondary transition-colors hover:bg-secondary/5 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-slate/10">
        {TABS.map((tab) => (
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

      {activeTab === "applications" ? (
        <div className="space-y-6">
          <section className="grid gap-4 xl:grid-cols-3">
            <RiskDonut distribution={dashboard?.risk_distribution ?? EMPTY_RISK_DISTRIBUTION} />
            <CategoryBar categories={dashboard?.category_totals ?? []} />
            <TopAppCards apps={apps} />
          </section>
          <ApplicationsTable apps={apps} />
        </div>
      ) : null}

      {activeTab === "code-assistance" ? (
        codeAssistanceApps.length > 0 ? (
          <ApplicationsTable apps={codeAssistanceApps} />
        ) : (
          <EmptyTab
            icon={Code2}
            title="No code assistant activity yet"
            description="Cursor, Windsurf, and GitHub Copilot usage will appear here once an ADR collector observes activity."
          />
        )
      ) : null}

      {activeTab === "browser-extensions" ? (
        <EmptyTab
          icon={Globe}
          title="Browser extensions coming soon"
          description="Extension-based AI usage will surface here once the browser extension catalog is wired up."
        />
      ) : null}

      {activeTab === "mcp-servers" ? (
        <EmptyTab
          icon={Server}
          title="MCP servers coming soon"
          description="MCP server usage tracking is planned for a future release."
        />
      ) : null}

      {catalogOpen && tenantId ? (
        <CatalogPanel
          tenantId={tenantId}
          onClose={() => setCatalogOpen(false)}
          onChanged={() => void refresh()}
        />
      ) : null}
    </div>
  );
}
