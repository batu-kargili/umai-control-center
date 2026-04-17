const sampleTenants = [
  { name: "Acme Bank", status: "Active", license: "Enterprise · 2026-12-31" },
  { name: "Orion Labs", status: "Active", license: "Trial · 2025-03-02" },
  { name: "Northwind", status: "Suspended", license: "Expired" },
];

export default function TenantsPage() {
  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate">Tenants</p>
          <h2 className="font-display text-3xl text-ink">Tenant Portfolio</h2>
          <p className="max-w-2xl text-sm text-slate">
            Manage organizations, review license state, and trace guardrail impact
            across environments.
          </p>
        </div>
        <button className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white shadow-soft">
          Create Tenant
        </button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-2xl border border-white/50 bg-white/70 p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg">Active Tenants</h3>
            <p className="text-xs text-slate">3 listed</p>
          </div>
          <div className="mt-4 grid gap-3">
            {sampleTenants.map((tenant) => (
              <div
                key={tenant.name}
                className="flex flex-col gap-2 rounded-xl border border-ink/10 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-ink">{tenant.name}</p>
                  <p className="text-xs text-slate">{tenant.license}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs ${
                    tenant.status === "Active"
                      ? "bg-mint/70 text-ink"
                      : "bg-danger/10 text-danger"
                  }`}
                >
                  {tenant.status}
                </span>
              </div>
            ))}
          </div>
        </section>

        <aside className="rounded-2xl border border-white/50 bg-white/70 p-5 shadow-soft">
          <p className="text-xs uppercase tracking-[0.3em] text-slate">Insights</p>
          <h3 className="mt-2 font-display text-lg">License Horizon</h3>
          <p className="mt-2 text-sm text-slate">
            2 tenants expire within 90 days. Schedule renewal and verify guardrail
            coverage before renewal approvals.
          </p>
          <div className="mt-4 rounded-xl border border-ink/10 bg-white px-4 py-3 text-xs text-slate">
            Risk posture: <span className="font-semibold text-ink">Stable</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
