// Rehber içerikleri. Her snippet gerçek yüzeylere dayanır:
//   - Public guard API: POST {endpoint}/api/v1/guardrails/{id}/guard, X-Umai-Api-Key
//     (umai-service/app/api/public.py, models/public.py)
//   - Python SDK: umai-agent-sdk (UmaiClient, AgentMesh.guard*, UmaiOpenAIGuardian)
//   - Copilot Studio: umai-msft-bridge (docs/contracts/copilot-studio-external-threat-detection.md)

export interface GuideContext {
  endpoint: string;
  guardrailId: string;
  agentId: string;
  projectId: string;
}

export interface GuideSnippet {
  id: string;
  label: string;
  filename: string;
  code: string;
}

export interface GuideContent {
  summary: string;
  steps: string[];
  prerequisites: string[];
  snippets: GuideSnippet[];
  notes: string[];
}

const RESPONSE_EXAMPLE = `{
  "request_id": "5d1c…",
  "decision": {
    "action": "BLOCK",          // ALLOW | BLOCK | FLAG | ALLOW_WITH_MODIFICATIONS | STEP_UP_APPROVAL
    "allowed": false,
    "severity": "HIGH",         // LOW | MEDIUM | HIGH | CRITICAL
    "reason": "Preflight: rule preflight-system-prompt matched"
  },
  "category": null,
  "triggering_policy": { "policy_id": "preflight", "type": "HEURISTIC", "status": "BLOCK" },
  "output_modifications": null, // { "modified_text": "…" } when action is ALLOW_WITH_MODIFICATIONS
  "latency_ms": 12,
  "errors": []
}`;

