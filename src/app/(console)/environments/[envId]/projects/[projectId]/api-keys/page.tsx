"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, Copy, Plus } from "lucide-react";
import { useConsole } from "src/app/(console)/console-context";
import { createApiKey, fetchApiKeys, revokeApiKey, type ApiKeyResponse } from "src/lib/api";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  ConfirmDialog,
  EmptyState,
  INPUT,
  InlineNotice,
  LABEL,
  TAG,
  TAG_GREEN,
} from "src/app/(console)/console-ui";

const dateFormatter = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

const formatDate = (value: string | null | undefined) =>
  value ? dateFormatter.format(new Date(value)) : "—";

export default function ApiKeysPage() {
  const { tenantId } = useConsole();
  const { envId, projectId } = useParams() as { envId: string; projectId: string };

  const [keys, setKeys] = useState<ApiKeyResponse[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<ApiKeyResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const [pendingRevoke, setPendingRevoke] = useState<ApiKeyResponse | null>(null);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    let active = true;
    setListLoading(true);
    fetchApiKeys(tenantId, envId, projectId)
      .then((result) => {
        if (!active) return;
        setKeys(result);
        setError(null);
      })
      .catch((err) => {
        console.error(err);
        if (active) setError("Unable to load API keys.");
      })
      .finally(() => {
        if (active) setListLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tenantId, envId, projectId]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const openCreate = () => {
    setKeyName("");
    setCreateError(null);
    setNewKey(null);
    setCreateOpen(true);
  };

  const closeCreate = () => {
    if (creating) return;
    setCreateOpen(false);
    setNewKey(null);
  };

  const handleCreate = async () => {
    if (!tenantId) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createApiKey({
        tenant_id: tenantId,
        environment_id: envId,
        project_id: projectId,
        name: keyName.trim() || undefined,
      });
      setKeys((current) => [created, ...current]);
      setNewKey(created);
    } catch (err) {
      console.error(err);
      setCreateError("The key could not be created.");
    } finally {
      setCreating(false);
    }
  };

  const confirmRevoke = async () => {
    if (!tenantId || !pendingRevoke) return;
    setRevoking(true);
    try {
      const result = await revokeApiKey(tenantId, pendingRevoke.id);
      setKeys((current) =>
        current.map((item) => (item.id === result.id ? { ...item, revoked: result.revoked ?? true } : item))
      );
      setPendingRevoke(null);
    } catch (err) {
      console.error(err);
      setError("The key could not be revoked.");
      setPendingRevoke(null);
    } finally {
      setRevoking(false);
    }
  };

  const activeCount = keys.filter((key) => !key.revoked).length;
  const base = `/environments/${envId}/projects/${projectId}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-gray-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">API keys</h1>
          <p className="mt-1 text-sm text-gray-500">
            {listLoading ? "Loading…" : `${activeCount} active · ${keys.length - activeCount} revoked`} · {projectId}
          </p>
        </div>
        <button type="button" className={BTN_PRIMARY} onClick={openCreate}>
          <Plus className="h-4 w-4" /> Create API key
        </button>
      </header>

      {error && (
        <InlineNotice tone="error" onDismiss={() => setError(null)}>
          {error}
        </InlineNotice>
      )}

      <InlineNotice tone="info">
        Keys authenticate applications calling this project&apos;s guardrails; send them in the{" "}
        <code className="font-mono text-xs">X-Umai-Api-Key</code> header. The secret is shown once, at creation.
        See the{" "}
        <Link href={`${base}/implementation`} className="font-medium text-secondary hover:underline">
          Implementation
        </Link>{" "}
        page for examples.
      </InlineNotice>

      {!listLoading && keys.length === 0 ? (
        <EmptyState>No API keys yet. Create one to connect an application.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Key</th>
                <th className="px-4 py-2.5 font-medium">Created</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="w-24 px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {listLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    Loading API keys…
                  </td>
                </tr>
              ) : (
                keys.map((key) => (
                  <tr key={key.id} className={key.revoked ? "text-gray-400" : ""}>
                    <td className="px-4 py-3">
                      <p className={`font-medium ${key.revoked ? "text-gray-500" : "text-gray-900"}`}>
                        {key.name || "Untitled key"}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-gray-400">{key.id}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{key.key_preview || "••••"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDate(key.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className={key.revoked ? TAG : TAG_GREEN}>{key.revoked ? "Revoked" : "Active"}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!key.revoked && (
                        <button
                          type="button"
                          className="font-medium text-red-700 hover:underline"
                          onClick={() => setPendingRevoke(key)}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4"
          onClick={closeCreate}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={newKey ? "Save your API key" : "Create API key"}
            className="w-full max-w-lg rounded border border-gray-200 bg-white"
            onClick={(event) => event.stopPropagation()}
          >
            {!newKey ? (
              <>
                <div className="px-5 pt-5">
                  <h2 className="text-base font-semibold text-gray-900">Create API key</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Scoped to project <span className="font-mono text-xs">{projectId}</span> in environment{" "}
                    <span className="font-mono text-xs">{envId}</span>. It can call every guardrail in this project.
                  </p>
                  <div className="mt-4">
                    <label className={LABEL} htmlFor="api-key-name">
                      Name <span className="font-normal text-gray-400">(optional)</span>
                    </label>
                    <input
                      id="api-key-name"
                      className={`${INPUT} mt-1`}
                      value={keyName}
                      onChange={(event) => setKeyName(event.target.value)}
                      placeholder="e.g. Chatbot backend (prod)"
                      autoFocus
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !creating) void handleCreate();
                      }}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Name it after the application that will use it so revocation is easy later.
                    </p>
                  </div>
                  {createError && (
                    <div className="mt-4">
                      <InlineNotice tone="error">{createError}</InlineNotice>
                    </div>
                  )}
                </div>
                <div className="mt-5 flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
                  <button type="button" className={BTN_SECONDARY} onClick={closeCreate} disabled={creating}>
                    Cancel
                  </button>
                  <button type="button" className={BTN_PRIMARY} onClick={handleCreate} disabled={creating}>
                    {creating ? "Creating…" : "Create key"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="px-5 pt-5">
                  <h2 className="text-base font-semibold text-gray-900">Save your API key</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    This is the only time the full key is shown. Store it in your secret manager now.
                  </p>
                  <div className="mt-4 flex items-start gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-3">
                    <code className="min-w-0 flex-1 break-all font-mono text-xs text-gray-900">{newKey.api_key}</code>
                    <button
                      type="button"
                      className={`${BTN_SECONDARY} h-8 shrink-0 px-2.5`}
                      onClick={() =>
                        navigator.clipboard
                          .writeText(newKey.api_key ?? "")
                          .then(() => setCopied(true))
                          .catch(() => {})
                      }
                    >
                      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className={LABEL}>Name</dt>
                      <dd className="mt-0.5 text-gray-900">{newKey.name || "Untitled key"}</dd>
                    </div>
                    <div>
                      <dt className={LABEL}>Header</dt>
                      <dd className="mt-0.5 font-mono text-xs text-gray-900">X-Umai-Api-Key</dd>
                    </div>
                  </dl>
                </div>
                <div className="mt-5 flex justify-end border-t border-gray-200 px-5 py-3">
                  <button type="button" className={BTN_PRIMARY} onClick={closeCreate}>
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {pendingRevoke && (
        <ConfirmDialog
          title="Revoke API key?"
          confirmLabel="Revoke"
          danger
          busy={revoking}
          onCancel={() => (revoking ? undefined : setPendingRevoke(null))}
          onConfirm={confirmRevoke}
          body={
            <>
              <p>
                <span className="font-medium text-gray-900">{pendingRevoke.name || "Untitled key"}</span>{" "}
                (<span className="font-mono text-xs">{pendingRevoke.key_preview}</span>) stops working immediately;
                applications using it will receive 401 responses.
              </p>
              <p className="mt-2">This cannot be undone. Create a new key first if the application must keep running.</p>
            </>
          }
        />
      )}
    </div>
  );
}
