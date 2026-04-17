"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useConsole } from "src/app/(console)/console-context";
import { fetchProjects, Project } from "src/lib/api";
import {
  Globe,
  Folder,
  Shield,
  FileText,
  FlaskConical,
  Bell,
  ChevronRight,
  Activity,
  AlertCircle
} from "lucide-react";

type PageProps = {
  params: { envId: string };
};

export default function EnvironmentDetailPage({ params }: PageProps) {
  const { setSelectedEnvironment, tenantId } = useConsole();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const envName = params.envId.replace(/-/g, " ");

  useEffect(() => {
    setSelectedEnvironment(params.envId);

    if (!tenantId) {
      setLoading(false);
      return;
    }

    fetchProjects(tenantId, params.envId)
      .then((data) => {
        setProjects(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [params.envId, setSelectedEnvironment, tenantId]);

  const sections = [
    { title: "PROJECTS", count: projects.length.toString(), action: "Access Projects", href: `/environments/${params.envId}/projects`, icon: Folder, color: "text-secondary", bg: "bg-secondary/10" },
    { title: "GUARDRAILS", count: "12", action: "Access Guardrails", href: `/environments/${params.envId}/guardrails`, icon: Shield, color: "text-secondary", bg: "bg-secondary/10" },
    { title: "POLICIES", count: "28", action: "Access Policies", href: `/environments/${params.envId}/policies`, icon: FileText, color: "text-secondary", bg: "bg-secondary/10" },
    { title: "TEST", count: "8", action: "Access Test", href: `/environments/${params.envId}/test`, icon: FlaskConical, color: "text-secondary", bg: "bg-secondary/10" },
    { title: "ALERTS", count: "2", action: "Access Alerts", href: `/environments/${params.envId}/alerts`, icon: Bell, color: "text-secondary", bg: "bg-secondary/10" },
  ];

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-secondary/70">SELECTED SCOPE</p>
          <h2 className="text-4xl font-bold text-gray-900 capitalize tracking-tight">{envName} Environment</h2>
          <p className="mt-1 text-sm text-gray-500">
            System governance and security controls for the {envName} infrastructure.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 rounded-full bg-secondary px-4 py-1.5 text-[11px] font-bold text-white shadow-accent transition-all hover:bg-secondary/90">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            Live Status
          </span>
          <span className="rounded-full border border-secondary/15 bg-white px-4 py-1.5 text-[11px] font-bold text-gray-900 shadow-sm flex items-center gap-2">
            <Activity className="w-3 h-3 text-secondary" />
            2.4k ops/sec
          </span>
        </div>
      </header>

      {/* Summary Cards */}
      <section>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
          {sections.map((section) => (
            <div
              key={section.title}
              className="group rounded-xl border border-secondary/10 bg-white p-6 shadow-sm transition-all hover:border-secondary/25 hover:shadow-accent"
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-bold text-gray-400 tracking-widest">{section.title}</p>
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${section.bg} ${section.color}`}>
                  <section.icon className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-bold text-gray-900">{section.count}</p>
              <Link
                href={section.href}
                className="mt-6 flex items-center gap-1 text-[11px] font-bold text-secondary hover:underline"
              >
                {section.action} <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Project Selection / Related Projects */}
      <section className="space-y-6">
        <h3 className="text-lg font-bold text-gray-800">Select a Project</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            <div className="col-span-full py-12 text-center text-gray-400 animate-pulse">Loading projects...</div>
          ) : projects.length === 0 ? (
            <div className="col-span-full py-12 text-center text-gray-400">No projects found.</div>
          ) : (
            projects.map((project) => (
              <Link
                key={project.project_id}
                href={`/environments/${params.envId}/projects/${project.project_id}`}
                className="group rounded-xl border border-secondary/10 bg-white p-6 shadow-sm transition-all hover:border-secondary/25 hover:shadow-accent"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-[10px] text-secondary/70 font-bold uppercase tracking-widest">PROD</span>
                </div>
                <h4 className="text-lg font-bold uppercase text-gray-900 transition-colors group-hover:text-secondary">{project.name}</h4>
                <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider">ID: {project.project_id}</p>
                <div className="mt-6 flex items-center gap-1 text-[11px] font-bold text-secondary transition-transform group-hover:translate-x-1">
                  Enter Workspace <ChevronRight className="w-3 h-3" />
                </div>
              </Link>
            ))
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Governance Activity */}
        <section className="bg-white border border-secondary/10 p-8 rounded-xl shadow-sm space-y-6">
          <h3 className="text-xl font-bold text-gray-900">Recent Governance Activity</h3>
          <div className="space-y-4">
            {[
              "Production Prompt Injection Filter updated to v2.1",
              "PII Redaction policy audit completed",
              "New safety boundary added for GPT-4o deployments",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-4 rounded-xl border border-secondary/10 bg-secondary/5 p-4 text-sm font-medium text-gray-700"
              >
                <Activity className="w-4 h-4 shrink-0 text-secondary" />
                {item}
              </div>
            ))}
          </div>
        </section>

        {/* Compliance Alerts */}
        <section className="bg-red-50/20 border border-red-100 p-8 rounded-xl shadow-sm space-y-6">
          <h3 className="text-xl font-bold text-red-600 flex items-center gap-2">
            <AlertCircle className="w-6 h-6" /> Compliance Alerts
          </h3>
          <div className="space-y-4">
            <div className="bg-white border border-red-100 p-4 rounded-xl shadow-sm text-sm font-bold text-red-600 flex items-start gap-3">
              <span className="h-2 w-2 rounded-full bg-red-600 mt-1.5 shrink-0" />
              Critical: 12 potential PII leaks detected in {envName} logs.
            </div>
            <div className="bg-white border border-gray-100 p-4 rounded-xl shadow-sm text-sm font-medium text-gray-600 flex items-start gap-3">
              <span className="h-2 w-2 rounded-full bg-gray-300 mt-1.5 shrink-0" />
              Notice: Policy "GDPR-Standard" is pending review.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
