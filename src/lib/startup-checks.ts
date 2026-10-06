import { defaultAdminRoles } from "./admin-token";

const REQUIRED_ALWAYS = [
  "CONTROL_CENTER_SESSION_SECRET",
  "EXTENSION_CONNECT_JWT_SECRET",
  "LDAP_URL",
  "LDAP_USER_SEARCH_BASE",
  "CONTROL_CENTER_ORGANIZATION_ID",
  "CONTROL_CENTER_ORGANIZATION_NAME",
  "CONTROL_CENTER_ORGANIZATION_LICENSE_EXPIRES_AT",
] as const;

function isTruthy(value: string | undefined | null): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function isProduction(): boolean {
  return (process.env.NODE_ENV ?? "").toLowerCase() === "production";
}

export function runStartupChecks(): void {
  const missing = REQUIRED_ALWAYS.filter(
    (name) => !process.env[name]?.trim()
  );
  if (missing.length > 0) {
    throw new Error(
      "Control Center startup: required environment variables are not set: " +
        missing.join(", ")
    );
  }

  // Fails fast on an unknown CONTROL_CENTER_ADMIN_ROLE instead of on the first click.
  try {
    defaultAdminRoles();
  } catch (error) {
    throw new Error(
      "Control Center startup: " + (error instanceof Error ? error.message : String(error))
    );
  }

  if (!isProduction()) return;

  // umai-service enforces admin JWTs in production (UMAI_ADMIN_AUTH_MODE=jwt). Without
  // this secret every console action would return 401 after login.
  if (!process.env.CONTROL_CENTER_ADMIN_JWT_SECRET?.trim()) {
    throw new Error(
      "Control Center startup: CONTROL_CENTER_ADMIN_JWT_SECRET is not set in production. " +
        "Set it to the same value as umai-service's UMAI_ADMIN_JWT_HS256_SECRET."
    );
  }

  const sessionSecure = process.env.CONTROL_CENTER_SESSION_SECURE?.trim();
  const insecure = sessionSecure
    ? !isTruthy(sessionSecure)
    : false;
  if (insecure && !isTruthy(process.env.UMAI_ALLOW_INSECURE_SESSION)) {
    throw new Error(
      "Control Center startup: CONTROL_CENTER_SESSION_SECURE=false in production. " +
        "Set CONTROL_CENTER_SESSION_SECURE=true (recommended) or explicitly opt out " +
        "with UMAI_ALLOW_INSECURE_SESSION=1."
    );
  }
}
