import { NextResponse } from "next/server";

import { mintAdminToken } from "src/lib/admin-token";
import { getSessionUserFromRequest } from "src/lib/auth-session";
import { proxyRequest } from "src/lib/proxy";

export const runtime = "nodejs";

function upstreamAdminBaseUrl(): string {
  return (
    process.env.CONTROL_CENTER_ADMIN_API_URL?.trim() ||
    "http://umai-service:8080/api/v1/admin"
  );
}

async function handle(
  request: Request,
  params: { path?: string[] }
): Promise<NextResponse> {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  // The client's own Authorization header is never forwarded: umai-service must only see
  // the short-lived admin token minted here for the signed-in operator.
  let token: string | null;
  try {
    token = await mintAdminToken(user);
  } catch (error) {
    console.error("Control Center: admin token could not be issued", error);
    return NextResponse.json(
      { error: "Admin credentials are misconfigured" },
      { status: 500 }
    );
  }
  return await proxyRequest(request, upstreamAdminBaseUrl(), params.path || [], {
    authorization: token ? `Bearer ${token}` : null,
    forwardClientAuthorization: false,
  });
}

export async function GET(
  request: Request,
  context: { params: { path?: string[] } }
) {
  return await handle(request, context.params);
}

export async function POST(
  request: Request,
  context: { params: { path?: string[] } }
) {
  return await handle(request, context.params);
}

export async function PUT(
  request: Request,
  context: { params: { path?: string[] } }
) {
  return await handle(request, context.params);
}

export async function PATCH(
  request: Request,
  context: { params: { path?: string[] } }
) {
  return await handle(request, context.params);
}

export async function DELETE(
  request: Request,
  context: { params: { path?: string[] } }
) {
  return await handle(request, context.params);
}
