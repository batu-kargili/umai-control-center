"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Shield, XCircle } from "lucide-react";
import { useConsole } from "src/app/(console)/console-context";
import { fetchGuardrails, type Guardrail } from "src/lib/api";

type ConnectStatus = "preparing" | "connecting" | "connected" | "error";

interface DeviceTokenResponse {
  token: string;
  token_type: string;
  expires_at: number;
  audience: string;
}

interface ExtensionResponse {
  ok?: boolean;
  error?: string;
  issues?: string[];
}

const DEFAULT_EXTENSION_ID = "cpcepfngmlphbdmfpnkhlbhhiijeppcn";

interface ResolvedConnectConfig {
  extensionId: string;
  tenantId: string;
  environmentId: string;
  projectId: string;
  guardrailId: string;
  guardrailVersion: string;
  extensionConfigBase: Record<string, unknown>;
}

function cleanOrigin(value: string): string {
  return value.replace(/\/+$/, "");
}

function extensionIdFromSearch(): string {
  if (typeof window === "undefined") {
    return DEFAULT_EXTENSION_ID;
  }
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("extId")?.trim() ||
    process.env.NEXT_PUBLIC_UMAI_EXTENSION_ID?.trim() ||
    DEFAULT_EXTENSION_ID
  );
}

function selectGuardrail(guardrails: Guardrail[], requestedGuardrailId: string | null): Guardrail {
  if (requestedGuardrailId) {
    const matched = guardrails.find((guardrail) => guardrail.guardrail_id === requestedGuardrailId);
    if (!matched) {
      throw new Error(`Guardrail ${requestedGuardrailId} was not found in the selected project.`);
    }
    return matched;
  }

  const currentGuardrail = guardrails.find((guardrail) => guardrail.current_version > 0);
  if (!currentGuardrail) {
    throw new Error("No published guardrail is available in the selected project.");
  }
  return currentGuardrail;
}

function resolveGuardrailVersion(guardrail: Guardrail, requestedVersion: string | null): string {
  if (requestedVersion) {
    const version = Number.parseInt(requestedVersion, 10);
    if (!Number.isInteger(version) || version <= 0 || String(version) !== requestedVersion) {
      throw new Error("Guardrail version must be a positive integer.");
    }
    return String(version);
  }

  if (!Number.isInteger(guardrail.current_version) || guardrail.current_version <= 0) {
    throw new Error(`Guardrail ${guardrail.guardrail_id} does not have a published version.`);
  }
  return String(guardrail.current_version);
}

function sendExternalMessage(
  extensionId: string,
  payload: Record<string, unknown>
): Promise<ExtensionResponse> {
  return new Promise((resolve, reject) => {
    const runtime = window.chrome?.runtime;
    if (!runtime?.sendMessage) {
      reject(new Error("Chrome extension messaging is not available in this browser."));
      return;
    }
    runtime.sendMessage(
      extensionId,
      { type: "UMAI_CONNECT", payload },
      (response: ExtensionResponse | undefined) => {
        const runtimeError = runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        resolve(response ?? {});
      }
    );
  });
}

declare global {
  interface Window {
    chrome?: {
      runtime?: {
        lastError?: { message?: string };
        sendMessage?: (
          extensionId: string,
          message: unknown,
          callback: (response?: ExtensionResponse) => void
        ) => void;
      };
    };
  }
}

