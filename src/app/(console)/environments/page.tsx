"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchEnvironments, Environment } from "src/lib/api";
import { useConsole } from "src/app/(console)/console-context";
import {
  Globe,
  Plus,
  ChevronRight,
  ArrowUpRight,
  ShieldCheck,
  Zap,
  Activity
} from "lucide-react";

const recommendations = [
  {
    title: "Environment Templates",
    detail: "Use curated blueprints to jump-start compliance-ready clusters.",
    icon: ShieldCheck
  },
  {
    title: "Incident Response",
    detail: "Connect PagerDuty or Slack for automated security playbooks.",
    icon: Zap
  },
  {
    title: "Policy Auditing",
    detail: "Schedule recurring tests for prompt injection and PII leaks.",
    icon: Activity
  },
];

export default function EnvironmentsPage() {
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const { tenantId } = useConsole();

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    fetchEnvironments(tenantId)
      .then((data: Environment[]) => {
        setEnvs(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        console.error(err);
        setLoading(false);
      });
  }, [tenantId]);

  return (
    <div className="space-y-10 fade-up">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">Infrastructure</p>
          <h2 className="font-display text-4xl font-bold text-ink tracking-tight">Environments</h2>
          <p className="mt-1 text-sm text-slate">
            Select an environment to configure localized governance, projects, and security boundaries.
          </p>
        </div>
        <button className="rounded-xl bg-accent px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent/90 hover:shadow-xl flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Environment
        </button>
      </header>

      <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {loading ? (
          <div className="col-span-full py-20 text-center animate-pulse text-slate/40 font-medium">
            Discovering cluster topology...
          </div>
        ) : envs.length === 0 ? (
          <div className="col-span-full py-20 text-center text-slate/40 font-medium">
            No environments discovered in this cluster.
          </div>
        ) : envs.map((env) => (
          <Link
            key={env.environment_id}
            href={`/environments/${env.environment_id}`}
            className="group flex flex-col justify-between rounded-3xl border border-slate/10 bg-white p-8 shadow-sm transition-all hover:-translate-y-1 hover:border-accent/30 hover:shadow-xl"
          >
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/40 group-hover:text-accent/60 transition-colors">Cluster</p>
                <span className="flex items-center gap-1.5 rounded-full bg-accent/5 px-2 py-0.5 text-[9px] font-bold text-accent italic">
                  <span className="h-1 w-1 rounded-full bg-accent animate-pulse" />
                  Healthy
                </span>
              </div>
              <h3 className="mt-4 font-display text-2xl font-bold text-ink">{env.name}</h3>
              <p className="mt-2 text-xs font-medium text-slate leading-relaxed">
                Managed environment resourceID: {env.environment_id}
              </p>
            </div>
            <div className="mt-10 flex items-center justify-between">
              <span className="text-[10px] font-bold text-accent group-hover:underline flex items-center gap-1">
                Access Settings <ChevronRight className="w-3 h-3" />
              </span>
              <div className="h-8 w-8 rounded-full bg-slate/5 flex items-center justify-center text-slate group-hover:bg-accent group-hover:text-white transition-all">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
          </Link>
        ))}
        {!loading && (
          <button className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate/10 p-8 transition-all hover:border-accent/40 hover:bg-accent/[0.02] group">
            <div className="h-12 w-12 rounded-2xl bg-slate/5 flex items-center justify-center text-slate mb-4 group-hover:scale-110 transition-transform">
              <Plus className="w-6 h-6" />
            </div>
            <p className="text-xs font-bold text-slate">Provision Environment</p>
          </button>
        )}
      </section>

      <section className="space-y-6">
        <h3 className="font-display text-xl font-bold text-ink text-center">Governance Insights</h3>
        <div className="grid gap-6 lg:grid-cols-3">
          {recommendations.map((item) => (
            <div
              key={item.title}
              className="rounded-3xl border border-slate/10 bg-white/40 p-8 shadow-sm transition-all hover:bg-white/80 group"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-slate/5 group-hover:bg-accent/5 transition-colors">
                  <item.icon className="w-4 h-4 text-slate group-hover:text-accent" />
                </div>
                <p className="text-sm font-bold text-ink">{item.title}</p>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate">{item.detail}</p>
              <button className="mt-6 text-[10px] font-bold text-accent hover:underline flex items-center gap-1">
                Read Documentation <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
