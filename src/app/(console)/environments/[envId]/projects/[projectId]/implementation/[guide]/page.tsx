import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { implementationGuides } from "src/lib/implementation-guides";
import { ArrowLeft, BadgeCheck, Lightbulb } from "lucide-react";

const guideContent: Record<
  string,
  {
    tagline: string;
    summary: string;
    steps: string[];
    codeLabel: string;
    code: string;
    note: string;
  }
> = {
  "umai-extention": {
    tagline: "Browser-native governance for ChatGPT, Gemini, and Claude",
    summary:
      "Deploy the UMAI extension with managed enterprise config so browser prompts and responses are governed before users submit content.",
    steps: [
      "Force-install the MV3 extension and push tenant config via managed browser policy.",
      "Capture prompt attempts on supported domains and run local DLP plus policy checks.",
      "Enforce allow, warn, block, redact, or justify decisions before submit.",
      "Capture final assistant responses and batch upload tamper-evident ledger events.",
    ],
    codeLabel: "Pseudocode (TypeScript, MV3)",
    code: `const cfg = await chrome.storage.managed.get([
  "tenantId",
  "policyUrl",
  "ingestBaseUrl",
  "deviceToken"
]);

const policy = await fetchPolicy(cfg.policyUrl);
const prompt = adapter.getPromptText();
const dlp = scanPrompt(prompt);
const decision = evaluatePolicy({ prompt, dlp, policy });

if (decision.type === "block") {
  overlay.showBlocked(decision.message);
  return;
}

const finalPrompt = decision.type === "redact"
  ? applyRedactions(prompt, decision.redactions ?? [])
  : prompt;

adapter.setPromptText(finalPrompt);
adapter.submit();

queue.enqueue(buildLedgerEvents({ decision, prompt: finalPrompt }));`,
    note: "Start with metadata-only capture mode, then enable encrypted full-content capture per tenant policy.",
  },
  "openai-agents-sdk": {
    tagline: "Async guardrails around agent runs and tool calls",
    summary:
      "Wrap your Agents SDK workflow with UMAI async checks so responses are gated by policies without blocking tool execution.",
    steps: [
      "Create a guardrail job as soon as the user message arrives.",
      "Run the agent flow and tools as normal.",
      "Wait for the async verdict before sending the final response.",
      "On fail, return a safe fallback or trigger a review step.",
    ],
    codeLabel: "Pseudocode (TypeScript)",
    code: `const duvarai = new DuvarAI({ baseUrl, apiKey });

const job = await duvarai.guardrails.runAsync({
  guardrail_id: "pii-default",
  input: userMessage,
  metadata: { env_id, project_id }
});

const draft = await agent.run({ input: userMessage });
const verdict = await duvarai.guardrails.waitFor(job.id, { timeoutMs: 15000 });

return verdict.passed ? draft : safeFallback;`,
    note: "Use webhooks or a background worker if your guardrails take longer than a user session.",
  },
  "google-adk": {
    tagline: "Guardrails for ADK plans, tools, and final replies",
    summary:
      "Kick off UMAI async checks before ADK executes a plan so every response is policy-safe.",
    steps: [
      "Send the prompt and tool plan to UMAI for async evaluation.",
      "Execute the ADK run while policies are evaluated.",
      "Poll or await the verdict before emitting the final response.",
      "Log failures and surface safe alternatives to the user.",
    ],
    codeLabel: "Pseudocode (Python)",
    code: `duvarai = DuvarAI(base_url=BASE_URL, api_key=API_KEY)

job = duvarai.guardrails.run_async({
  "guardrail_id": "prompt-injection",
  "input": user_message,
  "metadata": {"env_id": env_id, "project_id": project_id}
})

result = adk_agent.run(user_message)
verdict = duvarai.guardrails.wait_for(job["id"], timeout_ms=15000)

return result if verdict["passed"] else safe_fallback`,
    note: "Capture the ADK plan trace and include it in metadata for richer policy context.",
  },
  xai: {
    tagline: "Async guardrails for Grok-style agent loops",
    summary:
      "Use UMAI to evaluate user input and tool output while your xAI workflow keeps moving.",
    steps: [
      "Start an async guardrail job with the user message.",
      "Execute the xAI completion or tool loop.",
      "Await the policy verdict before returning to the user.",
      "Fallback to a safe response if policies fail.",
    ],
    codeLabel: "Pseudocode (TypeScript)",
    code: `const job = await duvarai.guardrails.runAsync({
  guardrail_id: "safety-core",
  input: userMessage
});

const completion = await xai.chat({ messages: history });
const verdict = await duvarai.guardrails.waitFor(job.id, { timeoutMs: 15000 });

return verdict.passed ? completion : safeFallback;`,
    note: "Pair the verdict with audit logs to see which policy triggered a block.",
  },
  claude: {
    tagline: "Policy gating for Claude message workflows",
    summary:
      "Run UMAI checks in parallel with Anthropic message generation to keep responses safe.",
    steps: [
      "Begin an async guardrail job with the incoming prompt.",
      "Generate Claude messages while policies evaluate.",
      "Wait for UMAI to return a verdict.",
      "If blocked, return a compliant response or request clarification.",
    ],
    codeLabel: "Pseudocode (Python)",
    code: `job = duvarai.guardrails.run_async({
  "guardrail_id": "data-leakage",
  "input": user_message
})

reply = anthropic.messages.create(model="claude-3", messages=history)
verdict = duvarai.guardrails.wait_for(job["id"], timeout_ms=15000)

return reply if verdict["passed"] else safe_fallback`,
    note: "Consider adding a second check for tool outputs before sending the final message.",
  },
  langchain: {
    tagline: "Guardrails between chains, tools, and output",
    summary:
      "Enqueue UMAI async checks before you call a chain and gate the final output.",
    steps: [
      "Create a guardrail job from the user input.",
      "Invoke the LangChain runnable or agent.",
      "Wait for the policy verdict and gate the response.",
      "Send a safe response or re-run with a stricter prompt if needed.",
    ],
    codeLabel: "Pseudocode (Python)",
    code: `job = duvarai.guardrails.run_async({
  "guardrail_id": "pii-default",
  "input": user_message
})

output = chain.invoke({"input": user_message})
verdict = duvarai.guardrails.wait_for(job["id"], timeout_ms=15000)

return output if verdict["passed"] else safe_fallback`,
    note: "Use LangChain callbacks to attach UMAI verdicts to traces.",
  },
};

