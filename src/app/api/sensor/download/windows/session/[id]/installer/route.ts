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

export async function GET(
  request: Request,
  context: { params: { id: string } }
) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const tenant = getDefaultTenantBinding();
  if (!tenant?.tenant_id) {
    return NextResponse.json({ error: "Tenant is not configured" }, { status: 500 });
  }

  const upstream = await fetch(
    `${upstreamAdminBaseUrl()}/sensor/download-sessions/${encodeURIComponent(context.params.id)}/installer`,
    {
      headers: {
        "X-Tenant-Id": tenant.tenant_id,
        Accept: "application/octet-stream",
      },
      cache: "no-store",
    }
  );

  const headers = new Headers();
  for (const name of ["content-type", "content-disposition", "cache-control"]) {
    const value = upstream.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  if (!headers.has("cache-control")) {
    headers.set("Cache-Control", "no-store");
  }

  return new NextResponse(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers,
  });
}
