"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { BTN_PRIMARY, INPUT, InlineNotice, LABEL, SectionCard } from "src/app/(console)/console-ui";

import {
  fetchGuardrails,
  fetchGuardrailVersions,
  type Guardrail,
  type GuardrailVersion,
} from "src/lib/api";

const LATEST_VERSION = "latest";
const EXT_ID_STORAGE_KEY = "umai_admin_ext_id_v1";
const DEFAULT_EXTENSION_ID = "cpcepfngmlphbdmfpnkhlbhhiijeppcn";

const ALLOWED_DOMAINS = [
  "chatgpt.com",
  "chat.openai.com",
  "gemini.google.com",
  "claude.ai",
];

const SHADOW_AI_DOMAINS = [
  "copilot.microsoft.com",
  "perplexity.ai",
  "poe.com",
  "chat.deepseek.com",
  "meta.ai",
  "grok.com",
];

type StatusTone = "idle" | "busy" | "ok" | "error";

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

interface ChromeRuntimeLike {
  lastError?: { message?: string };
  sendMessage?: (
    extensionId: string,
    message: unknown,
    callback: (response?: ExtensionResponse) => void
  ) => void;
}

interface WindowWithChrome {
  chrome?: { runtime?: ChromeRuntimeLike };
}

function cleanOrigin(value: string): string {
  return value.replace(/\/+$/, "");
}

function getChromeRuntime(): ChromeRuntimeLike | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return (window as unknown as WindowWithChrome).chrome?.runtime;
}

function sendExternalMessage(
  extensionId: string,
  payload: Record<string, unknown>
): Promise<ExtensionResponse> {
  return new Promise((resolve, reject) => {
    const runtime = getChromeRuntime();
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
          reject(new Error(runtimeError.message || "Extension did not respond."));
          return;
        }
        resolve(response ?? {});
      }
    );
  });
}

interface Props {
  tenantId: string | null;
  environmentId: string | null;
  projectId: string | null;
}

