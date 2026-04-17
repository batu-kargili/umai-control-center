"use client";

import { useConsole } from "src/app/(console)/console-context";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { fetchAlerts, fetchGuardrails, fetchPolicies, type AlertItem } from "src/lib/api";
import {
  Shield,
  FileText,
  FlaskConical,
  Bell,
  FileJson,
  Zap,
  KeyRound,
} from "lucide-react";

const numberFormatter = new Intl.NumberFormat("en-US");

export default function ProjectDetailPage() {
  const { tenantId } = useConsole();
  const params = useParams() as { envId: string; projectId: string };
  const projectId = params.projectId;
  const envId = params.envId;
  const projectName = projectId.replace(/-/g, " ");

  const [guardrailsCount, setGuardrailsCount] = useState(0);
  const [policiesCount, setPoliciesCount] = useState(0);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;

    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [guardrails, policies, recentAlerts] = await Promise.all([
          fetchGuardrails(tenantId, envId, projectId),
          fetchPolicies(tenantId, envId, projectId),
          fetchAlerts(tenantId, envId, projectId, 25),
        ]);
        if (!active) return;
        setGuardrailsCount(guardrails.length);
        setPoliciesCount(policies.length);
        setAlerts(recentAlerts);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [tenantId, envId, projectId]);

  const metrics = useMemo(
    () => [
      {
        label: "Guardrails",
        value: guardrailsCount,
        status: guardrailsCount > 0 ? "Active" : "None",
      },
      {
        label: "Policies",
        value: policiesCount,
        status: policiesCount > 0 ? "Configured" : "None",
      },
      {
        label: "Alerts (last 25)",
        value: alerts.length,
        status: alerts.length > 0 ? "Review" : "Clean",
      },
    ],
    [guardrailsCount, policiesCount, alerts.length]
  );

  return (
    <div className="space-y-10 fade-up">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-secondary/70">Project Detail</p>
          <h2 className="font-display text-4xl font-bold text-ink tracking-tight capitalize">{projectName}</h2>
          <p className="mt-2 text-sm text-slate">
            Managing guardrails, policies, and monitoring for {" "}
            <span className="font-bold text-secondary">{projectName}</span>.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href={`/environments/${envId}/projects/${projectId}/guardrails?agentic=1`}
            className="flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-ink/90"
          >
            <Shield className="w-4 h-4" /> AI Guardrail Builder
          </Link>
          <button className="flex items-center gap-2 rounded-xl border border-secondary/15 bg-white px-5 py-3 text-xs font-bold text-secondary shadow-sm transition hover:bg-secondary/5">
            <FileJson className="w-4 h-4" /> Export Logs
          </button>
          <button className="flex items-center gap-2 rounded-xl bg-secondary px-5 py-3 text-xs font-bold text-white shadow-accent transition hover:bg-secondary/90">
            <Zap className="w-4 h-4" /> Deploy Changes
          </button>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-3xl border border-secondary/10 bg-white p-8 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate/40">{metric.label}</p>
            <div className="mt-4 flex items-end justify-between">
              <p className="text-3xl font-bold text-ink">
                {loading ? "—" : numberFormatter.format(metric.value)}
              </p>
              <span className="text-xs font-bold text-secondary">{metric.status}</span>
            </div>
            <div className="mt-6 flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-secondary" />
              <p className="text-[10px] font-bold text-slate/60 capitalize">
                {loading ? "Loading" : "Live"}
              </p>
            </div>
          </div>
        ))}
      </div>

      <section className="rounded-3xl border border-secondary/10 bg-white p-8 shadow-sm space-y-4">
        <h3 className="text-lg font-bold text-ink">Recent alerts</h3>
        {loading ? (
          <div className="text-sm text-slate">Loading alerts…</div>
        ) : alerts.length === 0 ? (
          <div className="text-sm text-slate">No alerts detected for this project.</div>
        ) : (
          <div className="space-y-3">
            {alerts.slice(0, 5).map((alert) => (
              <div key={alert.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink">{alert.message}</p>
                  <p className="text-[11px] text-slate">
                    {alert.category} · {alert.severity} · {alert.phase}
                  </p>
                </div>
                <span className="text-[10px] text-secondary/70">{new Date(alert.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-secondary/10 bg-white p-10 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-lg font-bold text-ink">Project Capabilities</h3>
            <p className="mt-1 text-sm text-slate">Select a capability below to configure your workspace.</p>
          </div>
        </div>

        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Guardrails", href: "guardrails", icon: Shield, color: "text-secondary", bg: "bg-secondary/10" },
            { label: "Policies", href: "policies", icon: FileText, color: "text-secondary", bg: "bg-secondary/10" },
            { label: "Test", href: "test", icon: FlaskConical, color: "text-secondary", bg: "bg-secondary/10" },
            { label: "Alerts", href: "alerts", icon: Bell, color: "text-secondary", bg: "bg-secondary/10" },
            { label: "API Keys", href: "api-keys", icon: KeyRound, color: "text-secondary", bg: "bg-secondary/10" },
          ].map((cap) => (
            <Link
              key={cap.label}
              href={`/environments/${envId}/projects/${projectId}/${cap.href}`}
              className="group flex flex-col items-center justify-center rounded-2xl border border-secondary/10 bg-secondary/5 p-8 transition-all hover:border-secondary/25 hover:bg-white hover:shadow-accent"
            >
              <div className={`p-4 rounded-xl ${cap.bg} mb-4 group-hover:scale-110 transition-transform`}>
                <cap.icon className={`w-6 h-6 ${cap.color}`} />
              </div>
              <span className="text-sm font-bold uppercase tracking-tight text-slate-700 transition-colors group-hover:text-secondary">{cap.label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
