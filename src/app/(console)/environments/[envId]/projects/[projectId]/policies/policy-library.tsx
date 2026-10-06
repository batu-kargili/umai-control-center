"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import type { PolicyLibraryItem, PolicyPhase } from "src/lib/api";
import { PHASE_LABELS, PHASE_OPTIONS } from "./policy-drafts";
import { INPUT, SELECT, InlineNotice, PhaseTags, TAG, TypeTag, typeLabel } from "./policy-ui";

type TypeFilter = "ALL" | "HEURISTIC" | "CONTEXT_AWARE";

interface PolicyLibraryProps {
  items: PolicyLibraryItem[];
  loading: boolean;
  error: string | null;
  deployedIds: Set<string>;
  deployingId: string | null;
  onDeploy: (item: PolicyLibraryItem) => void;
}

export function PolicyLibrary({
  items,
  loading,
  error,
  deployedIds,
  deployingId,
  onDeploy,
}: PolicyLibraryProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [phaseFilter, setPhaseFilter] = useState<PolicyPhase | "ALL">("ALL");
  const [tagFilter, setTagFilter] = useState<string>("ALL");
  const [hideDeployed, setHideDeployed] = useState(false);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((item) => (item.tags ?? []).forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [items]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (typeFilter !== "ALL" && item.type !== typeFilter) return false;
      if (phaseFilter !== "ALL" && !item.phases.includes(phaseFilter)) return false;
      if (tagFilter !== "ALL" && !(item.tags ?? []).includes(tagFilter)) return false;
      if (hideDeployed && deployedIds.has(item.default_policy_id)) return false;
      if (!query) return true;
      const haystack = [item.name, item.description ?? "", item.default_policy_id, ...(item.tags ?? [])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [deployedIds, hideDeployed, items, phaseFilter, search, tagFilter, typeFilter]);

  const deployedCount = items.filter((item) => deployedIds.has(item.default_policy_id)).length;

  return (
    <div className="space-y-4">
      {error && <InlineNotice tone="error">{error}</InlineNotice>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className={`${INPUT} pl-8`}
            placeholder="Search the library"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search the policy library"
          />
        </div>
        <select
          className={SELECT}
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
          aria-label="Filter by type"
        >
          <option value="ALL">All types</option>
          <option value="HEURISTIC">{typeLabel("HEURISTIC")}</option>
          <option value="CONTEXT_AWARE">{typeLabel("CONTEXT_AWARE")}</option>
        </select>
        <select
          className={SELECT}
          value={phaseFilter}
          onChange={(event) => setPhaseFilter(event.target.value as PolicyPhase | "ALL")}
          aria-label="Filter by phase"
        >
          <option value="ALL">All phases</option>
          {PHASE_OPTIONS.map((phase) => (
            <option key={phase} value={phase}>
              {PHASE_LABELS[phase]}
            </option>
          ))}
        </select>
        <select
          className={SELECT}
          value={tagFilter}
          onChange={(event) => setTagFilter(event.target.value)}
          aria-label="Filter by tag"
        >
          <option value="ALL">All tags</option>
          {tags.map(([tag, count]) => (
            <option key={tag} value={tag}>
              {tag} ({count})
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-secondary focus:ring-secondary/30"
            checked={hideDeployed}
            onChange={(event) => setHideDeployed(event.target.checked)}
          />
          Hide deployed
        </label>
      </div>

      <p className="text-xs text-gray-500">
        {loading
          ? "Loading library…"
          : `${filtered.length} of ${items.length} templates · ${deployedCount} already in this project`}
      </p>

      {!loading && filtered.length === 0 ? (
        <div className="rounded border border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-500">
          No templates match these filters.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => {
            const deployed = deployedIds.has(item.default_policy_id);
            const deploying = deployingId === item.template_id;
            return (
              <article
                key={item.template_id}
                className="flex flex-col rounded border border-gray-200 bg-white"
              >
                <div className="flex-1 px-5 pt-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold text-gray-900">{item.name}</h3>
                    <TypeTag type={item.type} />
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-gray-500">{item.default_policy_id}</p>
                  <p className="mt-3 text-sm leading-6 text-gray-600">
                    {item.description || "Ready-made protection from the UMAI library."}
                  </p>
                  <div className="mt-4">
                    <PhaseTags phases={item.phases} />
                  </div>
                  {(item.managed || (item.tags ?? []).length > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.managed && (
                        <span className={TAG} title="Maintained and updated by UMAI">
                          Managed
                        </span>
                      )}
                      {(item.tags ?? []).map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className={`${TAG} hover:bg-gray-200`}
                          onClick={() => setTagFilter(tag)}
                          title={`Filter by ${tag}`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-gray-200 px-5 py-3">
                  <span className="text-xs text-gray-500">
                    {item.type === "HEURISTIC" ? "Runs locally" : "Uses the guardrail LLM"}
                  </span>
                  {deployed ? (
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-gray-500">
                      <Check className="h-4 w-4 text-emerald-600" /> Deployed
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="text-sm font-semibold text-secondary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={deploying}
                      onClick={() => onDeploy(item)}
                    >
                      {deploying ? "Deploying…" : "Deploy"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
