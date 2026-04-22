"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useUser } from "src/lib/auth-client";
import { PlugZap, ShieldCheck, Unplug } from "lucide-react";

import { useConsole } from "src/app/(console)/console-context";

const DEFAULT_EXTENSION_ID =
  process.env.NEXT_PUBLIC_UMAI_EXTENSION_ID || "cpcepfngmlphbdmfpnkhlbhhiijeppcn";
const PUBLIC_API_BASE = "/api/public";

type ExtensionConnectRequest =
  | { type: "UMAI_PING" }
  | { type: "UMAI_DISCONNECT" }
  | {
      type: "UMAI_CONNECT";
      payload: {
        tenantId: string;
        environment: "prod" | "stage";
        ingestBaseUrl: string;
        policyUrl: string;
        controlCenterUrl: string;
        userEmail?: string;
        userIdpSubject?: string;
        userDisplayName?: string;
        deviceToken: string;
        captureMode: "metadata_only";
        retentionLocalDays: number;
        debug: boolean;
        allowedDomains: string[];
        browserSecurity: {
          enabled: boolean;
          mode: "audit" | "enforce";
          shadowAiDomains?: string[];
        };
      };
    };

interface ExtensionConnectResponse {
  ok: boolean;
  error?: string;
  issues?: string[];
  state?: {
    configured?: boolean;
    config?: {
      tenantId?: string;
    };
  };
}

interface RuntimeApi {
  lastError?: { message?: string };
  sendMessage: (
    extensionId: string,
    message: ExtensionConnectRequest,
    callback: (response?: ExtensionConnectResponse) => void
  ) => void;
}

interface ChromeLike {
  runtime?: RuntimeApi;
}

interface DeviceTokenResponse {
  token: string;
  token_type: string;
  expires_at: number;
  audience: string;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function getRuntime(): RuntimeApi | null {
  if (typeof window === "undefined") {
    return null;
  }
  const chromeLike = (window as unknown as { chrome?: ChromeLike }).chrome;
  if (!chromeLike?.runtime?.sendMessage) {
    return null;
  }
  return chromeLike.runtime;
}

function sendToExtension(
  extensionId: string,
  message: ExtensionConnectRequest,
  timeoutMs = 10000
): Promise<ExtensionConnectResponse> {
  const runtime = getRuntime();
  if (!runtime) {
    return Promise.reject(
      new Error("Chrome extension messaging is unavailable in this browser context.")
    );
  }

  return new Promise((resolve, reject) => {
    let finished = false;
    const timer = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      reject(new Error("Extension did not respond in time."));
    }, timeoutMs);

    runtime.sendMessage(extensionId, message, (response) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);

      const errorMessage = runtime.lastError?.message;
      if (errorMessage) {
        reject(new Error(errorMessage));
        return;
      }
      if (!response) {
        reject(new Error("No response received from extension."));
        return;
      }
      resolve(response);
    });
  });
}

async function verifyTenantConnection(
  extensionId: string,
  tenantId: string
): Promise<boolean> {
  try {
    const response = await sendToExtension(extensionId, { type: "UMAI_PING" }, 2500);
    return (
      response.ok === true &&
      response.state?.configured === true &&
      response.state?.config?.tenantId === tenantId
    );
  } catch (_error) {
    return false;
  }
}

async function fetchDeviceToken(tenantId: string): Promise<string> {
  const response = await fetch("/api/extension/device-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenant_id: tenantId }),
  });
  if (!response.ok) {
    const raw = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(raw?.error || "Failed to issue extension device token.");
  }
  const body = (await response.json()) as DeviceTokenResponse;
  if (!body.token || typeof body.token !== "string") {
    throw new Error("Token response is invalid.");
  }
  return body.token;
}

