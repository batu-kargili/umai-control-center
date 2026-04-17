import Image from "next/image";
import Link from "next/link";
import { implementationGuides } from "src/lib/implementation-guides";
import { ArrowRight, CheckCircle2, Layers } from "lucide-react";

export default function ImplementationPage({
  params,
}: {
  params: { envId: string; projectId: string };
}) {
  const baseHref = `/environments/${params.envId}/projects/${params.projectId}/implementation`;

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
          Implementation
        </p>
        <h2 className="font-display text-4xl font-bold text-ink tracking-tight">
          Implement UMAI guardrails in your AI stack
        </h2>
        <p className="text-sm text-slate max-w-2xl">
          Pick an integration path and follow a guided checklist. Each guide includes
          code, recommended policies, and rollout tips for production.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: "Connect your runtime",
            description: "Set base URL, API key, and tenant metadata for guardrails.",
          },
          {
            title: "Run async checks",
            description: "Send prompts for evaluation while your runtime keeps moving.",
          },
          {
            title: "Gate final responses",
            description: "Block, redact, or re-route responses with policy outcomes.",
          },
        ].map((item) => (
          <div
            key={item.title}
            className="rounded-2xl border border-slate/10 bg-white p-5 shadow-sm"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-mint text-ink">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-ink">{item.title}</h3>
            <p className="mt-2 text-xs text-slate leading-relaxed">{item.description}</p>
          </div>
        ))}
      </section>

      <section className="space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-800">Choose your integration</h3>
          <div className="text-xs font-semibold text-slate flex items-center gap-2">
            <Layers className="w-4 h-4 text-ink" />
            Runtime-ready templates
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
          {implementationGuides.map((item) => (
            <Link
              key={item.slug}
              href={`${baseHref}/${item.slug}`}
              className="group rounded-2xl border border-slate/10 bg-white p-5 shadow-sm hover:shadow-md transition-all flex flex-col gap-3 hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between">
                <div className="rounded-xl border border-slate/10 bg-white px-3 py-2">
                  <Image src={item.logo} alt={`${item.title} logo`} width={100} height={34} />
                </div>
                {item.badge && (
                  <span className="rounded-full bg-mint px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-ink">
                    {item.badge}
                  </span>
                )}
              </div>
              <div>
                <h4 className="text-sm font-semibold text-ink">{item.title}</h4>
                <p className="mt-1 text-xs text-slate leading-relaxed">{item.description}</p>
              </div>
              <span className="flex items-center gap-1 text-xs font-semibold text-ink">
                Open guide <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] items-center">
        <div className="rounded-3xl border border-slate/10 bg-white p-6 shadow-sm space-y-4">
          <h3 className="text-lg font-semibold text-ink">Guardrail flow</h3>
          <p className="text-sm text-slate">
            Run UMAI checks in parallel with your AI steps. Gate only the final
            response so latency stays predictable.
          </p>
          <div className="rounded-2xl bg-slate-900 text-slate-100 p-4 text-xs font-mono leading-relaxed">
            {`const job = await umai.guardrails.runAsync({
  guardrail_id: \"pii-default\",
  input: userMessage,
  metadata: { project_id, env_id }
});

const draft = await runtime.run({ input: userMessage });
const verdict = await umai.guardrails.waitFor(job.id, { timeoutMs: 15000 });

return verdict.passed ? draft : safeFallback;`}
          </div>
          <p className="text-xs text-slate">
            Tip: For browser governance, queue events locally and upload in batches.
          </p>
        </div>

        <div className="rounded-3xl border border-slate/10 bg-white p-5 shadow-sm">
          <Image
            src="/assets/implementation/flow.svg"
            alt="Guardrail flow diagram"
            width={760}
            height={180}
            className="w-full h-auto"
          />
        </div>
      </section>
    </div>
  );
}