function restGuide(ctx: GuideContext): GuideContent {
  const url = `${ctx.endpoint}/api/v1/guardrails/${ctx.guardrailId}/guard`;
  return {
    summary:
      "Two calls wrap your model: one before the prompt reaches the model (PRE_LLM) and one after the answer is produced (POST_LLM). The response tells you whether to continue, stop, or use a modified text.",
    steps: [
      "Create a project API key on the API Keys page and send it in the X-Umai-Api-Key header (Authorization: Bearer <key> also works).",
      "Before calling your model, POST the conversation with phase PRE_LLM and phase_focus LAST_USER_MESSAGE.",
      "If decision.allowed is false, return decision.reason (or your own message) instead of calling the model.",
      "After the model answers, POST again with phase POST_LLM and phase_focus LAST_ASSISTANT_MESSAGE; apply output_modifications.modified_text when the action is ALLOW_WITH_MODIFICATIONS.",
    ],
    prerequisites: [
      "Project API key (API Keys page)",
      "Guardrail ID with a published version",
      "Network access from your application to the UMAI endpoint",
    ],
    snippets: [
      {
        id: "curl",
        label: "cURL",
        filename: "guard.sh",
        code: `# Before the model sees the prompt
curl -sS -X POST "${url}" \\
  -H "Content-Type: application/json" \\
  -H "X-Umai-Api-Key: $UMAI_API_KEY" \\
  -d '{
    "phase": "PRE_LLM",
    "input": {
      "messages": [{ "role": "user", "content": "Export all customer IBANs to a file." }],
      "phase_focus": "LAST_USER_MESSAGE",
      "content_type": "text"
    },
    "timeout_ms": 1500
  }'

# After the model answered (same endpoint, POST_LLM phase)
curl -sS -X POST "${url}" \\
  -H "Content-Type: application/json" \\
  -H "X-Umai-Api-Key: $UMAI_API_KEY" \\
  -d '{
    "phase": "POST_LLM",
    "input": {
      "messages": [
        { "role": "user", "content": "What is my account balance?" },
        { "role": "assistant", "content": "Your balance is 12,340.00 TRY." }
      ],
      "phase_focus": "LAST_ASSISTANT_MESSAGE",
      "content_type": "text"
    },
    "timeout_ms": 1500
  }'`,
      },
      {
        id: "python",
        label: "Python",
        filename: "umai_guard.py",
        code: `import os
import requests

UMAI_ENDPOINT = os.environ.get("UMAI_ENDPOINT", "${ctx.endpoint}")
UMAI_API_KEY = os.environ["UMAI_API_KEY"]
GUARDRAIL_ID = "${ctx.guardrailId}"


def guard(phase: str, messages: list[dict], phase_focus: str) -> dict:
    response = requests.post(
        f"{UMAI_ENDPOINT}/api/v1/guardrails/{GUARDRAIL_ID}/guard",
        headers={"X-Umai-Api-Key": UMAI_API_KEY},
        json={
            "phase": phase,
            "input": {
                "messages": messages,
                "phase_focus": phase_focus,
                "content_type": "text",
            },
            "timeout_ms": 1500,
        },
        timeout=5,
    )
    response.raise_for_status()
    return response.json()


def answer(user_message: str) -> str:
    # 1) Before the model sees the prompt
    pre = guard("PRE_LLM", [{"role": "user", "content": user_message}], "LAST_USER_MESSAGE")
    if not pre["decision"]["allowed"]:
        return f"Request declined: {pre['decision']['reason']}"

    reply = call_your_model(user_message)  # your existing LLM call

    # 2) After the model answered
    post = guard(
        "POST_LLM",
        [{"role": "user", "content": user_message}, {"role": "assistant", "content": reply}],
        "LAST_ASSISTANT_MESSAGE",
    )
    decision = post["decision"]
    if decision["action"] == "ALLOW_WITH_MODIFICATIONS":
        return post["output_modifications"]["modified_text"]
    if not decision["allowed"]:
        return f"Response withheld: {decision['reason']}"
    return reply`,
      },
      {
        id: "javascript",
        label: "JavaScript",
        filename: "umaiGuard.js",
        code: `const UMAI_ENDPOINT = process.env.UMAI_ENDPOINT || "${ctx.endpoint}";
const UMAI_API_KEY = process.env.UMAI_API_KEY;
const GUARDRAIL_ID = "${ctx.guardrailId}";

async function guard(phase, messages, phaseFocus) {
  const response = await fetch(
    UMAI_ENDPOINT + "/api/v1/guardrails/" + GUARDRAIL_ID + "/guard",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Umai-Api-Key": UMAI_API_KEY },
      body: JSON.stringify({
        phase,
        input: { messages, phase_focus: phaseFocus, content_type: "text" },
        timeout_ms: 1500,
      }),
    }
  );
  if (!response.ok) throw new Error("UMAI guard failed: " + response.status);
  return response.json();
}

export async function answer(userMessage) {
  const pre = await guard("PRE_LLM", [{ role: "user", content: userMessage }], "LAST_USER_MESSAGE");
  if (!pre.decision.allowed) return "Request declined: " + pre.decision.reason;

  const reply = await callYourModel(userMessage); // your existing LLM call

  const post = await guard(
    "POST_LLM",
    [{ role: "user", content: userMessage }, { role: "assistant", content: reply }],
    "LAST_ASSISTANT_MESSAGE"
  );
  if (post.decision.action === "ALLOW_WITH_MODIFICATIONS") return post.output_modifications.modified_text;
  if (!post.decision.allowed) return "Response withheld: " + post.decision.reason;
  return reply;
}`,
      },
      {
        id: "response",
        label: "Response",
        filename: "response.json",
        code: RESPONSE_EXAMPLE,
      },
    ],
    notes: [
      "Tool and MCP phases (TOOL_INPUT, TOOL_OUTPUT, MCP_REQUEST, MCP_RESPONSE, MEMORY_WRITE) use the same endpoint with an input.artifacts entry describing the action; the SDK guides show the shape.",
      "timeout_ms is the engine budget for the decision. A slow context-aware policy past the budget fails according to the policy's fail-closed setting.",
      "Every call is recorded as an audit event and can raise an alert — identical to what you see on the Test page.",
    ],
  };
}

