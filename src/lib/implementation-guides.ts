export type GuideKind = "rest" | "sdk" | "n8n" | "copilot";

export type ImplementationGuideSummary = {
  slug: string;
  title: string;
  description: string;
  logo: string;
  category: string;
  kind: GuideKind;
  /** Runtime name recorded on the agent registry entry for SDK-based guides. */
  runtime?: string;
};

// Kart sırası: en geniş kullanımdan en özel entegrasyona.
export const implementationGuides: ImplementationGuideSummary[] = [
  {
    slug: "rest-api",
    title: "REST API",
    description:
      "Call the guard endpoint from any language before and after your model call. No SDK, two HTTP requests.",
    logo: "/assets/implementation/rest-api.svg",
    category: "Any stack",
    kind: "rest",
  },
  {
    slug: "openai-agents-sdk",
    title: "OpenAI Agents SDK",
    description:
      "Drop-in guardian for Agents SDK runs: prompt, every tool call and the final answer are checked automatically.",
    logo: "/assets/implementation/openai.svg",
    category: "Python SDK",
    kind: "sdk",
    runtime: "openai-agents",
  },
  {
    slug: "claude-agents",
    title: "Claude Agents",
    description:
      "Anthropic Messages API tool-use loop with UMAI checks before the prompt, before each tool and after the answer.",
    logo: "/assets/implementation/claude.svg",
    category: "Python SDK",
    kind: "sdk",
    runtime: "anthropic",
  },
  {
    slug: "google-adk",
    title: "Google Agent Development Kit",
    description:
      "ADK callbacks route model and tool calls through UMAI; blocked calls are short-circuited inside the agent.",
    logo: "/assets/implementation/google-adk.svg",
    category: "Python SDK",
    kind: "sdk",
    runtime: "google-adk",
  },
  {
    slug: "n8n",
    title: "n8n",
    description:
      "An HTTP Request node calls the guard endpoint and an IF node branches on the decision — no code.",
    logo: "/assets/implementation/n8n.svg",
    category: "Low-code",
    kind: "n8n",
  },
  {
    slug: "microsoft-copilot-studio",
    title: "Microsoft Copilot Studio",
    description:
      "External threat detection provider: every tool call of a Copilot Studio agent is checked by UMAI before it runs.",
    logo: "/assets/implementation/copilot-studio.svg",
    category: "Microsoft",
    kind: "copilot",
  },
];

export function findGuide(slug: string) {
  return implementationGuides.find((guide) => guide.slug === slug) ?? null;
}
