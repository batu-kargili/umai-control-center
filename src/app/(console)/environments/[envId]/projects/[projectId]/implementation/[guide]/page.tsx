"use client";

import Image from "next/image";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, KeyRound } from "lucide-react";
import { useConsole } from "src/app/(console)/console-context";
import {
  createAgentBootstrapToken,
  fetchGuardrails,
  upsertAgentRegistry,
  type AgentBootstrapTokenResponse,
  type Guardrail,
} from "src/lib/api";
import { findGuide } from "src/lib/implementation-guides";
import {
  BTN_PRIMARY,
  CopyButton,
  INPUT,
  InlineNotice,
  LABEL,
  SectionCard,
  TAG,
} from "src/app/(console)/console-ui";
import { buildGuideContent, type GuideSnippet } from "../guide-content";
import { useImplementationContext } from "../use-implementation-context";

function CodeBlock({ snippet }: { snippet: GuideSnippet }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <div className="overflow-hidden rounded border border-gray-200">
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2">
        <span className="font-mono text-xs text-gray-600">{snippet.filename}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
          onClick={() =>
            navigator.clipboard
              .writeText(snippet.code)
              .then(() => setCopied(true))
              .catch(() => {})
          }
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-[640px] overflow-auto bg-gray-900 px-4 py-4 font-mono text-xs leading-5 text-gray-100">
        {snippet.code}
      </pre>
    </div>
  );
}