function sdkPrerequisites(ctx: GuideContext, extra: string[]) {
  return [
    "pip install umai-agent-sdk",
    ...extra,
    "Project API key (API Keys page) → UMAI_API_KEY",
    `Agent bootstrap token for “${ctx.agentId}” (mint it below) → UMAI_AGENT_BOOTSTRAP_TOKEN, valid 15 minutes, used once`,
  ];
}

function openaiGuide(ctx: GuideContext): GuideContent {
  return {
    summary:
      "UmaiOpenAIGuardian wraps Runner.run: the user prompt is checked before the run (PRE_LLM), every tool call is checked before it executes (TOOL_INPUT) and after it returns (TOOL_OUTPUT), and the final answer is checked once more (POST_LLM). Each run is recorded under a signed agent identity.",
    steps: [
      "Register an agent identity once: mint a bootstrap token here, then agent.register(...) exchanges it for a signed key pair stored locally.",
      "Build your OpenAI Agent as usual (model, instructions, tools).",
      "Run it through UmaiOpenAIGuardian instead of Runner.run. Blocked prompts or tool calls raise before the model or tool executes.",
      "Watch the run on the Sessions and Alerts pages; every step carries the agent DID.",
    ],
    prerequisites: sdkPrerequisites(ctx, ["pip install umai-agent-sdk[openai]  (adds openai-agents)", "OPENAI_API_KEY"]),
    snippets: [
      {
        id: "python",
        label: "Python",
        filename: "quickstart_openai_agents.py",
        code: `import asyncio
import os

from agents import Agent, function_tool

from umai import UmaiClient
from umai.integrations.openai_agents import UmaiOpenAIGuardian
from umai.stores import FileIdentityStore

GUARDRAIL_ID = "${ctx.guardrailId}"


@function_tool
async def lookup_account(account_id: str) -> str:
    """Look up a customer account (replace with your real tool)."""
    return f"Account {account_id}: balance 12,340.00 TRY"


async def main() -> None:
    umai = UmaiClient(
        endpoint=os.environ.get("UMAI_ENDPOINT", "${ctx.endpoint}"),
        api_key=os.environ["UMAI_API_KEY"],
        fail_closed=True,   # if UMAI is unreachable, stop instead of running unguarded
        timeout=30,
    )
    agent_mesh = umai.agent(
        "${ctx.agentId}",
        identity_store=FileIdentityStore(allow_plaintext_private_key=True),
    )
    if not agent_mesh.identity or not agent_mesh.identity.is_registered:
        await agent_mesh.register(
            bootstrap_token=os.environ["UMAI_AGENT_BOOTSTRAP_TOKEN"],
            display_name="Customer Support Agent",
            runtime="openai-agents",
            capabilities=["accounts:read"],
        )

    support_agent = Agent(
        name="Customer Support Agent",
        model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
        instructions="Answer account questions using the tools. Never reveal identifiers of other customers.",
        tools=[lookup_account],
    )

    guardian = UmaiOpenAIGuardian(agent=agent_mesh, guardrail_id=GUARDRAIL_ID)
    result = await guardian.run(support_agent, "What is the balance of account 1234567890?")
    print(result.final_output)


if __name__ == "__main__":
    asyncio.run(main())`,
      },
      {
        id: "env",
        label: "Environment",
        filename: ".env",
        code: `UMAI_ENDPOINT=${ctx.endpoint}
UMAI_API_KEY=<project API key>
UMAI_AGENT_BOOTSTRAP_TOKEN=<token minted on this page>
OPENAI_API_KEY=<your OpenAI key>
OPENAI_MODEL=gpt-4o-mini`,
      },
    ],
    notes: [
      "The identity store keeps the agent's private key in the working directory (allow_plaintext_private_key=True is for development; use an encrypted store in production).",
      "Blocked decisions raise umai.errors.UmaiBlockedError from guardian.run (the SDK never returns a non-allowed verdict); catch it to return a safe message to the user.",
      "The same guardian also records agent_start, tool_start/tool_end and handoff steps, which is what the Sessions page shows as the run tree.",
    ],
  };
}

