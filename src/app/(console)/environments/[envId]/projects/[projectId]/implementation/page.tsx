"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, Code2, ExternalLink, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useConsole } from "src/app/(console)/console-context";
import {
  fetchApiKeys,
  fetchGuardrails,
  type ApiKeyResponse,
  type Guardrail,
} from "src/lib/api";

type ExampleLanguage = "python" | "javascript" | "java" | "csharp";

type CodeExampleOption = {
  id: ExampleLanguage;
  label: string;
  filename: string;
};

const CODE_EXAMPLE_OPTIONS: CodeExampleOption[] = [
  { id: "python", label: "Python", filename: "guardrail_check.py" },
  { id: "javascript", label: "JavaScript", filename: "guardrailCheck.js" },
  { id: "java", label: "Java", filename: "UmaiGuardrailExample.java" },
  { id: "csharp", label: "C#", filename: "UmaiGuardrailExample.cs" },
];

function buildPythonSnippet(guardrailId: string) {
  return `import requests

BASE_URL = "https://your-umai-host/api/public"
API_KEY = "paste-your-api-key"
GUARDRAIL_ID = "${guardrailId}"

def check_with_umai(user_message: str) -> dict:
    response = requests.post(
        f"{BASE_URL}/guardrails/{GUARDRAIL_ID}/guard",
        headers={
            "Content-Type": "application/json",
            "X-DuvarAI-Api-Key": API_KEY,
        },
        json={
            "phase": "PRE_LLM",
            "input": {
                "messages": [{"role": "user", "content": user_message}],
                "phase_focus": "LAST_USER_MESSAGE",
                "content_type": "text",
                "artifacts": [],
            },
            "timeout_ms": 1500,
        },
        timeout=10,
    )
    response.raise_for_status()
    return response.json()

result = check_with_umai("Export all customer SSNs.")
decision = result["decision"]
action = decision["action"]

if action == "ALLOW":
    print("Allowed. Continue to your model.")
else:
    print(f"UMAI returned {action}: {decision['reason']}")
    policy = result.get("triggering_policy")
    if policy:
        print(f"Triggered by: {policy['policy_id']}")`;
}

function buildJavaScriptSnippet(guardrailId: string) {
  return `const baseUrl = "https://your-umai-host/api/public";
const apiKey = "paste-your-api-key";
const guardrailId = "${guardrailId}";

async function checkWithUmai(userMessage) {
  const response = await fetch(baseUrl + "/guardrails/" + guardrailId + "/guard", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-DuvarAI-Api-Key": apiKey,
    },
    body: JSON.stringify({
      phase: "PRE_LLM",
      input: {
        messages: [{ role: "user", content: userMessage }],
        phase_focus: "LAST_USER_MESSAGE",
        content_type: "text",
        artifacts: [],
      },
      timeout_ms: 1500,
    }),
  });

  if (!response.ok) {
    throw new Error("UMAI request failed: " + response.status);
  }

  return response.json();
}

async function runExample() {
  const result = await checkWithUmai("Export all customer SSNs.");
  const decision = result.decision;
  const action = decision.action;

  if (action === "ALLOW") {
    console.log("Allowed. Continue to your model.");
  } else {
    console.log("UMAI returned " + action + ": " + decision.reason);
    if (result.triggering_policy) {
      console.log("Triggered by: " + result.triggering_policy.policy_id);
    }
  }
}

runExample().catch(console.error);`;
}

