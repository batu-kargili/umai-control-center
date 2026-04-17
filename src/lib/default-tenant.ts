import type { TenantBinding } from "src/lib/tenant-store";

function readFirst(keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return null;
}

export function getDefaultTenantBinding(): TenantBinding | null {
  const tenantId = readFirst([
    "CONTROL_CENTER_ORGANIZATION_ID",
    "CONTROL_CENTER_DEFAULT_TENANT_ID",
  ]);
  if (!tenantId) {
    return null;
  }
  return {
    tenant_id: tenantId,
    tenant_name:
      readFirst([
        "CONTROL_CENTER_ORGANIZATION_NAME",
        "CONTROL_CENTER_DEFAULT_TENANT_NAME",
      ]) || "Customer Tenant",
    plan:
      readFirst([
        "CONTROL_CENTER_ORGANIZATION_PLAN",
        "CONTROL_CENTER_DEFAULT_PLAN",
      ]) || "enterprise",
    license_expires_at:
      readFirst([
        "CONTROL_CENTER_ORGANIZATION_LICENSE_EXPIRES_AT",
        "CONTROL_CENTER_DEFAULT_LICENSE_EXPIRES_AT",
      ]) ||
      new Date("2099-12-31T23:59:59.000Z").toISOString(),
    environment_id: readFirst(["CONTROL_CENTER_DEFAULT_ENVIRONMENT_ID"]),
    project_id: readFirst(["CONTROL_CENTER_DEFAULT_PROJECT_ID"]),
  };
}
