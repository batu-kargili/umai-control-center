"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useConsole } from "src/app/(console)/console-context";
import {
  fetchAlerts,
  fetchAuditEvents,
  fetchEnvironments,
  fetchGuardrails,
  fetchPolicies,
  fetchProjects,
  type Project,
} from "src/lib/api";

const numberFormatter = new Intl.NumberFormat("en-US");

// Alerts ve audit endpoint'lerinin sayacı yok; en yeni N kayıt çekilip 24 saatlik
// pencere sayılır. Pencere tamamen 24 saat içindeyse gerçek sayı daha büyük
// olabilir, o durumda "N+" gösterilir.
const ALERT_FETCH_LIMIT = 250;
const AUDIT_FETCH_LIMIT = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

type PageProps = {
  params: { envId: string };
};

interface ProjectRow {
  project: Project;
  guardrails: number;
  policies: number;
  alerts24h: number;
}

function formatCount(value: number, capped = false) {
  return capped ? `${numberFormatter.format(value)}+` : numberFormatter.format(value);
}

function countSince(items: Array<{ created_at: string }>, since: number) {
  return items.filter((item) => Date.parse(item.created_at) >= since).length;
}

export default function EnvironmentDetailPage({ params }: PageProps) {
  const router = useRouter();
  const { setSelectedEnvironment, tenantId } = useConsole();
  const [envName, setEnvName] = useState<string | null>(null);
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [audit24h, setAudit24h] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedEnvironment(params.envId);

    if (!tenantId) {
      setRows([]);
      setLoading(false);
      return;
    }

    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const since = Date.now() - DAY_MS;
        let partial = false;
        const markPartial = <T,>(fallback: T) => () => {
          partial = true;
          return fallback;
        };

        const [environments, projectList, auditEvents] = await Promise.all([
          fetchEnvironments(tenantId).catch(markPartial([])),
          fetchProjects(tenantId, params.envId),
          fetchAuditEvents(tenantId, {
            environment_id: params.envId,
            limit: AUDIT_FETCH_LIMIT,
          }).catch(markPartial([])),
        ]);

        const projectRows = await Promise.all(
          projectList.map(async (project): Promise<ProjectRow> => {
            const [guardrails, policies, alerts] = await Promise.all([
              fetchGuardrails(tenantId, params.envId, project.project_id)
                .then((items) => items.length)
                .catch(markPartial(0)),
              fetchPolicies(tenantId, params.envId, project.project_id)
                .then((items) => items.length)
                .catch(markPartial(0)),
              fetchAlerts(tenantId, params.envId, project.project_id, ALERT_FETCH_LIMIT)
                .catch(markPartial([])),
            ]);
            return { project, guardrails, policies, alerts24h: countSince(alerts, since) };
          })
        );

        if (!active) return;
        setEnvName(
          environments.find((env) => env.environment_id === params.envId)?.name ?? null
        );
        setRows(projectRows);
        setAudit24h(countSince(auditEvents, since));
        setError(partial ? "Some metrics could not be loaded." : null);
      } catch (err) {
        if (!active) return;
        console.error(err);
        setRows([]);
        setError("Unable to load environment data right now.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [params.envId, setSelectedEnvironment, tenantId]);

  const projectsHref = `/environments/${params.envId}/projects`;
  const firstProjectId = rows[0]?.project.project_id;
  const capabilityHref = (segment: "guardrails" | "policies" | "alerts") =>
    firstProjectId
      ? `/environments/${params.envId}/projects/${firstProjectId}/${segment}`
      : projectsHref;

  const totals = {
    guardrails: rows.reduce((sum, row) => sum + row.guardrails, 0),
    policies: rows.reduce((sum, row) => sum + row.policies, 0),
    alerts24h: rows.reduce((sum, row) => sum + row.alerts24h, 0),
    alertsCapped: rows.some((row) => row.alerts24h >= ALERT_FETCH_LIMIT),
  };

  const stats = [
    { label: "Projects", value: formatCount(rows.length), href: projectsHref },
    { label: "Guardrails", value: formatCount(totals.guardrails), href: capabilityHref("guardrails") },
    { label: "Policies", value: formatCount(totals.policies), href: capabilityHref("policies") },
    {
      label: "Alerts (24h)",
      value: formatCount(totals.alerts24h, totals.alertsCapped),
      href: capabilityHref("alerts"),
    },
    {
      label: "Audit events (24h)",
      value: formatCount(audit24h, audit24h >= AUDIT_FETCH_LIMIT),
      href: "/events",
    },
  ];

  const title = envName ?? params.envId;
  const summary = [
    envName && envName !== params.envId && `ID: ${params.envId}`,
    !loading && `${rows.length} ${rows.length === 1 ? "project" : "projects"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-8">
      <header className="border-b border-gray-200 pb-5">
        <p className="text-xs font-medium text-gray-500">Environment</p>
        <h1 className="mt-0.5 text-2xl font-semibold text-gray-900">{title}</h1>
        {summary && <p className="mt-1 text-sm text-gray-500">{summary}</p>}
        {error && <p className="mt-2 text-sm text-amber-700">{error}</p>}
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
          <Link href={projectsHref} className="text-sm font-medium text-secondary hover:underline">
            Manage projects
          </Link>
        </div>
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Project</th>
                <th className="px-4 py-2.5 text-right font-medium">Guardrails</th>
                <th className="px-4 py-2.5 text-right font-medium">Policies</th>
                <th className="px-4 py-2.5 text-right font-medium">Alerts (24h)</th>
                <th className="w-10 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    Loading projects…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No projects in this environment.{" "}
                    <Link href={projectsHref} className="font-medium text-secondary hover:underline">
                      Create one
                    </Link>{" "}
                    to start configuring guardrails.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const projectHref = `/environments/${params.envId}/projects/${row.project.project_id}`;
                  return (
                    <tr
                      key={row.project.project_id}
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