export default function ImplementationGuidePage({
  params,
}: {
  params: { envId: string; projectId: string; guide: string };
}) {
  const guide = implementationGuides.find((item) => item.slug === params.guide);
  const content = guideContent[params.guide];

  if (!guide || !content) {
    notFound();
  }

  const backHref = `/environments/${params.envId}/projects/${params.projectId}/implementation`;

  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate hover:text-ink"
        >
          <ArrowLeft className="w-4 h-4" /> Back to implementation
        </Link>
        <div className="flex flex-wrap items-center gap-4">
          <div className="rounded-2xl border border-slate/10 bg-white px-4 py-3">
            <Image src={guide.logo} alt={`${guide.title} logo`} width={120} height={40} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-slate/60">Implementation</p>
            <h1 className="font-display text-4xl font-bold text-ink">{guide.title}</h1>
            <p className="mt-2 text-sm text-slate max-w-2xl">{content.tagline}</p>
          </div>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-slate/10 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-ink">What you will build</h2>
          <p className="text-sm text-slate">{content.summary}</p>
          <ul className="space-y-2 text-sm text-slate">
            {content.steps.map((step) => (
              <li key={step} className="flex items-start gap-2">
                <BadgeCheck className="w-4 h-4 text-emerald-500 mt-0.5" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-3xl border border-amber-100 bg-amber-50 p-6 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-amber-700">
            <Lightbulb className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em]">Tip</span>
          </div>
          <p className="text-sm text-amber-900">{content.note}</p>
          <p className="text-xs text-amber-900/70">
            Start with one guardrail, then layer policy checks as you collect usage data.
          </p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] items-start">
        <div className="rounded-3xl border border-slate/10 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-ink">Implementation snippet</h2>
          <p className="text-xs text-slate">{content.codeLabel}</p>
          <pre className="rounded-2xl bg-slate-900 text-slate-100 p-4 text-xs leading-relaxed overflow-x-auto">
            <code>{content.code}</code>
          </pre>
          <div className="rounded-2xl border border-slate/10 bg-slate-50 p-4 text-xs text-slate">
            Share the same guardrail job ID across logs, traces, and policy dashboards to
            speed up incident reviews.
          </div>
        </div>

        <div className="rounded-3xl border border-slate/10 bg-white p-5 shadow-sm">
          <Image
            src="/assets/implementation/flow.svg"
            alt="Guardrail workflow diagram"
            width={760}
            height={180}
            className="w-full h-auto"
          />
          <div className="mt-4 text-xs text-slate">
            Policy checks keep AI workflows responsive while UMAI evaluates risk
            signals and policy violations.
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate/10 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-ink">Deployment checklist</h2>
        <div className="grid gap-3 md:grid-cols-2 text-sm text-slate">
          <div className="rounded-2xl bg-slate-50 p-4">
            Use a dedicated guardrail ID per workflow to simplify rollback.
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            Store verdicts in your telemetry pipeline for audit trails.
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            Route blocked responses to a human review or safe fallback.
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            Monitor latency budgets and switch to queued async delivery when needed.
          </div>
        </div>
      </section>
    </div>
  );
}