function claudeGuide(ctx: GuideContext): GuideContent {
  return {
    summary:
      "A standard Anthropic Messages API tool-use loop with three UMAI checkpoints: the prompt before Claude sees it, every tool call before it executes, and the final answer before it reaches the user. Uses the generic guard methods of the UMAI SDK, so nothing about the Anthropic call changes.",
    steps: [
      "Register an agent identity once (bootstrap token below).",
      "Guard the user message with phase PRE_LLM; stop early when decision.allowed is false.",
      "Run the Messages API loop. For each tool_use block call guard_tool_input before executing the tool; return an is_error tool_result for blocked calls so Claude can explain instead of retrying.",
      "Guard the final text with phase POST_LLM, then complete the run.",
    ],
    prerequisites: sdkPrerequisites(ctx, ["pip install anthropic", "ANTHROPIC_API_KEY"]),
    snippets: [
      {
        id: "python",
        label: "Python",
        filename: "claude_agent_with_umai.py",
        code: `import asyncio
import json
import os

import anthropic

from umai import UmaiClient
from umai.errors import UmaiBlockedError
from umai.stores import FileIdentityStore

GUARDRAIL_ID = "${ctx.guardrailId}"

TOOLS = [
    {
        "name": "lookup_account",
        "description": "Return the balance of a customer account.",
        "input_schema": {
            "type": "object",
            "properties": {"account_id": {"type": "string"}},
            "required": ["account_id"],
        },
    }
]


def lookup_account(account_id: str) -> str:
    return json.dumps({"account_id": account_id, "balance": "12,340.00 TRY"})


async def main() -> None:
    umai = UmaiClient(
        endpoint=os.environ.get("UMAI_ENDPOINT", "${ctx.endpoint}"),
        api_key=os.environ["UMAI_API_KEY"],
        fail_closed=True,
    )
    agent = umai.agent(
        "${ctx.agentId}",
        identity_store=FileIdentityStore(allow_plaintext_private_key=True),
    )
    if not agent.identity or not agent.identity.is_registered:
        await agent.register(
            bootstrap_token=os.environ["UMAI_AGENT_BOOTSTRAP_TOKEN"],
            display_name="Claude Support Agent",
            runtime="anthropic",
        )

    claude = anthropic.AsyncAnthropic()  # reads ANTHROPIC_API_KEY
    user_message = "What is the balance of account 1234567890?"
    run = await agent.start_run(guardrail_id=GUARDRAIL_ID)

    # 1) Before Claude sees the prompt. The SDK raises UmaiBlockedError
    #    for BLOCK and STEP_UP_APPROVAL; it never returns a blocked verdict.
    try:
        await agent.guard(
            guardrail_id=GUARDRAIL_ID,
            phase="PRE_LLM",
            run_id=run.run_id,
            step_id="pre-llm",
            messages=[{"role": "user", "content": user_message}],
            phase_focus="LAST_USER_MESSAGE",
        )
    except UmaiBlockedError as blocked:
        await agent.complete_run(run.run_id, status="COMPLETED", decision_action="BLOCK")
        print("Request declined:", blocked.message)
        return

    messages = [{"role": "user", "content": user_message}]
    while True:
        response = await claude.messages.create(
            model="claude-opus-5",
            max_tokens=16000,
            tools=TOOLS,
            messages=messages,
        )
        if response.stop_reason != "tool_use":
            break

        messages.append({"role": "assistant", "content": response.content})
        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            # 2) Before every tool call
            try:
                await agent.guard_tool_input(
                    guardrail_id=GUARDRAIL_ID,
                    run_id=run.run_id,
                    tool_name=block.name,
                    payload_summary=json.dumps(block.input),
                    messages=[{"role": "assistant", "content": f"Call {block.name}"}],
                    metadata={"tool_input": block.input},
                )
            except UmaiBlockedError as blocked:
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": f"Blocked by policy: {blocked.message}",
                    "is_error": True,
                })
                continue
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": lookup_account(**block.input),
            })
        messages.append({"role": "user", "content": tool_results})

    if response.stop_reason == "refusal":
        answer = "I can't help with that request."
    else:
        answer = "".join(block.text for block in response.content if block.type == "text")

    # 3) After Claude answered
    try:
        post = await agent.guard(
            guardrail_id=GUARDRAIL_ID,
            phase="POST_LLM",
            run_id=run.run_id,
            step_id="post-llm",
            parent_step_id="pre-llm",
            messages=[
                {"role": "user", "content": user_message},
                {"role": "assistant", "content": answer},
            ],
            phase_focus="LAST_ASSISTANT_MESSAGE",
        )
    except UmaiBlockedError as blocked:
        await agent.complete_run(run.run_id, status="COMPLETED", decision_action="BLOCK")
        print("Response withheld:", blocked.message)
        return

    if post.decision.action == "ALLOW_WITH_MODIFICATIONS" and post.output_modifications:
        answer = post.output_modifications.get("modified_text") or answer
    await agent.complete_run(run.run_id, status="COMPLETED", decision_action=post.decision.action)
    print(answer)


if __name__ == "__main__":
    asyncio.run(main())`,
      },
      {
        id: "env",
        label: "Environment",
        filename: ".env",
        code: `UMAI_ENDPOINT=${ctx.endpoint}
UMAI_API_KEY=<project API key>
UMAI_AGENT_BOOTSTRAP_TOKEN=<token minted on this page>
ANTHROPIC_API_KEY=<your Anthropic key>`,
      },
    ],
    notes: [
      "Using the Anthropic tool runner instead of the manual loop? Gate inside each tool function: call guard_tool_input first and return the block reason as the tool result.",
      "Opus 5 runs adaptive thinking by default; nothing extra is needed. Handle stop_reason == \"refusal\" like a block, as above.",
      "guard_tool_output is available for tools that return data you want checked before Claude reads it (phase TOOL_OUTPUT).",
    ],
  };
}

