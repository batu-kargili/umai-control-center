"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import {
  APPLICATION_CATEGORY_OPTIONS,
  APPLICATION_RISK_OPTIONS,
  type ApplicationCatalogEntry,
  createApplicationCatalogEntry,
  deleteApplicationCatalogEntry,
  fetchApplicationCatalog,
  updateApplicationCatalogEntry,
} from "src/lib/api";
import { CATEGORY_LABELS, RISK_LABELS } from "./constants";

export function CatalogPanel({
  tenantId,
  onClose,
  onChanged,
}: {
  tenantId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [entries, setEntries] = useState<ApplicationCatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newDomains, setNewDomains] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      setEntries(await fetchApplicationCatalog(tenantId));
    } catch (err) {
      console.error(err);
      setError("Failed to load application catalog.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const patch = async (
    entry: ApplicationCatalogEntry,
    changes: Parameters<typeof updateApplicationCatalogEntry>[2]
  ) => {
    try {
      const updated = await updateApplicationCatalogEntry(tenantId, entry.app_id, changes);
      setEntries((prev) => prev.map((item) => (item.app_id === entry.app_id ? updated : item)));
      onChanged();
    } catch (err) {
      console.error(err);
      setError("Failed to update application.");
    }
  };

  const remove = async (entry: ApplicationCatalogEntry) => {
    try {
      const result = await deleteApplicationCatalogEntry(tenantId, entry.app_id);
      if (result.status === "deleted") {
        setEntries((prev) => prev.filter((item) => item.app_id !== entry.app_id));
      } else {
        setEntries((prev) =>
          prev.map((item) => (item.app_id === entry.app_id ? { ...item, enabled: false } : item))
        );
      }
      onChanged();
    } catch (err) {
      console.error(err);
      setError("Failed to remove application.");
    }
  };

  const create = async () => {
    if (!newName.trim() || !newSlug.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const domains = newDomains
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const created = await createApplicationCatalogEntry(tenantId, {
        slug: newSlug.trim().toLowerCase(),
        name: newName.trim(),
        domains,
      });
      setEntries((prev) => [created, ...prev]);
      setNewName("");
      setNewSlug("");
      setNewDomains("");
      onChanged();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to create application.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/35 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close application catalog"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <aside
        className="relative z-10 h-full w-full max-w-[640px] overflow-y-auto border-l border-secondary/10 bg-white p-5 shadow-2xl"
        aria-label="Application catalog"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-secondary/70">Applications</p>
            <h3 className="mt-1 font-display text-2xl text-ink">Application catalog</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-secondary/15 text-slate transition hover:bg-secondary/5"
            aria-label="Close application catalog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <div className="mb-5 space-y-2 rounded-lg border border-secondary/10 bg-slate/5 p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate/60">
            Add application
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Name"
              className="h-9 min-w-[140px] flex-1 rounded-lg border border-secondary/15 bg-white px-3 text-xs focus:border-secondary/40 focus:outline-none"
            />
            <input
              type="text"
              value={newSlug}
              onChange={(event) => setNewSlug(event.target.value)}
              placeholder="slug"
              className="h-9 w-32 rounded-lg border border-secondary/15 bg-white px-3 text-xs focus:border-secondary/40 focus:outline-none"
            />
            <input
              type="text"
              value={newDomains}
              onChange={(event) => setNewDomains(event.target.value)}
              placeholder="domains, comma-separated"
              className="h-9 min-w-[200px] flex-[2] rounded-lg border border-secondary/15 bg-white px-3 text-xs focus:border-secondary/40 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void create()}
              disabled={creating || !newName.trim() || !newSlug.trim()}
              className="h-9 rounded-lg bg-secondary px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {loading ? (
            <p className="text-sm text-slate">Loading...</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-slate">No applications in the catalog yet.</p>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.app_id}
                className={`rounded-lg border border-secondary/10 p-3 ${entry.enabled ? "" : "opacity-50"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{entry.name}</p>
                    <p className="truncate text-[11px] text-slate/60">
                      {entry.vendor || entry.slug}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={entry.category}
                      onChange={(event) =>
                        void patch(entry, {
                          category: event.target.value as ApplicationCatalogEntry["category"],
                        })
                      }
                      className="h-8 rounded-lg border border-secondary/15 bg-white px-2 text-[11px] focus:border-secondary/40 focus:outline-none"
                    >
                      {APPLICATION_CATEGORY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {CATEGORY_LABELS[option]}
                        </option>
                      ))}
                    </select>
                    <select
                      value={entry.risk_level}
                      onChange={(event) =>
                        void patch(entry, {
                          risk_level: event.target.value as ApplicationCatalogEntry["risk_level"],
                        })
                      }
                      className="h-8 rounded-lg border border-secondary/15 bg-white px-2 text-[11px] focus:border-secondary/40 focus:outline-none"
                    >
                      {APPLICATION_RISK_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {RISK_LABELS[option]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void patch(entry, { enabled: !entry.enabled })}
                      className="h-8 rounded-lg border border-secondary/15 bg-white px-2 text-[11px] font-semibold text-secondary hover:bg-secondary/5"
                    >
                      {entry.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(entry)}
                      className="h-8 rounded-lg border border-red-200 bg-white px-2 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                    >
                      {entry.source === "builtin" ? "Disable" : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
