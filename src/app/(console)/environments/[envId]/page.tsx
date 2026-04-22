"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useConsole } from "src/app/(console)/console-context";
import {
  fetchAlerts,
  fetchAuditEvents,
  fetchGuardrailVersions,
  fetchGuardrails,
  fetchPolicies,
  fetchProjects,
  type Project,
} from "src/lib/api";
import {
  Activity,
  Bell,
  ChevronRight,
  FileText,
  FlaskConical,
  Folder,
  Shield,
} from "lucide-react";

const ALERT_COUNT_LIMIT = 500;
const AUDIT_EVENT_LIMIT = 500;
const numberFormatter = new Intl.NumberFormat("en-US");

type PageProps = {
  params: { envId: string };
};

type EnvironmentMetrics = {
  guardrails: number;
  policies: number;
  tests: number;
  alerts: number;
  recentOps: number;
};

const EMPTY_METRICS: EnvironmentMetrics = {
  guardrails: 0,
  policies: 0,
  tests: 0,
  alerts: 0,
  recentOps: 0,
};

export default function EnvironmentDetailPage({ params }: PageProps) {
  const { setSelectedEnvironment, tenantId } = useConsole();
  const [projects, setProjects] = useState<Project[]>([]);
  const [metrics, setMetrics] = useState<EnvironmentMetrics>(EMPTY_METRICS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const envName = params.envId.replace(/-/g, " ");

  useEffect(() => {
    setSelectedEnvironment(params.envId);

    if (!tenantId) {
      setProjects([]);
      setMetrics(EMPTY_METRICS);
      setError(null);
      setLoading(false);
      return;
    }

    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [projectsResult, auditResult] = await Promise.allSettled([
          fetchProjects(tenantId, params.envId),
          fetchAuditEvents(tenantId, {
            environment_id: params.envId,
            limit: AUDIT_EVENT_LIMIT,
          }),
        ]);

        if (!active) {
          return;
        }

        if (projectsResult.status === "rejected") {
          console.error(projectsResult.reason);
          setProjects([]);
          setMetrics(EMPTY_METRICS);
          setError("Unable to load environment data right now.");
          return;
        }

        const projectList = projectsResult.value;
        setProjects(projectList);

        let nextError: string | null =
          auditResult.status === "rejected"
            ? "Some environment activity could not be loaded right now."
            : null;

        if (projectList.length === 0) {
          setMetrics({
            ...EMPTY_METRICS,
            recentOps: auditResult.status === "fulfilled" ? auditResult.value.length : 0,
          });
          setError(nextError);
          return;
        }

        const guardrailResults = await Promise.allSettled(
          projectList.map((project) => fetchGuardrails(tenantId, params.envId, project.project_id))
        );

        if (!active) {
          return;
        }

        const guardrailRecords: Array<{ projectId: string; guardrailId: string }> = [];
        guardrailResults.forEach((result, index) => {
          if (result.status === "fulfilled") {
            result.value.forEach((guardrail) => {
              guardrailRecords.push({
                projectId: projectList[index].project_id,
                guardrailId: guardrail.guardrail_id,
              });
            });
            return;
          }

          console.error(result.reason);
          nextError = "Some environment metrics could not be loaded right now.";
        });

        const [policyResults, alertResults, versionResults] = await Promise.all([
          Promise.allSettled(
            projectList.map((project) => fetchPolicies(tenantId, params.envId, project.project_id))
          ),
          Promise.allSettled(
            projectList.map((project) =>
              fetchAlerts(tenantId, params.envId, project.project_id, ALERT_COUNT_LIMIT)
            )
          ),
          Promise.allSettled(
            guardrailRecords.map((guardrail) =>
              fetchGuardrailVersions(
                tenantId,
                params.envId,
                guardrail.projectId,
                guardrail.guardrailId
              )
            )
          ),
        ]);

        if (!active) {
          return;
        }

        const policyIds = new Set<string>();
        policyResults.forEach((result) => {
          if (result.status === "fulfilled") {
            result.value.forEach((policy) => {
              policyIds.add(policy.policy_id);
            });
            return;
          }

          console.error(result.reason);
          nextError = "Some environment metrics could not be loaded right now.";
        });

        const alertIds = new Set<string>();
        alertResults.forEach((result) => {
          if (result.status === "fulfilled") {
            result.value.forEach((alert) => {
              alertIds.add(alert.id);
            });
            return;
          }

          console.error(result.reason);
          nextError = "Some environment metrics could not be loaded right now.";
        });

        const testTargets = versionResults.reduce((total, result) => {
          if (result.status === "fulfilled") {
            return total + result.value.length;
          }

          console.error(result.reason);
          nextError = "Some environment metrics could not be loaded right now.";
          return total;
        }, 0);

        setMetrics({
          guardrails: guardrailRecords.length,
          policies: policyIds.size,
          tests: testTargets,
          alerts: alertIds.size,
          recentOps: auditResult.status === "fulfilled" ? auditResult.value.length : 0,
        });
        setError(nextError);
      } catch (err) {
        if (!active) {
          return;
        }

        console.error(err);
        setProjects([]);
        setMetrics(EMPTY_METRICS);
        setError("Unable to load environment data right now.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [params.envId, setSelectedEnvironment, tenantId]);

  const projectsHref = `/environments/${params.envId}/projects`;
  const firstProjectId = projects[0]?.project_id;
  const capabilityHref = (segment: "guardrails" | "policies" | "test" | "alerts") =>
    firstProjectId
      ? `/environments/${params.envId}/projects/${firstProjectId}/${segment}`
      : projectsHref;

  const sections = useMemo(
    () => [
      {
        title: "PROJECTS",
        count: projects.length,
        action: "Access Projects",
        href: projectsHref,
        icon: Folder,
        color: "text-secondary",
        bg: "bg-secondary/10",
      },
      {
        title: "GUARDRAILS",
        count: metrics.guardrails,
        action: "Access Guardrails",
        href: capabilityHref("guardrails"),
        icon: Shield,
        color: "text-secondary",
        bg: "bg-secondary/10",
      },
      {
        title: "POLICIES",
        count: metrics.policies,
        action: "Access Policies",
        href: capabilityHref("policies"),
        icon: FileText,
        color: "text-secondary",
        bg: "bg-secondary/10",
      },
      {
        title: "TEST",
        count: metrics.tests,
        action: "Access Test",
        href: capabilityHref("test"),
        icon: FlaskConical,
        color: "text-secondary",
        bg: "bg-secondary/10",
      },
      {
        title: "ALERTS",
        count: metrics.alerts,
        action: "Access Alerts",
        href: capabilityHref("alerts"),
        icon: Bell,
        color: "text-secondary",
        bg: "bg-secondary/10",
      },
    ],
    [
      firstProjectId,
      metrics.alerts,
      metrics.guardrails,
      metrics.policies,
      metrics.tests,
      params.envId,
      projects.length,
      projectsHref,
    ]
  );

  const statusLabel = loading ? "Syncing" : error ? "Partial Data" : "Live Status";
  const statusClassName = error
    ? "bg-amber-500 shadow-sm"
    : "bg-secondary shadow-accent";

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-secondary/70">
            SELECTED SCOPE
          </p>
          <h2 className="text-4xl font-bold text-gray-900 capitalize tracking-tight">
            {envName} Environment
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            System governance and security controls for the {envName} infrastructure.
          </p>
          {error && <p className="mt-2 text-xs text-amber-600">{error}</p>}
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] font-bold text-white transition-all ${statusClassName}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            {statusLabel}
          </span>
          <span className="flex items-center gap-2 rounded-full border border-secondary/15 bg-white px-4 py-1.5 text-[11px] font-bold text-gray-900 shadow-sm">
            <Activity className="h-3 w-3 text-secondary" />
            {loading ? "Loading activity" : `${numberFormatter.format(metrics.recentOps)} recent ops`}
          </span>
        </div>
      </header>

      <section>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:grid-cols-5">
          {sections.map((section) => (
            <div
              key={section.title}
              className="group rounded-xl border border-secondary/10 bg-white p-6 shadow-sm transition-all hover:border-secondary/25 hover:shadow-accent"
            >
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[10px] font-bold tracking-widest text-gray-400">
                  {section.title}
                </p>
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${section.bg} ${section.color}`}
                >
                  <section.icon className="h-4 w-4" />
                </div>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {loading ? "-" : numberFormatter.format(section.count)}
              </p>
              <Link
                href={section.href}
                className="mt-6 flex items-center gap-1 text-[11px] font-bold text-secondary hover:underline"
              >
                {section.action} <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <h3 className="text-lg font-bold text-gray-800">Select a Project</h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <div className="col-span-full animate-pulse py-12 text-center text-gray-400">
              Loading projects...
            </div>
          ) : projects.length === 0 ? (
            <div className="col-span-full py-12 text-center text-gray-400">
              No projects found.
            </div>
          ) : (
            projects.map((project) => (
              <Link
                key={project.project_id}
                href={`/environments/${params.envId}/projects/${project.project_id}`}
                className="group rounded-xl border border-secondary/10 bg-white p-6 shadow-sm transition-all hover:border-secondary/25 hover:shadow-accent"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-secondary/70">
                    PROD
                  </span>
                </div>
                <h4 className="text-lg font-bold uppercase text-gray-900 transition-colors group-hover:text-secondary">
                  {project.name}
                </h4>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-gray-400">
                  ID: {project.project_id}
                </p>
                <div className="mt-6 flex items-center gap-1 text-[11px] font-bold text-secondary transition-transform group-hover:translate-x-1">
                  Enter Workspace <ChevronRight className="h-3 w-3" />
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
