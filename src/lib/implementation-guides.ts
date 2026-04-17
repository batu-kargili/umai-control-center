export type ImplementationGuideSummary = {
  slug: string;
  title: string;
  description: string;
  logo: string;
  badge?: string;
};

export const implementationGuides: ImplementationGuideSummary[] = [
  {
    slug: "umai-extention",
    title: "UMAI Browser Extension",
    description: "Govern ChatGPT, Gemini, and Claude usage directly in the browser.",
    logo: "/assets/implementation/umai-extension.svg",
    badge: "New",
  },
  {
    slug: "openai-agents-sdk",
    title: "OpenAI Agents SDK",
    description: "Add async guardrails around agent runs and tool calls.",
    logo: "/assets/implementation/openai.svg",
    badge: "Recommended",
  },
  {
    slug: "google-adk",
    title: "Google ADK",
    description: "Wrap ADK steps with UMAI checks and policy gates.",
    logo: "/assets/implementation/google-adk.svg",
  },
  {
    slug: "xai",
    title: "xAI",
    description: "Guard Grok-style agent flows with async policy evaluation.",
    logo: "/assets/implementation/xai.svg",
  },
  {
    slug: "claude",
    title: "Claude",
    description: "Add UMAI guardrails to Anthropic message workflows.",
    logo: "/assets/implementation/claude.svg",
  },
  {
    slug: "langchain",
    title: "LangChain",
    description: "Insert guardrails between chains, tools, and outputs.",
    logo: "/assets/implementation/langchain.svg",
  },
];
