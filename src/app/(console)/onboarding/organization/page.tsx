"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useUser } from "src/lib/auth-client";
import { subscribeFree } from "src/lib/api";
import { useConsole } from "src/app/(console)/console-context";
import {
  loadTenantForUser,
  saveTenantForUser,
  type TenantBinding,
} from "src/lib/tenant-store";

const steps = [
  {
    title: "Organization",
    description: "Create your tenant and license",
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

export default function OrganizationOnboardingPage() {
  const router = useRouter();
  const { refreshTenant } = useConsole();
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const { user, isLoading } = useUser();

  const resolveNextStep = (tenant: TenantBinding | null) => {
    if (!tenant?.tenant_id) return null;
    if (!tenant.environment_id) return "/onboarding/environment";
    if (!tenant.project_id) return "/onboarding/project";
    return "/home";
  };

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      window.location.assign("/login");
      return;
    }
    if (user.sub) {
      const existing = loadTenantForUser(user.sub);
      const next = resolveNextStep(existing);
      if (next) {
        router.replace(next);
        return;
      }
    }
    setUserEmail(user.email || null);
  }, [router, user, isLoading]);

  const handleCreateOrg = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!orgName.trim()) {
      setError("Please enter an organization name.");
      return;
    }
    if (!user?.sub) {
      setError("Authentication session missing. Please sign in again.");
      return;
    }
    setLoading(true);
    try {
      const result = await subscribeFree({
        tenant_name: orgName.trim(),
        admin_email: userEmail || undefined,
      });
      saveTenantForUser(user.sub, {
        tenant_id: result.tenant_id,
        tenant_name: orgName.trim(),
        plan: result.plan,
        license_expires_at: result.license_expires_at,
      });
      refreshTenant();
      router.push("/onboarding/environment");
    } catch (err) {
      setError("Unable to create your organization. Please try again.");
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
          Welcome to UMAI Control Center
        </h1>
        <p className="text-sm text-slate">
          Let us create your organization, then we will guide you through environment
          and project setup inside the app.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-slate/10 bg-white p-8 shadow-soft">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate">
                Step 1 of 3
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">
                Create your organization
              </h2>
              <p className="mt-2 text-sm text-slate">
                We will issue a free 1-year license for this tenant.
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateOrg} className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-ink">
              Organization name
              <input
                type="text"
                placeholder="Acme Bank AI"
                value={orgName}
                onChange={(event) => setOrgName(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate/20 bg-white px-4 py-3 text-sm shadow-soft focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </label>
            {userEmail && (
              <div className="rounded-xl border border-slate/10 bg-slate/5 px-4 py-3 text-xs text-slate">
                Signed in as: <span className="font-semibold text-ink">{userEmail}</span>
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
              {loading ? "Creating organization..." : "Continue"}
            </button>
          </form>
        </section>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-slate/10 bg-white p-6 shadow-soft">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate">
              Setup progress
            </p>
            <div className="mt-4">
              <StepList currentStep={1} />
            </div>
          </div>

          <div className="rounded-3xl border border-slate/10 bg-white p-6 shadow-soft">
            <p className="text-sm font-semibold text-ink">Why this matters</p>
            <p className="mt-2 text-xs text-slate">
              Every tenant in UMAI has its own license, audit trail, and governance
              scope. This keeps your data separated from every other customer.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