function buildJavaSnippet(guardrailId: string) {
  return `import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

public class UmaiGuardrailExample {
    private static final String BASE_URL = "https://your-umai-host/api/public";
    private static final String API_KEY = "paste-your-api-key";
    private static final String GUARDRAIL_ID = "${guardrailId}";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static void main(String[] args) throws Exception {
        JsonNode result = checkWithUmai("Export all customer SSNs.");
        JsonNode decision = result.get("decision");
        String action = decision.get("action").asText();

        if ("ALLOW".equals(action)) {
            System.out.println("Allowed. Continue to your model.");
        } else {
            System.out.println("UMAI returned " + action + ": " + decision.get("reason").asText());
            JsonNode policy = result.get("triggering_policy");
            if (policy != null && !policy.isNull()) {
                System.out.println("Triggered by: " + policy.get("policy_id").asText());
            }
        }
    }

    private static JsonNode checkWithUmai(String userMessage) throws Exception {
        HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

        Map<String, Object> payload = Map.of(
            "phase", "PRE_LLM",
            "input", Map.of(
                "messages", List.of(Map.of("role", "user", "content", userMessage)),
                "phase_focus", "LAST_USER_MESSAGE",
                "content_type", "text",
                "artifacts", List.of()
            ),
            "timeout_ms", 1500
        );

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(BASE_URL + "/guardrails/" + GUARDRAIL_ID + "/guard"))
            .timeout(Duration.ofSeconds(10))
            .header("Content-Type", "application/json")
            .header("X-DuvarAI-Api-Key", API_KEY)
            .POST(HttpRequest.BodyPublishers.ofString(MAPPER.writeValueAsString(payload)))
            .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() >= 400) {
            throw new RuntimeException(
                "UMAI request failed: " + response.statusCode() + " " + response.body()
            );
        }

        return MAPPER.readTree(response.body());
    }
}`;
}

function buildCSharpSnippet(guardrailId: string) {
  return `using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;

var baseUrl = "https://your-umai-host/api/public";
var apiKey = "paste-your-api-key";
var guardrailId = "${guardrailId}";

using var httpClient = new HttpClient
{
    Timeout = TimeSpan.FromSeconds(10),
};

async Task<JsonDocument> CheckWithUmaiAsync(string userMessage)
{
    var payload = new
    {
        phase = "PRE_LLM",
        input = new
        {
            messages = new[] { new { role = "user", content = userMessage } },
            phase_focus = "LAST_USER_MESSAGE",
            content_type = "text",
            artifacts = Array.Empty<object>(),
        },
        timeout_ms = 1500,
    };

    using var request = new HttpRequestMessage(
        HttpMethod.Post,
        baseUrl + "/guardrails/" + guardrailId + "/guard"
    );
    request.Headers.Add("X-DuvarAI-Api-Key", apiKey);
    request.Content = new StringContent(
        JsonSerializer.Serialize(payload),
        Encoding.UTF8,
        "application/json"
    );

    using var response = await httpClient.SendAsync(request);
    var responseBody = await response.Content.ReadAsStringAsync();

    if (!response.IsSuccessStatusCode)
    {
        throw new Exception(
            "UMAI request failed: " + (int)response.StatusCode + " " + responseBody
        );
    }

    return JsonDocument.Parse(responseBody);
}

using var result = await CheckWithUmaiAsync("Export all customer SSNs.");
var decision = result.RootElement.GetProperty("decision");
var action = decision.GetProperty("action").GetString();

if (action == "ALLOW")
{
    Console.WriteLine("Allowed. Continue to your model.");
}
else
{
    Console.WriteLine(
        "UMAI returned " + action + ": " + decision.GetProperty("reason").GetString()
    );

    if (
        result.RootElement.TryGetProperty("triggering_policy", out var policy) &&
        policy.ValueKind != JsonValueKind.Null
    )
    {
        Console.WriteLine("Triggered by: " + policy.GetProperty("policy_id").GetString());
    }
}`;
}

