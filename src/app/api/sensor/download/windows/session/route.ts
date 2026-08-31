import { NextResponse } from "next/server";

import { getSessionUserFromRequest } from "src/lib/auth-session";
import { getDefaultTenantBinding } from "src/lib/default-tenant";

export const runtime = "nodejs";

function upstreamAdminBaseUrl(): string {
  return (
    process.env.CONTROL_CENTER_ADMIN_API_URL?.trim() ||
    "http://umai-service:8080/api/v1/admin"
  ).replace(/\/+$/, "");
}

function forwardedIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || undefined;
}

export async function POST(request: Request) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const tenant = getDefaultTenantBinding();
  if (!tenant?.tenant_id) {
    return NextResponse.json({ error: "Tenant is not configured" }, { status: 500 });
  }

  let body: { installer_version?: string } = {};
  try {
    body = (await request.json()) as { installer_version?: string };
  } catch {
    body = {};
  }

  const upstream = await fetch(`${upstreamAdminBaseUrl()}/sensor/download-sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-Id": tenant.tenant_id,
    },
    body: JSON.stringify({
      tenant_id: tenant.tenant_id,
      employee_idp_subject: user.sub,
      employee_upn: user.email || user.username,
      employee_display_name: user.name,
      installer_version: body.installer_version,
      created_ip: forwardedIp(request),
    }),
  });

  return new NextResponse(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/json",
      "Cache-Control": "no-store",
    },
  });
}
