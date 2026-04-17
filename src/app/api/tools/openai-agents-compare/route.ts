import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { Agent, run, setDefaultOpenAIKey, setTracingDisabled } from "@openai/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CompareRequest = {
  openaiApiKey?: string;
  model?: string;
  systemPrompt?: string;
  umaiBaseUrl?: string;
  umaiApiKey?: string;
  guardrailId?: string;
  prompt?: string;
};

type StepStatus = "pass" | "blocked" | "modified" | "error" | "info";

type RunStep = {
  label: string;
  status: StepStatus;
  detail: string;
};

type GuardrailDecisionSummary = {
  action: string;
  allowed: boolean;
  severity: string;
  reason: string;
  requestId: string;
  latencyMs: number;
  triggeringPolicyId: string | null;
  triggeringPolicyType: string | null;
};

type PaneResult = {
  status: "completed" | "blocked_pre" | "blocked_post" | "error";
  output: string;
  model: string;
  latencyMs: number | null;
  error?: string | null;
  steps: RunStep[];
  preGuard?: GuardrailDecisionSummary | null;
  postGuard?: GuardrailDecisionSummary | null;
  draftOutput?: string | null;
};

type UmaiGuardResponse = {
  request_id: string;
  decision: {
    action: string;
    allowed: boolean;
    severity: string;
    reason: string;
  };
  triggering_policy?: {
    policy_id: string;
    type: string;
    status: string;
  } | null;
  output_modifications?: {
    modified_text?: string | null;
    details?: {
      modified_text?: string | null;
    } | null;
  } | null;
  latency_ms: number;
};

let agentRunQueue: Promise<void> = Promise.resolve();

function serializeAgentRun<T>(fn: () => Promise<T>): Promise<T> {
  const runPromise = agentRunQueue.then(fn, fn);
  agentRunQueue = runPromise.then(
    () => undefined,
    () => undefined
  );
  return runPromise;
}

function asErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unexpected error";
}

function defaultUmaiBaseUrl() {
  return (
    process.env.CONTROL_CENTER_PUBLIC_API_URL?.trim() ||
    "http://host.docker.internal:8080/api/v1"
  );
}

function normalizeBaseUrl(value?: string) {
  return (value?.trim() || defaultUmaiBaseUrl()).replace(/\/+$/, "");
}

function toText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value == null) {
    return "";
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function extractAgentOutput(result: unknown): string {
  if (result && typeof result === "object" && "finalOutput" in result) {
    return toText((result as { finalOutput?: unknown }).finalOutput).trim();
  }
  return "";
}

function summarizeGuard(response: UmaiGuardResponse): GuardrailDecisionSummary {
  return {
    action: response.decision.action,
    allowed: response.decision.allowed,
    severity: response.decision.severity,
    reason: response.decision.reason,
    requestId: response.request_id,
    latencyMs: response.latency_ms,
    triggeringPolicyId: response.triggering_policy?.policy_id ?? null,
    triggeringPolicyType: response.triggering_policy?.type ?? null,
  };
}

function extractModifiedText(response: UmaiGuardResponse): string | null {
  const direct = response.output_modifications?.modified_text;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }
  const nested = response.output_modifications?.details?.modified_text;
  if (typeof nested === "string" && nested.trim()) {
    return nested.trim();
  }
  return null;
}

async function runOpenAIAgent(input: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  prompt: string;
}) {
  return await serializeAgentRun(async () => {
    setTracingDisabled(true);
    setDefaultOpenAIKey(input.apiKey);

    const agent = new Agent({
      name: "Presentation Assistant",
      instructions: input.systemPrompt,
      model: input.model,
    });

    const result = await run(agent, input.prompt);
    const output = extractAgentOutput(result);
    if (!output) {
      throw new Error("OpenAI agent returned an empty response.");
    }
    return output;
  });
}

