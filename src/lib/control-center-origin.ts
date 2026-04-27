const PUBLIC_ORIGIN_ENV_KEYS = [
  "CONTROL_CENTER_PUBLIC_URL",
  "CONTROL_CENTER_BASE_URL",
  "CONTROL_CENTER_URL",
  "AUTH0_BASE_URL",
  "NEXT_PUBLIC_CONTROL_CENTER_URL",
  "NEXT_PUBLIC_APP_URL",
];

function firstHeaderValue(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}

function normalizeOrigin(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function configuredOrigin(): string | null {
  for (const key of PUBLIC_ORIGIN_ENV_KEYS) {
    const origin = normalizeOrigin(process.env[key]);
    if (origin) {
      return origin;
    }
  }
  return null;
}

function forwardedOrigin(request: Request): string | null {
  const headers = request.headers;
  const host = firstHeaderValue(headers.get("x-forwarded-host")) || headers.get("host");
  if (!host) {
    return null;
  }
  const proto =
    firstHeaderValue(headers.get("x-forwarded-proto")) ||
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return normalizeOrigin(`${proto}://${host}`);
}

export function getControlCenterOrigin(request: Request): string {
  return configuredOrigin() || forwardedOrigin(request) || new URL(request.url).origin;
}

export function buildControlCenterUrl(request: Request, path: string): URL {
  return new URL(path, getControlCenterOrigin(request));
}