export default function ExtensionConnectPage() {
  const { tenant, tenantId, tenantReady } = useConsole();
  const [status, setStatus] = useState<ConnectStatus>("preparing");
  const [message, setMessage] = useState("Preparing extension enrollment.");
  const [config, setConfig] = useState<ResolvedConnectConfig | null>(null);

  const urlConfig = useMemo(() => {
    if (typeof window === "undefined") {
      return null;
    }

    const origin = cleanOrigin(window.location.origin);
    const params = new URLSearchParams(window.location.search);

    return {
      extensionId: extensionIdFromSearch(),
      origin,
      environmentId: params.get("environmentId")?.trim() || null,
      projectId: params.get("projectId")?.trim() || null,
      guardrailId: params.get("guardrailId")?.trim() || null,
      version: params.get("version")?.trim() || null,
    };
  }, []);

  useEffect(() => {
    if (!tenantReady || !urlConfig) {
      return;
    }

    let active = true;

    const resolveConfig = async () => {
      try {
        setStatus("preparing");
        setMessage("Resolving the customer guardrail for extension enrollment.");
        setConfig(null);

        const effectiveTenantId = tenantId || tenant?.tenant_id;
        if (!effectiveTenantId) {
          throw new Error("No active UMAI tenant is available for extension enrollment.");
        }

        const environmentId = urlConfig.environmentId || tenant?.environment_id;
        const projectId = urlConfig.projectId || tenant?.project_id;
        if (!environmentId || !projectId) {
          throw new Error("Create or select an environment and project before connecting the extension.");
        }

        const guardrails = await fetchGuardrails(effectiveTenantId, environmentId, projectId);
        const selectedGuardrail = selectGuardrail(guardrails, urlConfig.guardrailId);
        const guardrailVersion = resolveGuardrailVersion(selectedGuardrail, urlConfig.version);
        const query = new URLSearchParams({
          environment_id: environmentId,
          project_id: projectId,
          guardrail_id: selectedGuardrail.guardrail_id,
          version: guardrailVersion,
        }).toString();

        if (!active) {
          return;
        }

        setConfig({
          extensionId: urlConfig.extensionId,
          tenantId: effectiveTenantId,
          environmentId,
          projectId,
          guardrailId: selectedGuardrail.guardrail_id,
          guardrailVersion,
          extensionConfigBase: {
            tenantId: effectiveTenantId,
            environment: "prod",
            ingestBaseUrl: `${urlConfig.origin}/api/public`,
            eventsUrl: `${urlConfig.origin}/api/public/ext/events`,
            policyUrl: `${urlConfig.origin}/api/public/ext/policy?${query}`,
            evaluateUrl: `${urlConfig.origin}/api/public/ext/evaluate?${query}`,
            evaluationMode: "server",
            controlCenterUrl: urlConfig.origin,
            captureMode: "full_content",
            retentionLocalDays: 7,
            debug: false,
            allowedDomains: ["chatgpt.com", "chat.openai.com", "gemini.google.com", "claude.ai"],
            browserSecurity: {
              enabled: true,
              mode: "enforce",
              shadowAiDomains: [
                "copilot.microsoft.com",
                "perplexity.ai",
                "poe.com",
                "chat.deepseek.com",
                "meta.ai",
                "grok.com",
              ],
            },
          },
        });
      } catch (error) {
        if (!active) {
          return;
        }
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Unable to resolve extension configuration.");
      }
    };

    void resolveConfig();

    return () => {
      active = false;
    };
  }, [
    tenant?.environment_id,
    tenant?.project_id,
    tenant?.tenant_id,
    tenantId,
    tenantReady,
    urlConfig,
  ]);

  useEffect(() => {
    if (!config) {
      return;
    }

    let active = true;

    const connect = async () => {
      try {
        setStatus("preparing");
        setMessage("Minting a per-user extension device token.");
        const response = await fetch("/api/extension/device-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenant_id: config.tenantId }),
          cache: "no-store",
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `Device token request failed (${response.status}).`);
        }
        const tokenBody = (await response.json()) as DeviceTokenResponse;
        if (!tokenBody.token) {
          throw new Error("Device token response did not include a token.");
        }

        if (!active) {
          return;
        }

        setStatus("connecting");
        setMessage("Sending UMAI POC configuration to the browser extension.");
        const extensionResponse = await sendExternalMessage(config.extensionId, {
          ...config.extensionConfigBase,
          deviceToken: tokenBody.token,
        });
        if (!extensionResponse.ok) {
          const issueText = extensionResponse.issues?.length
            ? ` ${extensionResponse.issues.join(" ")}`
            : "";
          throw new Error(extensionResponse.error || `Extension rejected the configuration.${issueText}`);
        }

        if (!active) {
          return;
        }

        setStatus("connected");
        setMessage("Extension connected to the POC environment.");
      } catch (error) {
        if (!active) {
          return;
        }
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Extension connection failed.");
      }
    };

    void connect();

    return () => {
      active = false;
    };
  }, [config]);

  const icon =
    status === "connected" ? (
      <CheckCircle2 className="h-6 w-6 text-emerald-600" />
    ) : status === "error" ? (
      <XCircle className="h-6 w-6 text-red-600" />
    ) : (
      <Loader2 className="h-6 w-6 animate-spin text-secondary" />
    );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-3xl border border-secondary/10 bg-white p-8 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/10">
            <Shield className="h-6 w-6 text-secondary" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-secondary">
              UMAI Extension Enrollment
            </p>
            <h1 className="mt-2 text-3xl font-display text-ink">Connect browser extension</h1>
            <p className="mt-2 text-sm text-slate">
              This page is hidden from the main Control Center navigation, but remains available for Chrome
              Web Store POC enrollment.
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-secondary/10 bg-slate/5 p-5">
          <div className="flex items-center gap-3">
            {icon}
            <div>
              <p className="font-semibold capitalize text-ink">{status}</p>
              <p className="mt-1 text-sm text-slate">{message}</p>
            </div>
          </div>
        </div>

        {config ? (
          <div className="mt-6 grid gap-3 text-sm md:grid-cols-2">
            <div className="rounded-2xl border border-secondary/10 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate/60">
                Extension ID
              </p>
              <p className="mt-1 break-all font-mono text-xs text-ink">{config.extensionId}</p>
            </div>
            <div className="rounded-2xl border border-secondary/10 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate/60">
                Tenant
              </p>
              <p className="mt-1 break-all font-mono text-xs text-ink">{config.tenantId}</p>
            </div>
            <div className="rounded-2xl border border-secondary/10 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate/60">
                Environment
              </p>
              <p className="mt-1 font-mono text-xs text-ink">{config.environmentId}</p>
            </div>
            <div className="rounded-2xl border border-secondary/10 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate/60">
                Project
              </p>
              <p className="mt-1 font-mono text-xs text-ink">{config.projectId}</p>
            </div>
            <div className="rounded-2xl border border-secondary/10 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate/60">
                Guardrail
              </p>
              <p className="mt-1 break-all font-mono text-xs text-ink">{config.guardrailId}</p>
            </div>
            <div className="rounded-2xl border border-secondary/10 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate/60">
                Version
              </p>
              <p className="mt-1 font-mono text-xs text-ink">v{config.guardrailVersion}</p>
            </div>
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/extension-monitoring"
            className="rounded-xl bg-secondary px-4 py-2 text-sm font-semibold text-white shadow-accent transition hover:bg-secondary/90"
          >
            Open monitoring
          </Link>
          <Link
            href="/home"
            className="rounded-xl border border-secondary/15 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-secondary/5"
          >
            Back to Control Center
          </Link>
        </div>
      </section>
    </div>
  );
}
