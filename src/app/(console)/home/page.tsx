"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import {
  Globe,
  Folder,
  Shield,
  FileText,
  Bell,
  ChevronRight,
} from "lucide-react";

const numberFormatter = new Intl.NumberFormat("en-US");

export default function HomePage() {
  const { tenantId, tenant } = useConsole();
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [guardrailsCount, setGuardrailsCount] = useState(0);
  const [policiesCount, setPoliciesCount] = useState(0);
  const [alertsCount, setAlertsCount] = useState(0);
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
        if (!active) return;
        const projectLists = await Promise.all(
          environmentList.map((env) =>
            fetchProjects(tenantId, env.environment_id).catch(() => [])
          )
        );
        const projectList = projectLists.flat();

        const guardrailTotals = await Promise.all(
          projectList.map((project) =>
            fetchGuardrails(tenantId, project.environment_id, project.project_id)
              .then((items) => items.length)
              .catch(() => 0)
          )
        );

        const policyTotals = await Promise.all(
          projectList.map((project) =>
            fetchPolicies(tenantId, project.environment_id, project.project_id)
              .then((items) => items.length)
              .catch(() => 0)
          )
        );

        const alertTotals = await Promise.all(
          projectList.map((project) =>
            fetchAlerts(tenantId, project.environment_id, project.project_id, 25)
              .then((items) => items.length)
              .catch(() => 0)
          )
        );

        if (!active) return;
        setEnvs(environmentList);
        setProjects(projectList);
        setGuardrailsCount(guardrailTotals.reduce((sum, value) => sum + value, 0));
        setPoliciesCount(policyTotals.reduce((sum, value) => sum + value, 0));
        setAlertsCount(alertTotals.reduce((sum, value) => sum + value, 0));
      } catch (err) {
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

  const resourceOverview = useMemo(
    () => {
      const primaryEnvId = tenant?.environment_id || envs[0]?.environment_id;
      const projectHubHref = primaryEnvId ? `/environments/${primaryEnvId}/projects` : "/environments";

      return [
      {
        label: "Environments",
        value: envs.length,
        icon: Globe,
        color: "text-secondary",
        surface: "bg-secondary/10",
        href: "/environments",
      },
      {
        label: "Projects",
        value: projects.length,
        icon: Folder,
        color: "text-secondary",
        surface: "bg-secondary/10",
        href: projectHubHref,
      },
      {
        label: "Guardrails",
        value: guardrailsCount,
        icon: Shield,
        color: "text-secondary",
        surface: "bg-secondary/10",
        href: projectHubHref,
      },
      {
        label: "Policies",
        value: policiesCount,
        icon: FileText,
        color: "text-secondary",
        surface: "bg-secondary/10",
        href: projectHubHref,
      },
      {
        label: "Alerts",
        value: alertsCount,
        icon: Bell,
        color: "text-secondary",
        surface: "bg-secondary/10",
        href: projectHubHref,
      },
    ];
    },
    [envs, tenant?.environment_id, projects.length, guardrailsCount, policiesCount, alertsCount]
  );

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <header>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Welcome</h1>
        <p className="mt-2 text-sm text-slate">
          {tenant?.tenant_name || "Organization"} · Plan:{" "}
          <span className="font-semibold text-secondary">{tenant?.plan || "free"}</span>
        </p>
        {tenantId && (
          <p className="text-xs text-slate mt-2">
            Workspace tenant: <span className="font-semibold text-secondary">{tenantId}</span>
          </p>
        )}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </header>

      <section className="space-y-6">
        <h3 className="text-lg font-bold text-gray-800">Your resource overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {resourceOverview.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="group flex cursor-pointer items-start gap-4 rounded-xl border border-secondary/10 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-secondary/25 hover:shadow-accent"
            >
              <div
                className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.surface} ${item.color}`}
              >
                <item.icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500 transition-colors group-hover:text-secondary">
                    {item.label}
                  </span>
                </div>
                <p className="text-xl font-bold text-gray-900 mt-1">
                  {loading ? "—" : numberFormatter.format(item.value)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-800">Environments</h3>
            <Link href="/environments" className="text-xs font-semibold text-secondary transition-colors hover:text-secondary/80">
              Manage environments <ChevronRight className="inline w-3 h-3" />
            </Link>
          </div>
          <div className="bg-white border border-secondary/10 p-6 rounded-xl shadow-sm min-h-[240px] space-y-4">
            {loading ? (
              <div className="text-sm text-gray-400">Loading environments…</div>
            ) : envs.length === 0 ? (
              <div className="text-sm text-gray-500">
                No environments found. Create one to start configuring guardrails.
              </div>
            ) : (
              envs.map((env) => (
                <Link
                  key={env.environment_id}
                  href={`/environments/${env.environment_id}`}
                  className="flex items-center justify-between group rounded-xl px-2 py-1 transition-colors hover:bg-secondary/5"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 transition-colors group-hover:text-secondary">
                        {env.name}
                      </p>
                      <p className="text-xs text-gray-400">ID: {env.environment_id}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 transition-colors group-hover:text-secondary" />
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-800">Projects</h3>
            <Link href="/environments" className="text-xs font-semibold text-secondary transition-colors hover:text-secondary/80">
              View all projects <ChevronRight className="inline w-3 h-3" />
            </Link>
          </div>
          <div className="bg-white border border-secondary/10 p-6 rounded-xl shadow-sm min-h-[240px] space-y-4">
            {loading ? (
              <div className="text-sm text-gray-400">Loading projects…</div>
            ) : projects.length === 0 ? (
              <div className="text-sm text-gray-500">
                No projects found yet. Add your first project to manage guardrails.
              </div>
            ) : (
              projects.map((project) => (
                <Link
                  key={`${project.environment_id}:${project.project_id}`}
                  href={`/environments/${project.environment_id}/projects/${project.project_id}`}
                  className="flex items-center justify-between group rounded-xl px-2 py-1 transition-colors hover:bg-secondary/5"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                      <Folder className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 transition-colors group-hover:text-secondary">
                        {project.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {project.environment_id} / {project.project_id}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 transition-colors group-hover:text-secondary" />
                </Link>
              ))
            )}
          </div>
        </section>
      </div>

    </div>
  );
}