function adkGuide(ctx: GuideContext): GuideContent {
  return {
    summary:
      "ADK exposes callbacks around the model call and around each tool call. before_model_callback sends the latest user message to UMAI (PRE_LLM) and returns a canned LlmResponse to skip the model when blocked; before_tool_callback checks the tool arguments (TOOL_INPUT) and returns an error dict to skip the tool.",
    steps: [
      "Register an agent identity once (bootstrap token below).",
      "Attach before_model_callback and before_tool_callback to your LlmAgent; both are async and call the UMAI SDK.",
      "Returning a value from a callback short-circuits ADK: the model or tool is not invoked and the returned content is used instead.",
      "Run the agent with the ADK runner as usual.",
    ],
    prerequisites: sdkPrerequisites(ctx, ["pip install google-adk", "Gemini API key or Vertex AI credentials for the model"]),
    snippets: [
      {
        id: "python",
        label: "Python",
        filename: "adk_agent_with_umai.py",
        code: `import asyncio
import json
import os

from google.adk.agents import LlmAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.models import LlmRequest, LlmResponse
from google.adk.runners import InMemoryRunner
from google.adk.tools.base_tool import BaseTool
from google.adk.tools.tool_context import ToolContext
from google.genai import types

from umai import UmaiClient
from umai.errors import UmaiBlockedError
from umai.stores import FileIdentityStore

GUARDRAIL_ID = "${ctx.guardrailId}"

umai = UmaiClient(
    endpoint=os.environ.get("UMAI_ENDPOINT", "${ctx.endpoint}"),
    api_key=os.environ["UMAI_API_KEY"],
    fail_closed=True,
)
mesh = umai.agent(
    "${ctx.agentId}",
    identity_store=FileIdentityStore(allow_plaintext_private_key=True),
)
RUN_ID = "adk-session-1"


def lookup_account(account_id: str) -> dict:
    """Return the balance of a customer account."""
    return {"account_id": account_id, "balance": "12,340.00 TRY"}


async def umai_before_model(callback_context: CallbackContext, llm_request: LlmRequest):
    """PRE_LLM: check the latest user message before Gemini sees it."""
    last_user_text = ""
    for content in reversed(llm_request.contents):
        if content.role == "user" and content.parts:
            last_user_text = "".join(part.text or "" for part in content.parts)
            break
    try:
        await mesh.guard(
            guardrail_id=GUARDRAIL_ID,
            phase="PRE_LLM",
            run_id=RUN_ID,
            step_id=f"pre-llm-{callback_context.invocation_id}",
            messages=[{"role": "user", "content": last_user_text}],
            phase_focus="LAST_USER_MESSAGE",
        )
    except UmaiBlockedError as blocked:
        # Returning an LlmResponse skips the model call.
        return LlmResponse(
            content=types.Content(
                role="model",
                parts=[types.Part(text=f"Request declined: {blocked.message}")],
            )
        )
    return None  # continue to the model


async def umai_before_tool(tool: BaseTool, args: dict, tool_context: ToolContext):
    """TOOL_INPUT: check the tool call before it executes."""
    try:
        await mesh.guard_tool_input(
            guardrail_id=GUARDRAIL_ID,
            run_id=RUN_ID,
            tool_name=tool.name,
            payload_summary=json.dumps(args),
            messages=[{"role": "assistant", "content": f"Call {tool.name}"}],
            metadata={"tool_input": args},
        )
    except UmaiBlockedError as blocked:
        # Returning a dict skips the tool; the model sees it as the result.
        return {"error": f"Blocked by policy: {blocked.message}"}
    return None  # run the tool


root_agent = LlmAgent(
    name="support_agent",
    model="gemini-2.5-flash",
    instruction="Answer account questions using the tools.",
    tools=[lookup_account],
    before_model_callback=umai_before_model,
    before_tool_callback=umai_before_tool,
)


async def main() -> None:
    if not mesh.identity or not mesh.identity.is_registered:
        await mesh.register(
            bootstrap_token=os.environ["UMAI_AGENT_BOOTSTRAP_TOKEN"],
            display_name="ADK Support Agent",
            runtime="google-adk",
        )
    await mesh.start_run(run_id=RUN_ID, guardrail_id=GUARDRAIL_ID)

    runner = InMemoryRunner(agent=root_agent, app_name="support")
    session = await runner.session_service.create_session(app_name="support", user_id="demo")
    message = types.Content(role="user", parts=[types.Part(text="What is the balance of account 1234567890?")])
    async for event in runner.run_async(user_id="demo", session_id=session.id, new_message=message):
        if event.is_final_response() and event.content and event.content.parts:
            print(event.content.parts[0].text)

    await mesh.complete_run(RUN_ID, status="COMPLETED")


if __name__ == "__main__":
    asyncio.run(main())`,
      },
      {
        id: "env",
        label: "Environment",
        filename: ".env",
        code: `UMAI_ENDPOINT=${ctx.endpoint}
UMAI_API_KEY=<project API key>
UMAI_AGENT_BOOTSTRAP_TOKEN=<token minted on this page>
GOOGLE_API_KEY=<Gemini API key>   # or GOOGLE_GENAI_USE_VERTEXAI=true with ADC`,
      },
    ],
    notes: [
      "Add an after_model_callback with phase POST_LLM if you also want the model's answer checked before ADK returns it.",
      "Callback signatures follow google-adk 1.x (async callbacks are awaited by the runner). Use one run_id per conversation so the Sessions page groups the steps.",
    ],
  };
}

