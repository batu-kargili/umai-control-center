// Header and path handling for the /api/admin and /api/public proxies. Kept free of
// Next.js imports so `node --test` can exercise it directly.

export interface ProxyHeaderOptions {
  // Replaces any client-supplied Authorization header. When set, the client's own
  // Authorization is never forwarded.
  authorization?: string | null;
  // Whether the client's Authorization header may be forwarded when `authorization` is
  // not supplied. The admin proxy passes false: the only credential umai-service may see
  // on an admin call is the one Control Center minted for the session.
  forwardClientAuthorization?: boolean;
}

// Headers copied from the browser request to umai-service (an allow-list).
const FORWARDED_REQUEST_HEADERS = [
  "content-type",
  "accept",
  "x-tenant-id",
  "x-device-id",
  "x-umai-api-key",
];

export function buildUpstreamHeaders(
  source: Headers,
  options: ProxyHeaderOptions = {}
): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = source.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  if (options.authorization) {
    headers.set("authorization", options.authorization);
  } else if (options.forwardClientAuthorization !== false) {
    const value = source.get("authorization");
    if (value) {
      headers.set("authorization", value);
    }
  }
  return headers;
}

// Dot segments would let `/api/admin/../x` resolve outside the upstream base once the
// target URL is normalised, carrying the minted admin token with it.
export function hasUnsafePathSegment(path: string[]): boolean {
  return path.some((segment) => segment === "." || segment === "..");
}