export default function ExtensionGuardrailControl({
  tenantId,
  environmentId,
  projectId,
}: Props) {
  const [guardrails, setGuardrails] = useState<Guardrail[]>([]);
  const [guardrailId, setGuardrailId] = useState<string>("");
  const [versions, setVersions] = useState<GuardrailVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>(LATEST_VERSION);
  const [extensionId, setExtensionId] = useState<string>("");
  const [loadingGuardrails, setLoadingGuardrails] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [status, setStatus] = useState<{ tone: StatusTone; text: string }>({
    tone: "idle",
    text: "",
  });
  const [busy, setBusy] = useState(false);

  const ready = Boolean(tenantId && environmentId && projectId);

  const selectedGuardrail = useMemo(
    () => guardrails.find((g) => g.guardrail_id === guardrailId) ?? null,
    [guardrails, guardrailId]
  );

  // Prefill the extension id from a previous apply, env default, then constant.
  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? window.localStorage.getItem(EXT_ID_STORAGE_KEY)
        : null;
    setExtensionId(
      stored?.trim() ||
        process.env.NEXT_PUBLIC_UMAI_EXTENSION_ID?.trim() ||
        DEFAULT_EXTENSION_ID
    );
  }, []);

  // Load published guardrails for the active environment/project.
  useEffect(() => {
    if (!ready) {
      return;
    }
    let active = true;
    setLoadingGuardrails(true);
    fetchGuardrails(tenantId as string, environmentId as string, projectId as string)
      .then((rows) => {
        if (!active) {
          return;
        }
        const published = rows.filter((g) => g.current_version > 0);
        setGuardrails(published);
        setGuardrailId((current) =>
          current && published.some((g) => g.guardrail_id === current)
            ? current
            : published[0]?.guardrail_id ?? ""
        );
      })
      .catch(() => {
        if (active) {
          setGuardrails([]);
          setStatus({ tone: "error", text: "Failed to load guardrails for this project." });
        }
      })
      .finally(() => {
        if (active) {
          setLoadingGuardrails(false);
        }
      });
    return () => {
      active = false;
    };
  }, [ready, tenantId, environmentId, projectId]);

  // Load concrete versions for the selected guardrail.
  useEffect(() => {
    if (!ready || !guardrailId) {
      setVersions([]);
      return;
    }
    let active = true;
    setLoadingVersions(true);
    fetchGuardrailVersions(
      tenantId as string,
      environmentId as string,
      projectId as string,
      guardrailId
    )
      .then((rows) => {
        if (!active) {
          return;
        }
        const sorted = [...rows].sort((a, b) => b.version - a.version);
        setVersions(sorted);
        setSelectedVersion(LATEST_VERSION);
      })
      .catch(() => {
        if (active) {
          setVersions([]);
        }
      })
      .finally(() => {
        if (active) {
          setLoadingVersions(false);
        }
      });
    return () => {
      active = false;
    };
  }, [ready, guardrailId, tenantId, environmentId, projectId]);

  const apply = async () => {
    if (!ready || !selectedGuardrail) {
      setStatus({ tone: "error", text: "Select a published guardrail first." });
      return;
    }
    const extId = extensionId.trim();
    if (!extId) {
      setStatus({ tone: "error", text: "Enter the extension ID (from chrome://extensions)." });
      return;
    }

    const resolvedVersion =
      selectedVersion === LATEST_VERSION
        ? selectedGuardrail.current_version
        : Number.parseInt(selectedVersion, 10);
    if (!Number.isInteger(resolvedVersion) || resolvedVersion <= 0) {
      setStatus({ tone: "error", text: "Selected guardrail has no published version." });
      return;
    }

    setBusy(true);
    setStatus({ tone: "busy", text: "Minting device token…" });

    try {
      const tokenRes = await fetch("/api/extension/device-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId }),
        cache: "no-store",
      });
      if (!tokenRes.ok) {
        const body = (await tokenRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Device token request failed (${tokenRes.status}).`);
      }
      const tokenBody = (await tokenRes.json()) as DeviceTokenResponse;
      if (!tokenBody.token) {
        throw new Error("Device token response did not include a token.");
      }

      const origin = cleanOrigin(window.location.origin);
      const query = new URLSearchParams({
        environment_id: environmentId as string,
        project_id: projectId as string,
        guardrail_id: selectedGuardrail.guardrail_id,
        version: String(resolvedVersion),
      }).toString();

      setStatus({ tone: "busy", text: "Sending configuration to the extension…" });
      const response = await sendExternalMessage(extId, {
        tenantId,
        environment: "prod",
        ingestBaseUrl: `${origin}/api/public`,
        eventsUrl: `${origin}/api/public/ext/events`,
        policyUrl: `${origin}/api/public/ext/policy?${query}`,
        evaluateUrl: `${origin}/api/public/ext/evaluate?${query}`,
        evaluationMode: "server",
        controlCenterUrl: origin,
        captureMode: "full_content",
        retentionLocalDays: 7,
        debug: false,
        allowedDomains: ALLOWED_DOMAINS,
        browserSecurity: {
          enabled: true,
          mode: "enforce",
          shadowAiDomains: SHADOW_AI_DOMAINS,
        },
        deviceToken: tokenBody.token,
      });

      if (!response.ok) {
        const issues = response.issues?.length ? ` ${response.issues.join(" ")}` : "";
        throw new Error(response.error || `Extension rejected the configuration.${issues}`);
      }

      window.localStorage.setItem(EXT_ID_STORAGE_KEY, extId);
      setStatus({
        tone: "ok",
        text: `Applied ${selectedGuardrail.guardrail_id} v${resolvedVersion} to the extension in this browser.`,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to apply guardrail.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title="Apply a guardrail to this browser"
      description="Re-binds the UMAI extension running in this browser to the selected guardrail version. Other users are not affected; fleet-wide binding comes from the managed browser policy."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_auto] xl:items-end">
        <div>
          <label className={LABEL} htmlFor="ext-guardrail">
            Guardrail
          </label>
          <select
            id="ext-guardrail"
            className={`${INPUT} mt-1`}
            value={guardrailId}
            onChange={(event) => setGuardrailId(event.target.value)}
            disabled={!ready || loadingGuardrails || busy || guardrails.length === 0}
          >
            {guardrails.length === 0 ? (
              <option value="">{loadingGuardrails ? "Loading…" : "No published guardrails"}</option>
            ) : (
              guardrails.map((g) => (
                <option key={g.guardrail_id} value={g.guardrail_id}>
                  {g.name || g.guardrail_id}
                </option>
              ))
            )}
          </select>
        </div>

        <div>
          <label className={LABEL} htmlFor="ext-version">
            Version
          </label>
          <select
            id="ext-version"
            className={`${INPUT} mt-1`}
            value={selectedVersion}
            onChange={(event) => setSelectedVersion(event.target.value)}
            disabled={!ready || loadingVersions || busy || !guardrailId}
          >
            <option value={LATEST_VERSION}>
              Latest published{selectedGuardrail ? ` (v${selectedGuardrail.current_version})` : ""}
            </option>
            {versions.map((v) => (
              <option key={v.version} value={String(v.version)}>
                v{v.version}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL} htmlFor="ext-id">
            Extension ID
          </label>
          <input
            id="ext-id"
            type="text"
            className={`${INPUT} mt-1 font-mono text-xs`}
            value={extensionId}
            onChange={(event) => setExtensionId(event.target.value)}
            disabled={busy}
            placeholder="from chrome://extensions"
            spellCheck={false}
          />
        </div>

        <button
          type="button"
          className={BTN_PRIMARY}
          onClick={() => void apply()}
          disabled={!ready || busy || !guardrailId}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Apply to this browser
        </button>
      </div>

      {status.tone !== "idle" && (
        <div className="mt-4">
          <InlineNotice tone={status.tone === "ok" ? "success" : status.tone === "error" ? "error" : "info"}>
            {status.tone === "busy" ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {status.text}
              </span>
            ) : (
              status.text
            )}
          </InlineNotice>
        </div>
      )}
    </SectionCard>
  );
}
