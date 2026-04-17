import { NextResponse } from "next/server";

import { getSessionUserFromRequest } from "src/lib/auth-session";
import { proxyRequest } from "src/lib/proxy";

export const runtime = "nodejs";

function upstreamAdminBaseUrl(): string {
  return (
    process.env.CONTROL_CENTER_ADMIN_API_URL?.trim() ||
    "http://duvarai-service:8080/api/v1/admin"
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
  return await proxyRequest(request, upstreamAdminBaseUrl(), params.path || []);
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
