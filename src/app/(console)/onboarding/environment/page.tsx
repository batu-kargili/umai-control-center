"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useUser } from "src/lib/auth-client";
import { createEnvironment } from "src/lib/api";
import { useConsole } from "src/app/(console)/console-context";
import {
  loadTenantForUser,
  updateTenantForUser,
  type TenantBinding,
} from "src/lib/tenant-store";

const steps = [
  {
    title: "Organization",
    description: "Tenant created",
  },
  {
    title: "Environment",
    description: "Define a cluster boundary",
  },
  {
    title: "Project",
    description: "Start with your first project",
  },
];

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

function StepList({ currentStep }: { currentStep: number }) {
  return (
    <ul className="space-y-3">
      {steps.map((step, index) => {
        const stepNumber = index + 1;
        const isCurrent = stepNumber === currentStep;
        const isComplete = stepNumber < currentStep;
        return (
          <li
            key={step.title}
            className={`flex items-start gap-3 rounded-2xl border p-3 transition ${
              isCurrent
                ? "border-accent/40 bg-accent/5"
                : "border-slate/10 bg-white"
            }`}
          >
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                isComplete
                  ? "bg-ink text-white"
                  : isCurrent
                  ? "bg-accent text-white"
                  : "bg-slate/10 text-slate"
              }`}
            >
              {stepNumber}
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">{step.title}</p>
              <p className="text-xs text-slate">{step.description}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function EnvironmentOnboardingPage() {
  const router = useRouter();
  const { refreshTenant } = useConsole();
  const { user, isLoading } = useUser();
  const [tenant, setTenant] = useState<TenantBinding | null>(null);
  const [envName, setEnvName] = useState("");
  const [envId, setEnvId] = useState("");
  const [envIdDirty, setEnvIdDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!user?.sub) {
      window.location.assign("/login");
      return;
    }
    const existing = loadTenantForUser(user.sub);
    if (!existing?.tenant_id) {
      router.replace("/onboarding/organization");
      return;
    }
    if (existing.environment_id) {
      router.replace(existing.project_id ? "/home" : "/onboarding/project");
      return;
    }
    setTenant(existing);
  }, [isLoading, router, user]);

  useEffect(() => {
    if (envIdDirty) return;
    setEnvId(slugify(envName));
  }, [envIdDirty, envName]);

  const handleCreateEnvironment = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const name = envName.trim();
    const id = slugify(envId);
    if (!tenant?.tenant_id) {
      setError("Missing tenant. Please restart onboarding.");
      return;
    }
    if (!name) {
      setError("Please enter an environment name.");
      return;
    }
    if (!id) {
      setError("Please enter an environment id.");
      return;
    }
    setLoading(true);
    try {
      await createEnvironment({
        tenant_id: tenant.tenant_id,
        environment_id: id,
        name,
      });
      if (user?.sub) {
        updateTenantForUser(user.sub, { environment_id: id });
        refreshTenant();
      }
      router.push("/onboarding/project");
    } catch (err) {
      setError("Unable to create your environment. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate/60">
          Guided setup
        </p>
        <h1 className="font-display text-4xl font-bold text-ink">
          Define your environment
        </h1>
        <p className="text-sm text-slate">
          Environments separate policies, guardrails, and audit trails by cluster or
          deployment boundary.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-slate/10 bg-white p-8 shadow-soft">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate">
              Step 2 of 3
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">
              Create an environment
            </h2>
            <p className="mt-2 text-sm text-slate">
              Pick the cluster, region, or boundary you want to govern.
            </p>
          </div>

          <form onSubmit={handleCreateEnvironment} className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-ink">
              Environment name
              <input
                type="text"
                placeholder="Production Europe"
                value={envName}
                onChange={(event) => setEnvName(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate/20 bg-white px-4 py-3 text-sm shadow-soft focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </label>
            <label className="block text-sm font-medium text-ink">
              Environment id
              <input
                type="text"
                placeholder="prod-eu"
                value={envId}
                onChange={(event) => {
                  setEnvIdDirty(true);
                  setEnvId(slugify(event.target.value));
                }}
                className="mt-2 w-full rounded-xl border border-slate/20 bg-white px-4 py-3 text-sm shadow-soft focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </label>
            {tenant?.tenant_id && (
              <div className="rounded-xl border border-slate/10 bg-slate/5 px-4 py-3 text-xs text-slate">
                Tenant: <span className="font-semibold text-ink">{tenant.tenant_id}</span>
              </div>
            )}
            {error && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-600">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white shadow-lift transition hover:translate-y-[-1px] hover:bg-[#0b1322] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Creating environment..." : "Continue"}
            </button>
          </form>
        </section>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-slate/10 bg-white p-6 shadow-soft">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate">
              Setup progress
            </p>
            <div className="mt-4">
              <StepList currentStep={2} />
            </div>
          </div>

          <div className="rounded-3xl border border-slate/10 bg-white p-6 shadow-soft">
            <p className="text-sm font-semibold text-ink">Tip</p>
            <p className="mt-2 text-xs text-slate">
              Use environment ids like prod, staging, or region names to make routing
              and audit logs easy to scan.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