export default function ImplementationGuidePage() {
  const { envId, projectId, guide: slug } = useParams() as {
    envId: string;
    projectId: string;
    guide: string;
  };
  const guide = findGuide(slug);
  if (!guide) notFound();

  const { tenantId } = useConsole();
  const { ctx, update, ready } = useImplementationContext(envId, projectId);
  const [guardrails, setGuardrails] = useState<Guardrail[]>([]);
  const [activeSnippet, setActiveSnippet] = useState(0);

  const [agentIdDraft, setAgentIdDraft] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<AgentBootstrapTokenResponse | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    let active = true;
    fetchGuardrails(tenantId, envId, projectId)
      .then((items) => {
        if (active) setGuardrails(items);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [envId, projectId, tenantId]);

  useEffect(() => {
    if (!ready || guardrails.length === 0) return;
    if (!guardrails.some((item) => item.guardrail_id === ctx.guardrailId)) {
      update({ guardrailId: guardrails[0].guardrail_id });
    }
  }, [ctx.guardrailId, guardrails, ready, update]);

  const content = useMemo(
    () =>
      buildGuideContent(guide.slug, {
        endpoint: ctx.endpoint,
        guardrailId: ctx.guardrailId || "<guardrail-id>",
        agentId: ctx.agentId || "support-agent",
        projectId,
      }),
    [ctx.agentId, ctx.endpoint, ctx.guardrailId, guide.slug, projectId]
  );
  if (!content) notFound();

  const snippet = content.snippets[Math.min(activeSnippet, content.snippets.length - 1)];
  const base = `/environments/${envId}/projects/${projectId}`;
  const agentIdValue = agentIdDraft ?? ctx.agentId;

  const mintBootstrapToken = async () => {
    if (!tenantId) return;
    const agentId = agentIdValue.trim();
    if (!/^[a-z0-9][a-z0-9-_]*$/.test(agentId)) {
      setMintError("Agent ID must use lowercase letters, numbers, dashes or underscores.");
      return;
    }
    setMinting(true);
    setMintError(null);
    try {
      update({ agentId });
      await upsertAgentRegistry({
        tenant_id: tenantId,
        environment_id: envId,
        project_id: projectId,
        agent_id: agentId,
        display_name: agentId,
        runtime: guide.runtime ?? "generic",
      });
      setBootstrap(
        await createAgentBootstrapToken({
          tenant_id: tenantId,
          environment_id: envId,
          project_id: projectId,
          agent_id: agentId,
          expires_in_seconds: 900,
        })
      );
    } catch (err) {
      console.error(err);
      setMintError("The bootstrap token could not be created.");
    } finally {
      setMinting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="border-b border-gray-200 pb-5">
        <Link
          href={`${base}/implementation`}
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-secondary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Implementation
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <Image src={guide.logo} alt={`${guide.title} logo`} width={120} height={40} className="h-8 w-auto object-contain" />
          <h1 className="text-2xl font-semibold text-gray-900">{guide.title}</h1>
          <span className={TAG}>{guide.category}</span>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-gray-600">{content.summary}</p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="space-y-6">
          <SectionCard title="How it works">
            <ol className="space-y-3">
              {content.steps.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm text-gray-700">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <span className="leading-6">{step}</span>
                </li>
              ))}
            </ol>
          </SectionCard>

          <section className="rounded border border-gray-200 bg-white">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 bg-gray-50 px-5 pt-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Example</h2>
                <div className="mt-2 flex gap-5" role="tablist">
                  {content.snippets.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={index === activeSnippet}
                      onClick={() => setActiveSnippet(index)}
                      className={`-mb-px border-b-2 pb-2 text-sm font-medium transition ${
                        index === activeSnippet
                          ? "border-secondary text-gray-900"
                          : "border-transparent text-gray-500 hover:text-gray-900"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-5">
              <CodeBlock snippet={snippet} />
            </div>
          </section>

          <SectionCard title="Good to know">
            <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-gray-700">
              {content.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </SectionCard>
        </div>

        <aside className="space-y-6">
          <SectionCard title="Settings" description="Filled into the example on the left.">
            <div className="space-y-4">
              <div>
                <label className={LABEL} htmlFor="guide-endpoint">
                  UMAI endpoint
                </label>
                <input
                  id="guide-endpoint"
                  className={`${INPUT} mt-1 font-mono text-xs`}
                  value={ctx.endpoint}
                  onChange={(event) => update({ endpoint: event.target.value.trim().replace(/\/+$/, "") })}
                  spellCheck={false}
                />
              </div>
              <div>
                <label className={LABEL} htmlFor="guide-guardrail">
                  Guardrail
                </label>
                <select
                  id="guide-guardrail"
                  className={`${INPUT} mt-1`}
                  value={ctx.guardrailId}
                  onChange={(event) => update({ guardrailId: event.target.value })}
                  disabled={guardrails.length === 0}
                >
                  {guardrails.length === 0 && <option value="">No guardrails yet</option>}
                  {guardrails.map((guardrail) => (
                    <option key={guardrail.guardrail_id} value={guardrail.guardrail_id}>
                      {guardrail.name} · v{guardrail.current_version}
                    </option>
                  ))}
                </select>
                {ctx.guardrailId && (
                  <p className="mt-1 flex items-center gap-1 font-mono text-xs text-gray-500">
                    {ctx.guardrailId}
                    <CopyButton value={ctx.guardrailId} label="Copy guardrail ID" />
                  </p>
                )}
              </div>
              <div>
                <p className={LABEL}>API key</p>
                <Link href={`${base}/api-keys`} className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-secondary hover:underline">
                  <KeyRound className="h-4 w-4" /> Manage API keys
                </Link>
              </div>
            </div>
          </SectionCard>

          {guide.kind === "sdk" && (
            <SectionCard
              title="Agent identity"
              description="The SDK signs every call with a key pair registered through a one-time bootstrap token."
            >
              <div className="space-y-3">
                <div>
                  <label className={LABEL} htmlFor="guide-agent-id">
                    Agent ID
                  </label>
                  <input
                    id="guide-agent-id"
                    className={`${INPUT} mt-1 font-mono text-xs`}
                    value={agentIdValue}
                    onChange={(event) => setAgentIdDraft(event.target.value)}
                    onBlur={() => {
                      if (agentIdDraft !== null) update({ agentId: agentIdDraft.trim() || "support-agent" });
                    }}
                    placeholder="support-agent"
                    spellCheck={false}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Registered with runtime <span className="font-mono">{guide.runtime}</span>; shown on the Sessions page.
                  </p>
                </div>
                {mintError && <InlineNotice tone="error">{mintError}</InlineNotice>}
                <button type="button" className={`${BTN_PRIMARY} w-full`} onClick={mintBootstrapToken} disabled={minting || !tenantId}>
                  {minting ? "Minting…" : bootstrap ? "Mint a new token" : "Register & mint bootstrap token"}
                </button>
                {bootstrap && (
                  <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-3">
                    <p className="text-xs font-medium text-emerald-800">UMAI_AGENT_BOOTSTRAP_TOKEN</p>
                    <p className="mt-1 flex items-start gap-2">
                      <code className="min-w-0 flex-1 break-all font-mono text-xs text-gray-900">{bootstrap.bootstrap_token}</code>
                      <CopyButton value={bootstrap.bootstrap_token} label="Copy bootstrap token" />
                    </p>
                    <p className="mt-2 text-xs text-emerald-800">
                      Single use · expires{" "}
                      {new Date(bootstrap.expires_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      . Shown once — copy it now.
                    </p>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          <SectionCard title="Prerequisites">
            <ul className="space-y-2">
              {content.prerequisites.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-gray-700">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />
                  <span className="leading-6">{item}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
