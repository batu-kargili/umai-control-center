"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useConsole } from "src/app/(console)/console-context";
import { fetchApiKeys, fetchGuardrails, type ApiKeyResponse, type Guardrail } from "src/lib/api";
import { implementationGuides } from "src/lib/implementation-guides";
import { INPUT, LABEL, SectionCard, TAG } from "src/app/(console)/console-ui";
import { useImplementationContext } from "./use-implementation-context";

export default function ImplementationPage() {
  const { envId, projectId } = useParams() as { envId: string; projectId: string };
  const { tenantId } = useConsole();
  const { ctx, update, ready } = useImplementationContext(envId, projectId);
  const [guardrails, setGuardrails] = useState<Guardrail[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    let active = true;
    Promise.allSettled([fetchGuardrails(tenantId, envId, projectId), fetchApiKeys(tenantId, envId, projectId)])
      .then(([guardrailResult, keyResult]) => {
        if (!active) return;
        if (guardrailResult.status === "fulfilled") setGuardrails(guardrailResult.value);
        if (keyResult.status === "fulfilled") setApiKeys(keyResult.value.filter((key) => !key.revoked));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [envId, projectId, tenantId]);

  // Seçili guardrail yoksa (veya artık mevcut değilse) ilkine düş.
  useEffect(() => {
    if (!ready || guardrails.length === 0) return;
    if (!guardrails.some((item) => item.guardrail_id === ctx.guardrailId)) {
      update({ guardrailId: guardrails[0].guardrail_id });
    }
  }, [ctx.guardrailId, guardrails, ready, update]);

  const base = `/environments/${envId}/projects/${projectId}`;

  return (
    <div className="space-y-6">
      <header className="border-b border-gray-200 pb-5">
        <h1 className="text-2xl font-semibold text-gray-900">Implementation</h1>
        <p className="mt-1 text-sm text-gray-500">
          Connect applications and agents to this project&apos;s guardrails. Pick the integration that
          matches your stack; every guide uses the settings below.
        </p>
      </header>

      <SectionCard
        title="Before you start"
        description="These values are filled into every code example on this page."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className={LABEL} htmlFor="impl-endpoint">
              UMAI endpoint
            </label>
            <input
              id="impl-endpoint"
              className={`${INPUT} mt-1 font-mono text-xs`}
              value={ctx.endpoint}
              onChange={(event) => update({ endpoint: event.target.value.trim().replace(/\/+$/, "") })}
              placeholder="https://umai.example.com"
              spellCheck={false}
            />
            <p className="mt-1 text-xs text-gray-500">Base URL of the UMAI service your applications can reach.</p>
          </div>
          <div>
            <label className={LABEL} htmlFor="impl-guardrail">
              Guardrail
            </label>
            <select
              id="impl-guardrail"
              className={`${INPUT} mt-1`}
              value={ctx.guardrailId}
              onChange={(event) => update({ guardrailId: event.target.value })}
              disabled={loading || guardrails.length === 0}
            >
              {guardrails.length === 0 && <option value="">No guardrails yet</option>}
              {guardrails.map((guardrail) => (
                <option key={guardrail.guardrail_id} value={guardrail.guardrail_id}>
                  {guardrail.name} · v{guardrail.current_version}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">The current published version is what integrations hit.</p>
          </div>
          <div>
            <p className={LABEL}>API key</p>
            <p className="mt-1 text-sm text-gray-900">
              {loading ? "…" : `${apiKeys.length} active ${apiKeys.length === 1 ? "key" : "keys"}`}
            </p>
            <Link href={`${base}/api-keys`} className="mt-1 inline-block text-sm font-medium text-secondary hover:underline">
              Manage API keys →
            </Link>
            <p className="mt-1 text-xs text-gray-500">Sent as the X-Umai-Api-Key header. Keys are scoped to this project.</p>
          </div>
        </div>
      </SectionCard>

      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-900">Integrations</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {implementationGuides.map((guide) => (
            <Link
              key={guide.slug}
              href={`${base}/implementation/${guide.slug}`}
              className="group flex flex-col rounded border border-gray-200 bg-white transition hover:border-secondary"
            >
              <div className="flex-1 px-5 pt-5">
                <div className="flex items-start justify-between gap-3">
                  <Image
                    src={guide.logo}
                    alt={`${guide.title} logo`}
                    width={120}
                    height={40}
                    className="h-8 w-auto object-contain"
                  />
                  <span className={TAG}>{guide.category}</span>
                </div>
                <h3 className="mt-4 text-sm font-semibold text-gray-900">{guide.title}</h3>
                <p className="mt-1 text-sm leading-6 text-gray-600">{guide.description}</p>
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-gray-200 px-5 py-3 text-sm">
                <span className="text-xs text-gray-500">
                  {guide.kind === "sdk"
                    ? "Python · signed agent identity"
                    : guide.kind === "rest"
                      ? "HTTP · any language"
                      : guide.kind === "n8n"
                        ? "Workflow JSON"
                        : "Bridge deployment"}
                </span>
                <span className="inline-flex items-center gap-1 font-medium text-secondary group-hover:underline">
                  Open guide <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