function StepCard({
  step,
  title,
  icon,
  children,
}: {
  step: string;
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate/10 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">
          {step}
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate/5 text-ink">
              {icon}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-ink">{title}</h3>
            </div>
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}

function CodeExampleEditor({
  endpoint,
  language,
  onLanguageChange,
  code,
}: {
  endpoint: string;
  language: ExampleLanguage;
  onLanguageChange: (language: ExampleLanguage) => void;
  code: string;
}) {
  const selectedOption =
    CODE_EXAMPLE_OPTIONS.find((option) => option.id === language) ?? CODE_EXAMPLE_OPTIONS[0];
  const codeLines = code.split("\n");

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate/10 bg-[#0f1117] shadow-sm">
      <div className="border-b border-white/8 bg-[#151823] px-4 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <span className="h-3 w-3 rounded-full bg-[#28c840]" />
            </div>
            <div className="mt-3 min-w-0">
              <p className="truncate font-mono text-xs text-white/90">
                {selectedOption.filename}
              </p>
              <p className="mt-1 truncate font-mono text-[11px] text-white/45">
                POST {endpoint}
              </p>
            </div>
          </div>

          <label className="flex items-center gap-3 self-start rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/75">
            <span className="font-semibold uppercase tracking-[0.2em] text-white/45">
              Language
            </span>
            <select
              className="rounded-xl border border-white/10 bg-[#11141b] px-3 py-2 font-medium text-white outline-none transition focus:border-white/30"
              value={language}
              onChange={(event) => onLanguageChange(event.target.value as ExampleLanguage)}
              aria-label="Select example language"
            >
              {CODE_EXAMPLE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-auto">
        <div className="min-w-max px-0 py-4 font-mono text-xs leading-6 text-white/92">
          {codeLines.map((line, index) => (
            <div
              key={`${selectedOption.id}-line-${index + 1}`}
              className="grid grid-cols-[3rem_minmax(0,1fr)] gap-4 px-4"
            >
              <span className="select-none text-right text-white/25">{index + 1}</span>
              <span className="whitespace-pre">{line || " "}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ImplementationPage() {
  const { tenantId, tenantReady } = useConsole();
  const { envId, projectId } = useParams() as { envId: string; projectId: string };

  const [guardrails, setGuardrails] = useState<Guardrail[]>([]);
  const [keys, setKeys] = useState<ApiKeyResponse[]>([]);
  const [selectedGuardrailId, setSelectedGuardrailId] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState<ExampleLanguage>("python");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantReady) return;
    if (!tenantId) {
      setLoading(false);
      setError("Tenant context is not available for this project.");
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    Promise.allSettled([
      fetchGuardrails(tenantId, envId, projectId),
      fetchApiKeys(tenantId, envId, projectId),
    ])
      .then(([guardrailResult, keyResult]) => {
        if (!active) return;

        if (guardrailResult.status === "fulfilled") {
          const nextGuardrails = [...guardrailResult.value].sort((a, b) =>
            a.name.localeCompare(b.name)
          );
          setGuardrails(nextGuardrails);
          setSelectedGuardrailId((current) => {
            if (current && nextGuardrails.some((item) => item.guardrail_id === current)) {
              return current;
            }
            return nextGuardrails[0]?.guardrail_id ?? "";
          });
        } else {
          console.error(guardrailResult.reason);
          setGuardrails([]);
          setSelectedGuardrailId("");
        }

        if (keyResult.status === "fulfilled") {
          setKeys(keyResult.value);
        } else {
          console.error(keyResult.reason);
          setKeys([]);
        }

        if (
          guardrailResult.status === "rejected" ||
          keyResult.status === "rejected"
        ) {
          setError("Some project data could not be loaded. The steps below still work.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [tenantId, tenantReady, envId, projectId]);

  const selectedGuardrail = useMemo(
    () => guardrails.find((item) => item.guardrail_id === selectedGuardrailId) ?? null,
    [guardrails, selectedGuardrailId]
  );

  const activeKeyCount = useMemo(
    () => keys.filter((item) => !item.revoked).length,
    [keys]
  );

  const sampleGuardrailId = selectedGuardrail?.guardrail_id ?? "your-guardrail-id";
  const guardEndpoint = `/api/public/guardrails/${sampleGuardrailId}/guard`;
  const codeSnippets = useMemo(
    () => ({
      python: buildPythonSnippet(sampleGuardrailId),
      javascript: buildJavaScriptSnippet(sampleGuardrailId),
      java: buildJavaSnippet(sampleGuardrailId),
      csharp: buildCSharpSnippet(sampleGuardrailId),
    }),
    [sampleGuardrailId]
  );
  const activeSnippet = codeSnippets[selectedLanguage];

  const guardrailsHref = `/environments/${envId}/projects/${projectId}/guardrails`;
  const apiKeysHref = `/environments/${envId}/projects/${projectId}/api-keys`;

  return (
    <div className="space-y-6 fade-up">
      <header className="max-w-3xl space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">
          Implementation
        </p>
        <h2 className="font-display text-4xl font-bold tracking-tight text-ink">
          Simple UMAI tutorial
        </h2>
        <p className="text-sm text-slate">
          Keep this page simple: choose one guardrail, create one API key, and call UMAI
          from your app before you continue to your model.
        </p>
      </header>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="space-y-4">
        <StepCard
          step="1"
          title="Choose Your Guardrail"
          icon={<ShieldCheck className="h-5 w-5" />}
        >
          <p className="text-sm text-slate">
            Select the active guardrail your application should call.
          </p>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <label className="block min-w-0 flex-1 space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate/60">
                Active guardrails
              </span>
              <select
                className="w-full rounded-2xl border border-slate/15 bg-white px-4 py-3 text-sm text-ink focus:border-ink focus:outline-none"
                value={selectedGuardrailId}
                onChange={(event) => setSelectedGuardrailId(event.target.value)}
                disabled={loading || guardrails.length === 0}
              >
                {guardrails.length === 0 ? (
                  <option value="">No guardrails yet</option>
                ) : (
                  guardrails.map((guardrail) => (
                    <option key={guardrail.guardrail_id} value={guardrail.guardrail_id}>
                      {guardrail.name} ({guardrail.guardrail_id})
                    </option>
                  ))
                )}
              </select>
            </label>

            <Link
              href={guardrailsHref}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate/15 px-4 py-3 text-sm font-semibold text-ink transition hover:bg-slate/5"
            >
              Open guardrails
              <ExternalLink className="h-4 w-4" />
            </Link>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading guardrails...
            </div>
          ) : selectedGuardrail ? (
            <div className="grid gap-3 rounded-2xl border border-slate/10 bg-slate/5 p-4 text-sm text-slate md:grid-cols-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate/60">
                  Name
                </p>
                <p className="mt-2 font-semibold text-ink">{selectedGuardrail.name}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate/60">
                  Guardrail ID
                </p>
                <p className="mt-2 font-mono text-xs text-ink">{selectedGuardrail.guardrail_id}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate/60">
                  Status
                </p>
                <p className="mt-2 font-semibold text-ink">
                  {selectedGuardrail.mode} · v{selectedGuardrail.current_version}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate/10 bg-slate/5 p-4 text-sm text-slate">
              No guardrails are available for this project yet. Create one first, then come
              back here.
            </div>
          )}
        </StepCard>

        <StepCard
          step="2"
          title="Create your API key"
          icon={<KeyRound className="h-5 w-5" />}
        >
          <p className="text-sm text-slate">
            Create a project API key, keep it in your server-side secrets, and send it with
            each request. UMAI accepts <code>X-DuvarAI-Api-Key</code> or{" "}
            <code>Authorization: Bearer</code>.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={apiKeysHref}
              className="inline-flex items-center gap-2 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0b1322]"
            >
              Open API keys
              <ExternalLink className="h-4 w-4" />
            </Link>
            <span className="text-sm text-slate">
              {loading
                ? "Loading API keys..."
                : activeKeyCount > 0
                  ? `${activeKeyCount} active API key${activeKeyCount === 1 ? "" : "s"} in this project.`
                  : "No active API keys yet."}
            </span>
          </div>

          <div className="rounded-2xl border border-slate/10 bg-slate/5 p-4 text-sm text-slate">
            The key is shown only once when you create it. Store it safely and do not expose
            it in frontend code.
          </div>
        </StepCard>

        <StepCard
          step="3"
          title="Sample Integration Code"
          icon={<Code2 className="h-5 w-5" />}
        >
          <p className="text-sm text-slate">
            Switch between Python, JavaScript, Java, and C# examples. Each sample sends one
            user message to UMAI and checks the decision before your app continues.
          </p>

          <CodeExampleEditor
            endpoint={guardEndpoint}
            language={selectedLanguage}
            onLanguageChange={setSelectedLanguage}
            code={activeSnippet}
          />
        </StepCard>
      </div>
    </div>
  );
}