async function callUmaiGuard(input: {
  baseUrl: string;
  apiKey: string;
  guardrailId: string;
  text: string;
  phase: "PRE_LLM" | "POST_LLM";
  conversationId: string;
}) {
  const role = input.phase === "PRE_LLM" ? "user" : "assistant";
  const phaseFocus =
    input.phase === "PRE_LLM" ? "LAST_USER_MESSAGE" : "LAST_ASSISTANT_MESSAGE";

  const response = await fetch(
    `${input.baseUrl}/guardrails/${encodeURIComponent(input.guardrailId)}/guard`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Umai-Api-Key": input.apiKey,
      },
      body: JSON.stringify({
        conversation_id: input.conversationId,
        phase: input.phase,
        timeout_ms: 1500,
        input: {
          messages: [
            {
              role,
              content: input.text,
            },
          ],
          phase_focus: phaseFocus,
          content_type: "text",
          language: "en",
          artifacts: [],
        },
      }),
      cache: "no-store",
    }
  );

  const rawBody = await response.text();
  const parsed = rawBody ? JSON.parse(rawBody) : null;

  if (!response.ok) {
    const message =
      parsed?.error?.message ||
      rawBody ||
      `UMAI guardrail request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }

  return parsed as UmaiGuardResponse;
}

async function runPlainAgent(input: {
  openaiApiKey: string;
  model: string;
  systemPrompt: string;
  prompt: string;
}): Promise<PaneResult> {
  const startedAt = Date.now();
  const output = await runOpenAIAgent({
    apiKey: input.openaiApiKey,
    model: input.model,
    systemPrompt: input.systemPrompt,
    prompt: input.prompt,
  });

  return {
    status: "completed",
    output,
    model: input.model,
    latencyMs: Date.now() - startedAt,
    steps: [
      {
        label: "Agent request",
        status: "pass",
        detail: "OpenAI Agents SDK completed without UMAI interception.",
      },
    ],
  };
}

async function runGuardedAgent(input: {
  openaiApiKey: string;
  model: string;
  systemPrompt: string;
  prompt: string;
  umaiApiKey: string;
  umaiBaseUrl: string;
  guardrailId: string;
}): Promise<PaneResult> {
  const startedAt = Date.now();
  const conversationId = randomUUID();

  const pre = await callUmaiGuard({
    baseUrl: input.umaiBaseUrl,
    apiKey: input.umaiApiKey,
    guardrailId: input.guardrailId,
    text: input.prompt,
    phase: "PRE_LLM",
    conversationId,
  });
  const preSummary = summarizeGuard(pre);

  if (!pre.decision.allowed) {
    return {
      status: "blocked_pre",
      output: `Blocked by UMAI before the OpenAI agent ran.\n\nReason: ${pre.decision.reason}`,
      model: input.model,
      latencyMs: Date.now() - startedAt,
      preGuard: preSummary,
      postGuard: null,
      steps: [
        {
          label: "PRE_LLM guardrail",
          status: "blocked",
          detail: `${pre.decision.action} • ${pre.decision.severity} • ${pre.decision.reason}`,
        },
        {
          label: "Agent request",
          status: "info",
          detail: "Skipped because the guardrail blocked the prompt first.",
        },
      ],
    };
  }

  const draftOutput = await runOpenAIAgent({
    apiKey: input.openaiApiKey,
    model: input.model,
    systemPrompt: input.systemPrompt,
    prompt: input.prompt,
  });

  const post = await callUmaiGuard({
    baseUrl: input.umaiBaseUrl,
    apiKey: input.umaiApiKey,
    guardrailId: input.guardrailId,
    text: draftOutput,
    phase: "POST_LLM",
    conversationId,
  });
  const postSummary = summarizeGuard(post);
  const modifiedText = extractModifiedText(post);

  if (!post.decision.allowed) {
    return {
      status: "blocked_post",
      output: `The OpenAI draft was generated, but UMAI blocked the final answer before delivery.\n\nReason: ${post.decision.reason}`,
      draftOutput,
      model: input.model,
      latencyMs: Date.now() - startedAt,
      preGuard: preSummary,
      postGuard: postSummary,
      steps: [
        {
          label: "PRE_LLM guardrail",
          status: "pass",
          detail: `${pre.decision.action} • ${pre.decision.severity} • ${pre.decision.reason}`,
        },
        {
          label: "Agent request",
          status: "pass",
          detail: "OpenAI Agents SDK returned a draft response.",
        },
        {
          label: "POST_LLM guardrail",
          status: "blocked",
          detail: `${post.decision.action} • ${post.decision.severity} • ${post.decision.reason}`,
        },
      ],
    };
  }

  return {
    status: "completed",
    output: modifiedText || draftOutput,
    draftOutput: modifiedText ? draftOutput : null,
    model: input.model,
    latencyMs: Date.now() - startedAt,
    preGuard: preSummary,
    postGuard: postSummary,
    steps: [
      {
        label: "PRE_LLM guardrail",
        status: "pass",
        detail: `${pre.decision.action} • ${pre.decision.severity} • ${pre.decision.reason}`,
      },
      {
        label: "Agent request",
        status: "pass",
        detail: "OpenAI Agents SDK returned a draft response.",
      },
      {
        label: "POST_LLM guardrail",
        status: modifiedText ? "modified" : "pass",
        detail: modifiedText
          ? `${post.decision.action} • ${post.decision.severity} • output was modified by UMAI`
          : `${post.decision.action} • ${post.decision.severity} • ${post.decision.reason}`,
      },
    ],
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CompareRequest;

    const openaiApiKey = body.openaiApiKey?.trim();
    const model = body.model?.trim() || "gpt-4.1";
    const systemPrompt =
      body.systemPrompt?.trim() ||
      "You are a concise enterprise assistant. Answer clearly, directly, and professionally.";
    const prompt = body.prompt?.trim();
    const umaiApiKey = body.umaiApiKey?.trim();
    const guardrailId = body.guardrailId?.trim();
    const umaiBaseUrl = normalizeBaseUrl(body.umaiBaseUrl);

    if (!openaiApiKey) {
      return NextResponse.json({ error: "Missing OpenAI API key." }, { status: 400 });
    }
    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt." }, { status: 400 });
    }
    if (!umaiApiKey) {
      return NextResponse.json({ error: "Missing UMAI API key." }, { status: 400 });
    }
    if (!guardrailId) {
      return NextResponse.json({ error: "Missing deployed guardrail ID." }, { status: 400 });
    }

    const [plainSettled, guardedSettled] = await Promise.allSettled([
      runPlainAgent({
        openaiApiKey,
        model,
        systemPrompt,
        prompt,
      }),
      runGuardedAgent({
        openaiApiKey,
        model,
        systemPrompt,
        prompt,
        umaiApiKey,
        umaiBaseUrl,
        guardrailId,
      }),
    ]);

    const plain =
      plainSettled.status === "fulfilled"
        ? plainSettled.value
        : ({
            status: "error",
            output: "",
            model,
            latencyMs: null,
            error: asErrorMessage(plainSettled.reason),
            steps: [
              {
                label: "Agent request",
                status: "error",
                detail: asErrorMessage(plainSettled.reason),
              },
            ],
          } satisfies PaneResult);

    const guarded =
      guardedSettled.status === "fulfilled"
        ? guardedSettled.value
        : ({
            status: "error",
            output: "",
            model,
            latencyMs: null,
            error: asErrorMessage(guardedSettled.reason),
            steps: [
              {
                label: "Guarded request",
                status: "error",
                detail: asErrorMessage(guardedSettled.reason),
              },
            ],
          } satisfies PaneResult);

    return NextResponse.json({ plain, guarded });
  } catch (error) {
    return NextResponse.json({ error: asErrorMessage(error) }, { status: 500 });
  }
}
