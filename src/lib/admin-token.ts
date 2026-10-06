// Server-only: mints the bearer token Control Center presents to umai-service's admin API.
//
// umai-service runs with UMAI_ADMIN_AUTH_MODE=jwt in production and rejects admin calls
// without an HS256 bearer (app/core/admin_auth.py). The console authenticates operators
// itself (LDAP session cookie), so it has to turn that session into an admin credential
// on every proxied call. Nothing here may be imported from a client component: the
// signing secret must never reach the browser bundle.
//
// This module deliberately imports nothing but `jose` (and types) so it can be exercised
// directly by `node --test` without the Next.js toolchain.

import { SignJWT } from "jose";

import type { SessionUser } from "./auth-session";

export const ADMIN_TOKEN_TTL_SECONDS = 5 * 60;

// Roles the service understands (umai-service app/core/admin_auth.py _ALL_ROLES).
export const ADMIN_ROLES = [
  "platform-admin",
  "license-admin",
  "tenant-admin",
  "tenant-auditor",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

const DEFAULT_ADMIN_ROLE: AdminRole = "tenant-admin";

// Optional LDAP group -> role mapping. Each variable lists groups matched like
// LDAP_ALLOWED_GROUPS: either the full memberOf value or its cn short name. Entries are
// comma-separated; use ";" instead when listing full DNs (which themselves contain commas).
const GROUP_ROLE_ENV: ReadonlyArray<readonly [string, AdminRole]> = [
  ["CONTROL_CENTER_ADMIN_GROUPS_PLATFORM_ADMIN", "platform-admin"],
  ["CONTROL_CENTER_ADMIN_GROUPS_LICENSE_ADMIN", "license-admin"],
  ["CONTROL_CENTER_ADMIN_GROUPS_TENANT_ADMIN", "tenant-admin"],
  ["CONTROL_CENTER_ADMIN_GROUPS_TENANT_AUDITOR", "tenant-auditor"],
];

type Env = Record<string, string | undefined>;

function envValue(env: Env, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

function isAdminRole(value: string): value is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(value);
}

function splitList(raw: string, separator: string = ","): string[] {
  return raw
    .split(separator)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function adminSecret(env: Env): Uint8Array | null {
  const raw = envValue(env, "CONTROL_CENTER_ADMIN_JWT_SECRET");
  return raw ? new TextEncoder().encode(raw) : null;
}

export function isAdminTokenConfigured(env: Env = process.env): boolean {
  return adminSecret(env) !== null;
}

// CONTROL_CENTER_ADMIN_ROLE: the role(s) every signed-in operator gets when no group
// mapping grants one. Comma-separated; unknown values are a configuration error rather
// than something to silently drop.
export function defaultAdminRoles(env: Env = process.env): AdminRole[] {
  const raw = envValue(env, "CONTROL_CENTER_ADMIN_ROLE");
  if (!raw) {
    return [DEFAULT_ADMIN_ROLE];
  }
  const roles = splitList(raw);
  const unknown = roles.filter((role) => !isAdminRole(role));
  if (unknown.length > 0 || roles.length === 0) {
    throw new Error(
      "CONTROL_CENTER_ADMIN_ROLE must be one or more of " +
        ADMIN_ROLES.join(", ") +
        "; got: " +
        raw
    );
  }
  return Array.from(new Set(roles)) as AdminRole[];
}

function splitGroupList(raw: string): string[] {
  return splitList(raw, raw.includes(";") ? ";" : ",");
}

function groupMatches(userGroups: string[], configured: string[]): boolean {
  const normalized = userGroups.map((group) => group.trim().toLowerCase());
  return normalized.some((group) => {
    const shortName = group.startsWith("cn=") ? group.split(",")[0].slice(3) : group;
    return configured.includes(group) || configured.includes(shortName);
  });
}

export function resolveAdminRoles(
  user: Pick<SessionUser, "groups">,
  env: Env = process.env
): AdminRole[] {
  const granted = new Set<AdminRole>();
  for (const [name, role] of GROUP_ROLE_ENV) {
    const raw = envValue(env, name);
    if (raw && groupMatches(user.groups || [], splitGroupList(raw))) {
      granted.add(role);
    }
  }
  if (granted.size > 0) {
    return ADMIN_ROLES.filter((role) => granted.has(role));
  }
  return defaultAdminRoles(env);
}

// Returns null when CONTROL_CENTER_ADMIN_JWT_SECRET is unset (development / network-trust
// service); production refuses to start without it (see startup-checks.ts).
export async function mintAdminToken(
  user: Pick<SessionUser, "sub" | "username" | "groups">,
  env: Env = process.env
): Promise<string | null> {
  const secret = adminSecret(env);
  if (!secret) {
    return null;
  }
  const tenantId = envValue(env, "CONTROL_CENTER_ORGANIZATION_ID");
  if (!tenantId) {
    throw new Error("CONTROL_CENTER_ORGANIZATION_ID is not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const jwt = new SignJWT({
    tenant_id: tenantId,
    roles: resolveAdminRoles(user, env),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.sub || user.username)
    .setIssuer("umai-control-center")
    .setIssuedAt(now)
    .setExpirationTime(now + ADMIN_TOKEN_TTL_SECONDS);

  // The service only checks `aud` when UMAI_ADMIN_JWT_AUDIENCE is set (exact string
  // match); otherwise it merely refuses device/collector audiences. Mirror it.
  const audience = envValue(env, "CONTROL_CENTER_ADMIN_JWT_AUDIENCE");
  if (audience) {
    jwt.setAudience(audience);
  }
  return await jwt.sign(secret);
}