export default function ExtensionConnectPage() {
  const searchParams = useSearchParams();
  const { tenantId } = useConsole();
  const { user } = useUser();
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState<string>("Not connected yet.");
  const [statusTone, setStatusTone] = useState<"neutral" | "success" | "error">(
    "neutral"
  );

  const extensionId = useMemo(() => {
    const fromQuery = searchParams.get("extId");
    return fromQuery && fromQuery.trim().length > 0 ? fromQuery.trim() : DEFAULT_EXTENSION_ID;
  }, [searchParams]);

  const serviceBase = useMemo(() => {
    if (typeof window === "undefined") {
      return PUBLIC_API_BASE;
    }
    return new URL(PUBLIC_API_BASE, window.location.origin).toString();
  }, []);

  const connect = async () => {
    if (!tenantId) {
      setStatusTone("error");
      setStatusText("Tenant is not ready. Complete onboarding first.");
      return;
    }
    if (!isUuid(tenantId)) {
      setStatusTone("error");
      setStatusText(
        `Tenant ID is invalid for extension ingest (${tenantId}). Re-run organization onboarding.`
      );
      return;
    }
    if (typeof window === "undefined") {
      setStatusTone("error");
      setStatusText("Browser context is unavailable.");
      return;
    }

    const environment: "prod" | "stage" =
      window.location.hostname === "localhost" ? "stage" : "prod";
    let deviceToken = "";
    let tokenWarning: string | null = null;
    try {
      deviceToken = await fetchDeviceToken(tenantId);
    } catch (error) {
      tokenWarning =
        error instanceof Error ? error.message : "Falling back to legacy local token.";
      deviceToken = `cc-${crypto.randomUUID()}`;
    }

    const payload: ExtensionConnectRequest = {
      type: "UMAI_CONNECT",
      payload: {
        tenantId,
        environment,
        ingestBaseUrl: serviceBase,
        policyUrl: `${serviceBase}/v1/ext/policy`,
        controlCenterUrl: window.location.origin,
        userEmail: user?.email ?? undefined,
        userIdpSubject: user?.sub ?? undefined,
        userDisplayName: user?.name ?? undefined,
        deviceToken,
        captureMode: "metadata_only",
        retentionLocalDays: 7,
        debug: false,
        allowedDomains: [
          "chatgpt.com",
          "chat.openai.com",
          "gemini.google.com",
          "claude.ai",
        ],
        browserSecurity: {
          enabled: true,
          mode: "enforce",
        },
      },
    };

    setBusy(true);
    setStatusTone("neutral");
    setStatusText("Connecting extension to your organization...");
    try {
      const response = await sendToExtension(extensionId, payload);
      if (!response.ok) {
        const detail =
          response.issues && response.issues.length > 0
            ? ` ${response.issues.join(" ")}`
            : "";
        throw new Error((response.error || "Extension rejected connect request.") + detail);
      }
      if (tokenWarning) {
        setStatusTone("neutral");
        setStatusText(
          `Connected successfully for tenant ${tenantId}. Token hardening pending: ${tokenWarning}`
        );
      } else {
        setStatusTone("success");
        setStatusText(`Connected successfully for tenant ${tenantId}.`);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to connect extension.";
      const isTimeoutOrNoAck =
        message === "Extension did not respond in time." ||
        message === "No response received from extension.";

      if (isTimeoutOrNoAck) {
        const connected = await verifyTenantConnection(extensionId, tenantId);
        if (connected) {
          if (tokenWarning) {
            setStatusTone("neutral");
            setStatusText(
              `Connected successfully for tenant ${tenantId}. Token hardening pending: ${tokenWarning}`
            );
          } else {
            setStatusTone("success");
            setStatusText(
              `Connected successfully for tenant ${tenantId}. Extension acknowledgement was delayed but configuration is active.`
            );
          }
          return;
        }
      }

      setStatusTone("error");
      setStatusText(message);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setStatusTone("neutral");
    setStatusText("Disconnecting local extension connection...");
    try {
      const response = await sendToExtension(extensionId, { type: "UMAI_DISCONNECT" });
      if (!response.ok) {
        throw new Error(response.error || "Extension rejected disconnect request.");
      }
      setStatusTone("success");
      setStatusText("Disconnected local extension connection.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to disconnect extension.";
      setStatusTone("error");
      setStatusText(message);
    } finally {
      setBusy(false);
    }
  };

  const ping = async () => {
    setBusy(true);
    setStatusTone("neutral");
    setStatusText("Checking extension availability...");
    try {
      const response = await sendToExtension(extensionId, { type: "UMAI_PING" });
      if (!response.ok) {
        throw new Error(response.error || "Extension ping failed.");
      }
      setStatusTone("success");
      setStatusText("Extension is installed and responding.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Extension is not reachable.";
      setStatusTone("error");
      setStatusText(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate">Organization</p>
        <h2 className="font-display text-3xl text-ink">Extension Connect</h2>
        <p className="mt-2 text-sm text-slate">
          Use your current control-center session to connect the browser extension to your
          tenant automatically.
        </p>
      </div>

      <section className="rounded-3xl border border-slate/10 bg-white p-5 shadow-sm">
        <div className="grid gap-3 text-sm text-slate md:grid-cols-2">
          <div className="rounded-xl border border-slate/10 bg-slate/5 px-3 py-2">
            <p className="text-xs uppercase tracking-[0.16em] text-slate/70">Tenant</p>
            <p className="mt-1 font-mono text-[12px] text-ink">{tenantId ?? "-"}</p>
          </div>
          <div className="rounded-xl border border-slate/10 bg-slate/5 px-3 py-2">
            <p className="text-xs uppercase tracking-[0.16em] text-slate/70">Extension ID</p>
            <p className="mt-1 font-mono text-[12px] text-ink">{extensionId}</p>
          </div>
          <div className="rounded-xl border border-slate/10 bg-slate/5 px-3 py-2 md:col-span-2">
            <p className="text-xs uppercase tracking-[0.16em] text-slate/70">
              Ingest Endpoint
            </p>
            <p className="mt-1 font-mono text-[12px] text-ink">{serviceBase}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void ping()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full border border-slate/20 bg-white px-4 py-2 text-xs font-semibold text-slate disabled:opacity-50"
          >
            <ShieldCheck className="h-4 w-4" />
            Check Extension
          </button>
          <button
            type="button"
            onClick={() => void connect()}
            disabled={busy || !tenantId}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-ink px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            <PlugZap className="h-4 w-4" />
            Connect Organization
          </button>
          <button
            type="button"
            onClick={() => void disconnect()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full border border-slate/20 bg-white px-4 py-2 text-xs font-semibold text-slate disabled:opacity-50"
          >
            <Unplug className="h-4 w-4" />
            Disconnect
          </button>
        </div>

        <div
          className={`mt-4 rounded-xl border px-3 py-2 text-sm ${
            statusTone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : statusTone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-slate/20 bg-slate/5 text-slate"
          }`}
        >
          {statusText}
        </div>
      </section>

      <section className="rounded-3xl border border-slate/10 bg-white p-5 shadow-sm text-sm text-slate">
        <p className="font-semibold text-ink">Next step</p>
        <p className="mt-1">
          After a successful connect, open ChatGPT/Gemini/Claude and submit one prompt,
          or try an unapproved AI site to confirm browser blocking, then check events on{" "}
          <Link href="/extension-monitoring" className="font-semibold text-ink hover:underline">
            Extension Monitoring
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
