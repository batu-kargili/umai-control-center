"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { applyLicenseToken, fetchLicense, License } from "src/lib/api";
import { useConsole } from "src/app/(console)/console-context";

type FeatureEntry = {
  key: string;
  value: string;
};

const formatValue = (value: unknown) => {
  if (value === null || value === undefined) return "n/a";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
};

export default function SettingsPage() {
  const [license, setLicense] = useState<License | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const { tenantId } = useConsole();

  const metadata = useMemo(() => {
    if (!license?.features_json || typeof license.features_json !== "object") {
      return null;
    }
    return license.features_json as Record<string, unknown>;
  }, [license]);

  const featureEntries = useMemo<FeatureEntry[]>(() => {
    const raw = metadata?.features;
    if (!raw || typeof raw !== "object") return [];
    return Object.entries(raw as Record<string, unknown>).map(([key, value]) => ({
      key,
      value: formatValue(value),
    }));
  }, [metadata]);

  const refreshLicense = () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchLicense(tenantId)
      .then((data) => {
        setLicense(data);
        setError(null);
      })
      .catch((err: Error) => {
        console.error(err);
        setError("Unable to load license status.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refreshLicense();
  }, [tenantId]);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setToken(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleApply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!token.trim()) {
      setError("Paste a license token or upload a license file.");
      return;
    }
    setApplying(true);
    try {
      const updated = await applyLicenseToken({ token: token.trim() });
      setLicense(updated);
      setToken("");
      setNotice("License applied successfully.");
    } catch (err) {
      console.error(err);
      setError("License apply failed. Verify the token and public key.");
    } finally {
      setApplying(false);
    }
  };

  const statusLabel = license ? license.status : "not configured";
  const expiresAt = license?.expires_at
    ? new Date(license.expires_at).toLocaleDateString()
    : "n/a";
  const licenseId =
    typeof metadata?.license_id === "string" ? metadata.license_id : "n/a";

  return (
    <div className="space-y-10 fade-up">
      <header className="flex flex-col gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">Settings</p>
        <h2 className="font-display text-4xl font-bold text-ink tracking-tight">
          Licensing & System
        </h2>
        <p className="text-sm text-slate">
          Upload signed license tokens and review entitlement status for this tenant.
        </p>
      </header>

      {error && (
        <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-xs text-danger">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-2xl border border-mint/40 bg-mint/20 px-4 py-3 text-xs text-ink">
          {notice}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <section className="rounded-3xl border border-slate/10 bg-white p-8 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl font-bold text-ink">Current License</h3>
            <button
              type="button"
              className="text-xs font-semibold text-accent"
              onClick={refreshLicense}
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-slate/50">
              Loading license status...
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              <div className="grid gap-4 text-xs text-slate sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/50">
                    Status
                  </p>
                  <p className="mt-2 text-sm font-semibold text-ink">{statusLabel}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/50">
                    Expires
                  </p>
                  <p className="mt-2 text-sm font-semibold text-ink">{expiresAt}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/50">
                    License ID
                  </p>
                  <p className="mt-2 text-sm font-semibold text-ink">{licenseId}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/50">
                    Tenant
                  </p>
                  <p className="mt-2 text-sm font-semibold text-ink">
                    {tenantId || "n/a"}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/50">
                  Entitlements
                </p>
                {featureEntries.length === 0 ? (
                  <div className="mt-3 rounded-2xl border border-slate/10 bg-slate/5 px-4 py-6 text-center text-xs text-slate/60">
                    No feature entitlements listed.
                  </div>
                ) : (
                  <div className="mt-3 grid gap-2">
                    {featureEntries.map((entry) => (
                      <div
                        key={entry.key}
                        className="flex items-center justify-between rounded-2xl border border-slate/10 bg-white px-4 py-3 text-xs text-slate"
                      >
                        <span className="font-semibold text-ink">{entry.key}</span>
                        <span>{entry.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <aside className="rounded-3xl border border-slate/10 bg-white p-8 shadow-sm">
          <h3 className="text-lg font-bold text-ink">Apply License Token</h3>
          <p className="mt-2 text-xs text-slate">
            Paste the signed license JSON or upload the license file.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleApply}>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
                License Token
              </label>
              <textarea
                className="h-40 w-full rounded-xl border border-slate/10 bg-white px-3 py-2 text-xs font-mono"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder='{"payload":{...},"signature":"..."}'
              />
            </div>

            <div className="rounded-2xl border border-slate/10 bg-slate/5 px-4 py-3 text-xs text-slate">
              <label className="flex items-center gap-2 font-semibold text-slate">
                <input type="file" accept=".json,.txt" onChange={handleFile} />
                Upload license file
              </label>
              <p className="mt-2 text-[11px] text-slate/60">
                Files are parsed locally in your browser. Tokens are sent to the service for verification.
              </p>
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90"
              disabled={applying}
            >
              {applying ? "Applying..." : "Apply License"}
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