function n8nGuide(ctx: GuideContext): GuideContent {
  const url = `${ctx.endpoint}/api/v1/guardrails/${ctx.guardrailId}/guard`;
  return {
    summary:
      "No code: an HTTP Request node posts the incoming message to the guard endpoint and an IF node routes on decision.allowed. Put the pair in front of your AI Agent node; add a second pair after it for the answer (POST_LLM).",
    steps: [
      "Create a Header Auth credential in n8n: name X-Umai-Api-Key, value = your project API key.",
      "Add an HTTP Request node (POST, JSON body as below) between the trigger and the AI Agent node.",
      "Add an IF node on {{ $json.decision.allowed }} — true continues to the agent, false answers with {{ $json.decision.reason }}.",
      "Import the workflow JSON below to get both nodes pre-wired, then connect your trigger and agent.",
    ],
    prerequisites: ["n8n 1.x (HTTP Request node v4.2, IF node v2)", "Project API key (API Keys page)", "Guardrail ID with a published version"],
    snippets: [
      {
        id: "workflow",
        label: "Workflow JSON",
        filename: "umai-guard.workflow.json",
        code: `{
  "name": "UMAI guard (before AI)",
  "nodes": [
    {
      "name": "UMAI guard",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [460, 300],
      "credentials": { "httpHeaderAuth": { "name": "UMAI API key" } },
      "parameters": {
        "method": "POST",
        "url": "${url}",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ phase: 'PRE_LLM', input: { messages: [{ role: 'user', content: $json.chatInput }], phase_focus: 'LAST_USER_MESSAGE', content_type: 'text' }, timeout_ms: 1500 }) }}",
        "options": {}
      }
    },
    {
      "name": "Allowed?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [700, 300],
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "strict" },
          "conditions": [
            {
              "id": "allowed",
              "leftValue": "={{ $json.decision.allowed }}",
              "rightValue": true,
              "operator": { "type": "boolean", "operation": "true", "singleValue": true }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      }
    }
  ],
  "connections": {
    "UMAI guard": { "main": [[{ "node": "Allowed?", "type": "main", "index": 0 }]] }
  }
}`,
      },
      {
        id: "body",
        label: "Request body",
        filename: "body.json",
        code: `{
  "phase": "PRE_LLM",
  "input": {
    "messages": [{ "role": "user", "content": "{{ $json.chatInput }}" }],
    "phase_focus": "LAST_USER_MESSAGE",
    "content_type": "text"
  },
  "timeout_ms": 1500
}`,
      },
      {
        id: "response",
        label: "Response",
        filename: "response.json",
        code: RESPONSE_EXAMPLE,
      },
    ],
    notes: [
      "chatInput is the field produced by n8n's Chat Trigger; use the field name of your own trigger.",
      "For the answer, duplicate the pair after the AI Agent node with phase POST_LLM, phase_focus LAST_ASSISTANT_MESSAGE and both messages in the array.",
      "Keep the API key in the credential, not in the node parameters, so it is not exported with the workflow.",
    ],
  };
}

