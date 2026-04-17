"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useUser } from "src/lib/auth-client";
import { createProject } from "src/lib/api";
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
    description: "Cluster defined",
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

export default function ProjectOnboardingPage() {
  const router = useRouter();
  const { refreshTenant } = useConsole();
  const { user, isLoading } = useUser();
  const [tenant, setTenant] = useState<TenantBinding | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectIdDirty, setProjectIdDirty] = useState(false);
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
    if (!existing.environment_id) {
      router.replace("/onboarding/environment");
      return;
    }
    if (existing.project_id) {
      router.replace("/home");
      return;
    }
    setTenant(existing);
  }, [isLoading, router, user]);

  useEffect(() => {
    if (projectIdDirty) return;
    setProjectId(slugify(projectName));
  }, [projectIdDirty, projectName]);

  const handleCreateProject = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const name = projectName.trim();
    const id = slugify(projectId);
    if (!tenant?.tenant_id || !tenant.environment_id) {
      setError("Missing tenant or environment. Please restart onboarding.");
      return;
    }
    if (!name) {
      setError("Please enter a project name.");
      return;
    }
    if (!id) {
      setError("Please enter a project id.");
      return;
    }
    setLoading(true);
    try {
      await createProject({
        tenant_id: tenant.tenant_id,
        environment_id: tenant.environment_id,
        project_id: id,
        name,
      });
      if (user?.sub) {
        updateTenantForUser(user.sub, { project_id: id });
        refreshTenant();
      }
      router.push("/home");
    } catch (err) {
      setError("Unable to create your project. Please try again.");
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
          Create your first project
        </h1>
        <p className="text-sm text-slate">
          Projects hold guardrails and policies inside a single environment boundary.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-slate/10 bg-white p-8 shadow-soft">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate">
              Step 3 of 3
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">
              Create a project
            </h2>
            <p className="mt-2 text-sm text-slate">
              Tie guardrails and policies to a single product or team.
            </p>
          </div>

          <form onSubmit={handleCreateProject} className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-ink">
              Project name
              <input
                type="text"
                placeholder="Retail AI Guardrails"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate/20 bg-white px-4 py-3 text-sm shadow-soft focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </label>
            <label className="block text-sm font-medium text-ink">
              Project id
              <input
                type="text"
                placeholder="retail-guardrails"
                value={projectId}
                onChange={(event) => {
                  setProjectIdDirty(true);
                  setProjectId(slugify(event.target.value));
                }}
                className="mt-2 w-full rounded-xl border border-slate/20 bg-white px-4 py-3 text-sm shadow-soft focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </label>
            {tenant?.environment_id && (
              <div className="rounded-xl border border-slate/10 bg-slate/5 px-4 py-3 text-xs text-slate">
                Environment: <span className="font-semibold text-ink">{tenant.environment_id}</span>
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
              {loading ? "Creating project..." : "Finish setup"}
            </button>
          </form>
        </section>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-slate/10 bg-white p-6 shadow-soft">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate">
              Setup progress
            </p>
            <div className="mt-4">
              <StepList currentStep={3} />
            </div>
          </div>

          <div className="rounded-3xl border border-slate/10 bg-white p-6 shadow-soft">
            <p className="text-sm font-semibold text-ink">What is next</p>
            <p className="mt-2 text-xs text-slate">
              You will land on Home with your environment ready. From there you can
              add guardrails, policies, and tests.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
