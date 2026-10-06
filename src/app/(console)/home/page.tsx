"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useConsole } from "src/app/(console)/console-context";
import {
  fetchAlerts,
  fetchEnvironments,
  fetchGuardrails,
  fetchPolicies,
  fetchProjects,
  type Environment,
  type Project,
} from "src/lib/api";

const numberFormatter = new Intl.NumberFormat("en-US");

// Alerts endpoint'inin sayacı yok, en fazla 250 kayıt döner (created_at desc).
// Son 24 saat bu pencereden sayılır; pencere tamamen 24 saat içindeyse gerçek
// sayı daha büyük olabilir, o durumda "250+" gösterilir.
const ALERT_FETCH_LIMIT = 250;
const DAY_MS = 24 * 60 * 60 * 1000;

interface ProjectRow {
  environment: Environment;
  project: Project;
  guardrails: number;
  policies: number;
  alerts24h: number;
}

function formatCount(value: number, capped = false) {
  return capped ? `${numberFormatter.format(value)}+` : numberFormatter.format(value);
}

function planLabel(plan: string | null | undefined) {
  if (!plan) return null;
  return `${plan.charAt(0).toUpperCase()}${plan.slice(1)} plan`;
}

export default function HomePage() {
  const router = useRouter();
  const { tenantId, tenant } = useConsole();
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const environmentList = await fetchEnvironments(tenantId);
        const projectLists = await Promise.all(
          environmentList.map((env) =>
            fetchProjects(tenantId, env.environment_id).catch(() => [])
          )
        );
        const envById = new Map(environmentList.map((env) => [env.environment_id, env]));
        const since = Date.now() - DAY_MS;

        const projectRows = await Promise.all(
          projectLists.flat().map(async (project): Promise<ProjectRow> => {
            const [guardrails, policies, alerts] = await Promise.all([
              fetchGuardrails(tenantId, project.environment_id, project.project_id)
                .then((items) => items.length)
                .catch(() => 0),
              fetchPolicies(tenantId, project.environment_id, project.project_id)
                .then((items) => items.length)
                .catch(() => 0),
              fetchAlerts(tenantId, project.environment_id, project.project_id, ALERT_FETCH_LIMIT)
                .catch(() => []),
            ]);
            return {
              environment: envById.get(project.environment_id) ?? {
                tenant_id: tenantId,
                environment_id: project.environment_id,
                name: project.environment_id,
              },
              project,
              guardrails,
              policies,
              alerts24h: alerts.filter((alert) => Date.parse(alert.created_at) >= since).length,
            };
          })
        );

        if (!active) return;
        setEnvs(environmentList);
        setRows(projectRows);
      } catch {
        if (!active) return;
        setError("Unable to load workspace data right now.");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [tenantId]);

  const totals = useMemo(
    () => ({
      guardrails: rows.reduce((sum, row) => sum + row.guardrails, 0),
      policies: rows.reduce((sum, row) => sum + row.policies, 0),
      alerts24h: rows.reduce((sum, row) => sum + row.alerts24h, 0),
      alertsCapped: rows.some((row) => row.alerts24h >= ALERT_FETCH_LIMIT),
    }),
    [rows]
  );

  const primaryEnvId = tenant?.environment_id || envs[0]?.environment_id;
  const projectHubHref = primaryEnvId ? `/environments/${primaryEnvId}/projects` : "/environments";

  const stats = [
    { label: "Environments", value: formatCount(envs.length), href: "/environments" },
    { label: "Projects", value: formatCount(rows.length), href: projectHubHref },
    { label: "Guardrails", value: formatCount(totals.guardrails), href: projectHubHref },
    { label: "Policies", value: formatCount(totals.policies), href: projectHubHref },
    {
      label: "Alerts (24h)",
      value: formatCount(totals.alerts24h, totals.alertsCapped),
      href: projectHubHref,
    },
  ];

  const summary = [
    planLabel(tenant?.plan),
    !loading && `${envs.length} ${envs.length === 1 ? "environment" : "environments"}`,
    !loading && `${rows.length} ${rows.length === 1 ? "project" : "projects"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-8">
      <header className="border-b border-gray-200 pb-5">
        <h1 className="text-2xl font-semibold text-gray-900">
          {tenant?.tenant_name || "Organization"}
        </h1>
        {summary && <p className="mt-1 text-sm text-gray-500">{summary}</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </header>

      <section className="grid grid-cols-1 divide-y divide-gray-200 rounded border border-gray-200 bg-white sm:grid-cols-5 sm:divide-x sm:divide-y-0">
        {stats.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="px-5 py-4 transition-colors hover:bg-gray-50"
          >
            <p className="text-xs font-medium text-gray-500">{item.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
              {loading ? "—" : item.value}
            </p>
          </Link>
        ))}
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-gray-900">Projects</h2>
          <Link href="/environments" className="text-sm font-medium text-secondary hover:underline">
            Manage environments
          </Link>
        </div>
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Project</th>
                <th className="px-4 py-2.5 font-medium">Environment</th>
                <th className="px-4 py-2.5 text-right font-medium">Guardrails</th>
                <th className="px-4 py-2.5 text-right font-medium">Policies</th>
                <th className="px-4 py-2.5 text-right font-medium">Alerts (24h)</th>
                <th className="w-10 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    Loading projects…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No projects yet.{" "}
                    <Link href="/environments" className="font-medium text-secondary hover:underline">
                      Create one
                    </Link>{" "}
                    to start configuring guardrails.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const projectHref = `/environments/${row.project.environment_id}/projects/${row.project.project_id}`;
                  const envHref = `/environments/${row.project.environment_id}`;
                  return (
                    <tr
                      key={`${row.project.environment_id}:${row.project.project_id}`}
                      onClick={() => router.push(projectHref)}
                      className="cursor-pointer transition-colors hover:bg-gray-50"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={projectHref}
                          onClick={(event) => event.stopPropagation()}
                          className="font-medium text-gray-900 hover:text-secondary"
                        >
                          {row.project.name}
                        </Link>
                        {row.project.project_id !== row.project.name && (
                          <span className="ml-2 font-mono text-xs text-gray-400">
                            {row.project.project_id}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <Link
                          href={envHref}
                          onClick={(event) => event.stopPropagation()}
                          className="hover:text-secondary"
                        >
                          {row.environment.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                        {formatCount(row.guardrails)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                        {formatCount(row.policies)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                        {formatCount(row.alerts24h, row.alerts24h >= ALERT_FETCH_LIMIT)}
                      </td>
                      <td className="px-2 py-3 text-gray-400">
                        <ChevronRight className="h-4 w-4" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
