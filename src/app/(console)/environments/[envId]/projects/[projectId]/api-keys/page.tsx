"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useUser } from "src/lib/auth-client";
import { useConsole } from "src/app/(console)/console-context";
import { createApiKey, fetchApiKeys, revokeApiKey } from "src/lib/api";
import { Copy, ExternalLink, KeyRound, ShieldCheck, Trash2 } from "lucide-react";

interface ApiKeyRow {
  id: string;
  name: string;
  api_key?: string | null;
  key_preview?: string | null;
  created_at: string;
  created_by: string;
  revoked?: boolean;
}

const maskKey = (value?: string | null) => {
  if (!value) return "—";
  if (value.length <= 8) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

export default function ApiKeysPage() {
  const { tenantId } = useConsole();
  const { envId, projectId } = useParams() as { envId: string; projectId: string };
  const { user } = useUser();

  const [keyName, setKeyName] = useState("");
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<"create" | "show">("create");
  const [newKey, setNewKey] = useState<ApiKeyRow | null>(null);

  const createdBy = useMemo(() => {
    return user?.name || user?.email || "Current user";
  }, [user]);

  useEffect(() => {
    if (!tenantId) return;
    let active = true;
    const load = async () => {
      setListLoading(true);
      try {
        const result = await fetchApiKeys(tenantId, envId, projectId);
        if (!active) return;
        setKeys(
          result.map((item) => ({
            id: item.id,
            name: item.name || "API key",
            api_key: null,
            key_preview: item.key_preview || null,
            created_at: item.created_at || new Date().toISOString(),
            created_by: "—",
            revoked: item.revoked ?? false,
          }))
        );
      } catch (err) {
        if (!active) return;
        setError("Unable to load API keys.");
      } finally {
        if (active) setListLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [tenantId, envId, projectId]);

  const handleCreateKey = async () => {
    if (!tenantId) return;
    setError(null);
    setLoading(true);
    try {
      const result = await createApiKey({
        tenant_id: tenantId,
        environment_id: envId,
        project_id: projectId,
        name: keyName.trim() || undefined,
      });
      const name = keyName.trim() || `Project key ${keys.length + 1}`;
      const now = result.created_at || new Date().toISOString();
      const createdKey: ApiKeyRow = {
        id: result.id,
        name,
        api_key: result.api_key,
        key_preview: result.key_preview || null,
        created_at: now,
        created_by: createdBy,
        revoked: result.revoked ?? false,
      };
      setKeys((prev) => [createdKey, ...prev]);
      setNewKey(createdKey);
      setModalStep("show");
      setKeyName("");
    } catch (err) {
      setError("Unable to create API key. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (row: ApiKeyRow) => {
    if (!row.api_key) return;
    await navigator.clipboard.writeText(row.api_key);
    setCopiedId(row.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRevoke = async (row: ApiKeyRow) => {
    if (!tenantId) return;
    if (!confirm("Revoke this API key? This action cannot be undone.")) return;
    try {
      const result = await revokeApiKey(tenantId, row.id);
      setKeys((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? { ...item, revoked: result.revoked ?? true }
            : item
        )
      );
    } catch (err) {
      setError("Unable to revoke API key.");
    }
  };

  const openCreateModal = () => {
    setError(null);
    setModalStep("create");
    setNewKey(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (loading) return;
    setModalOpen(false);
  };

  const handleCopyNewKey = async () => {
    if (!newKey?.api_key) return;
    await navigator.clipboard.writeText(newKey.api_key);
    setCopiedId(newKey.id);
  };

  return (
    <div className="space-y-8 fade-up">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">Security</p>
          <h2 className="font-display text-4xl font-bold text-ink tracking-tight">API keys</h2>
          <p className="mt-2 text-sm text-slate max-w-2xl">
            You have permission to view and manage API keys for this project. Keys are shown once—store them securely.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-xs font-semibold text-white hover:bg-[#0b1322] disabled:opacity-60"
        >
          <KeyRound className="w-4 h-4" />
          Create new secret key
        </button>
      </header>

      <section className="rounded-3xl border border-slate/10 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Key management</p>
              <p className="text-xs text-slate">
                Create keys per project and keep them stored securely.
              </p>
            </div>
          </div>
        </div>
        {error && !modalOpen && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-600">
            {error}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate/10 bg-white shadow-sm">
        <div className="border-b border-slate/10 px-6 py-4">
          <div className="grid grid-cols-7 gap-4 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate/60">
            <span className="col-span-2">Name</span>
            <span>Status</span>
            <span>Secret key</span>
            <span>Created</span>
            <span>Last used</span>
            <span>Created by</span>
          </div>
        </div>
        <div className="divide-y divide-slate/10">
          {keys.length === 0 ? (
            <div className="px-6 py-10 text-sm text-slate">
              {listLoading ? "Loading API keys..." : "No API keys created yet. Generate a new key to get started."}
            </div>
          ) : (
            keys.map((row) => (
              <div
                key={row.id}
                className="grid grid-cols-7 gap-4 px-6 py-4 items-center text-sm"
              >
                <div className="col-span-2">
                  <p className="font-semibold text-ink">{row.name}</p>
                </div>
                <div className={`text-xs font-semibold ${row.revoked ? "text-slate" : "text-emerald-600"}`}>
                  {row.revoked ? "Revoked" : "Active"}
                </div>
                <div className="text-xs font-mono text-slate">
                  {maskKey(row.key_preview || row.api_key)}
                </div>
                <div className="text-xs text-slate">
                  {new Date(row.created_at).toLocaleDateString()}
                </div>
                <div className="text-xs text-slate">—</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate truncate max-w-[120px]">{row.created_by}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopy(row)}
                      className={`text-slate hover:text-ink ${row.api_key ? "" : "opacity-40 cursor-not-allowed"}`}
                      title="Copy key"
                      disabled={!row.api_key}
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      className={`text-slate hover:text-red-500 ${row.revoked ? "opacity-40 cursor-not-allowed" : ""}`}
                      title="Revoke key"
                      onClick={() => handleRevoke(row)}
                      disabled={row.revoked}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {copiedId === row.id && (
                  <div className="col-span-7 text-[10px] text-emerald-600 font-semibold">
                    Key copied to clipboard.
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-slate/60 backdrop-blur-sm"
            onClick={closeModal}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white text-ink shadow-soft border border-slate/10">
            {modalStep === "create" ? (
              <div className="p-6 space-y-5">
                <div>
                  <h3 className="text-lg font-semibold">Create new secret key</h3>
                  <p className="text-xs text-slate mt-2">
                    This API key is tied to your user and can make requests against this project.
                    If you are removed from the organization, this key will be disabled.
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate">Owned by</label>
                  <div className="inline-flex rounded-lg bg-slate/5 border border-slate/10 p-1 text-xs">
                    <span className="px-3 py-1 rounded-md bg-ink text-white font-semibold">You</span>
                    <span className="px-3 py-1 text-slate">Service account</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate">Name (optional)</label>
                  <input
                    value={keyName}
                    onChange={(event) => setKeyName(event.target.value)}
                    placeholder="My test key"
                    className="w-full rounded-lg border border-slate/20 bg-white px-3 py-2 text-sm text-ink placeholder-slate/50 focus:outline-none focus:ring-2 focus:ring-accent/20"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate">Project</label>
                  <div className="rounded-lg border border-slate/10 bg-slate/5 px-3 py-2 text-sm text-ink">
                    {projectId}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate">Permissions</label>
                  <div className="inline-flex rounded-lg bg-slate/5 border border-slate/10 p-1 text-xs">
                    <span className="px-3 py-1 rounded-md bg-ink text-white font-semibold">All</span>
                    <span className="px-3 py-1 text-slate">Restricted</span>
                    <span className="px-3 py-1 text-slate">Read only</span>
                  </div>
                </div>

                {error && (
                  <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
                    {error}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={closeModal}
                    className="rounded-lg bg-slate/10 px-4 py-2 text-xs font-semibold text-slate hover:text-ink"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateKey}
                    disabled={loading}
                    className="rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-white hover:bg-[#0b1322] disabled:opacity-60"
                  >
                    {loading ? "Creating..." : "Create secret key"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 space-y-5">
                <div>
                  <h3 className="text-lg font-semibold">Save your key</h3>
                  <p className="text-xs text-slate mt-2">
                    Please save your secret key in a safe place since you will not be able to view it again.
                    Keep it secure—anyone with this key can make requests on your behalf.
                  </p>
                </div>

                <a
                  href="#"
                  className="inline-flex items-center gap-1 text-xs text-slate hover:text-ink"
                >
                  Learn more about API key best practices <ExternalLink className="w-3 h-3" />
                </a>

                {newKey && (
                  <div className="rounded-lg border border-slate/10 bg-slate/5 px-3 py-3 text-sm text-ink flex items-center justify-between gap-2">
                    <code className="text-xs break-all">{newKey.api_key}</code>
                    <button
                      onClick={handleCopyNewKey}
                      className="inline-flex items-center gap-1 rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      <Copy className="w-3 h-3" /> Copy
                    </button>
                  </div>
                )}

                <div className="text-xs text-slate">
                  Permissions<br />
                  <span className="text-ink">Read and write API resources</span>
                </div>

                <div className="flex items-center justify-end">
                  <button
                    onClick={closeModal}
                    className="rounded-lg bg-slate/10 px-4 py-2 text-xs font-semibold text-slate hover:text-ink"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