function copilotGuide(ctx: GuideContext): GuideContent {
  return {
    summary:
      "Copilot Studio can ask an external threat-detection provider before an agent executes a tool. umai-msft-bridge is that provider: it receives the tool call with the conversation context, resolves which guardrail applies to the Copilot Studio environment and agent, asks UMAI for a decision within Microsoft's 1 second budget and answers with blockAction.",
    steps: [
      "Deploy umai-msft-bridge on a public HTTPS host under a domain verified in the customer's Entra tenant (for example https://cps.example.com/api/msft/cps).",
      "Register the two Entra applications: App B (UMAI API, deploy/msft/New-UmaiProviderApp.ps1) and App A (webhook client, Microsoft's Create-CopilotWebhookApp.ps1).",
      "In the Power Platform admin center, enable external threat detection for the environment with the bridge endpoint and App A's ID.",
      `Map the Copilot Studio environment and agent to this project's guardrail in the bindings file (or the admin binding endpoint); start with mode "monitor", switch to "enforce" when the decisions look right.`,
    ],
    prerequisites: [
      "Copilot Studio agents with generative orchestration (classic agents do not call the hook)",
      "A verified Entra domain for the bridge host",
      "Project API key for the bridge (UMAI_SERVICE_API_KEY)",
      "Feature is in preview on Microsoft's side",
    ],
    snippets: [
      {
        id: "bindings",
        label: "Bindings",
        filename: "bindings.json",
        code: `{
  "bindings": [
    {
      "label": "${ctx.projectId} — sales support agent",
      "tenantId": "<Entra tenant id>",
      "environmentId": "<Copilot Studio environment id>",
      "agentId": "<Copilot Studio agent id>",
      "guardrailId": "${ctx.guardrailId}",
      "mode": "enforce"
    },
    {
      "label": "${ctx.projectId} — environment default, monitor only",
      "tenantId": "<Entra tenant id>",
      "environmentId": "<Copilot Studio environment id>",
      "agentId": "*",
      "guardrailId": "${ctx.guardrailId}",
      "mode": "monitor",
      "onEvaluationFailure": "fail_closed"
    }
  ]
}`,
      },
      {
        id: "env",
        label: "Bridge config",
        filename: "umai-msft-bridge.env",
        code: `UMAI_ENVIRONMENT=production
UMAI_MSFT_TENANT_ID=<Entra tenant id>
UMAI_MSFT_AUDIENCE=https://cps.example.com          # App B Application ID URI = endpoint origin
UMAI_MSFT_ALLOWED_APP_IDS=<App A application id>
UMAI_MSFT_PATH_PREFIX=/api/msft/cps                 # PPAC endpoint = origin + prefix
UMAI_SERVICE_BASE_URL=${ctx.endpoint}
UMAI_SERVICE_API_KEY=<project API key>
UMAI_MSFT_BINDINGS_FILE=/etc/umai/bindings.json     # or UMAI_MSFT_BINDINGS_URL
UMAI_MSFT_DECISION_TIMEOUT_MS=600                   # must stay under Microsoft's 1000 ms budget
UMAI_MSFT_FAIL_CLOSED=true`,
      },
      {
        id: "contract",
        label: "Decision contract",
        filename: "analyze-tool-execution.md",
        code: `POST {base}/validate                  # called by PPAC on save; must return 200
POST {base}/analyze-tool-execution    # called before every tool execution

Request (from Copilot Studio):
{ "plannerContext": …, "toolDefinition": …, "inputValues": …, "conversationMetadata": … }

Response (from the bridge):
{ "blockAction": true, "reasonCode": 1001, "reason": "…", "diagnostics": "…" }

UMAI action              → blockAction
ALLOW                    → false
BLOCK                    → true   (reason is shown to the user)
ALLOW_WITH_MODIFICATIONS → true   (masking cannot be applied in this channel)
STEP_UP_APPROVAL / FLAG  → false  + finding (no approval flow in Copilot Studio)`,
      },
    ],
    notes: [
      "The hook fires only before tool calls. Prompts and model answers are not filtered in this channel — say “we check every action before it runs with the full conversation context”, not “we filter prompts”.",
      "Decisions are binary (allow/block); redaction is not possible, so ALLOW_WITH_MODIFICATIONS is mapped to block.",
      "Configuration is per Copilot Studio environment; new environments are not covered automatically.",
    ],
  };
}

export function buildGuideContent(slug: string, ctx: GuideContext): GuideContent | null {
  switch (slug) {
    case "rest-api":
      return restGuide(ctx);
    case "openai-agents-sdk":
      return openaiGuide(ctx);
    case "claude-agents":
      return claudeGuide(ctx);
    case "google-adk":
      return adkGuide(ctx);
    case "n8n":
      return n8nGuide(ctx);
    case "microsoft-copilot-studio":
      return copilotGuide(ctx);
    default:
      return null;
  }
}
