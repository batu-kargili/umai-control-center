import { NextResponse } from "next/server";

import { proxyRequest } from "src/lib/proxy";

export const runtime = "nodejs";

function upstreamPublicBaseUrl(): string {
  return (
    process.env.CONTROL_CENTER_PUBLIC_API_URL?.trim() ||
    "http://umai-service:8080/api/v1"
  );
}

async function handle(
  request: Request,
  params: { path?: string[] }
) {
  const path = params.path || [];
  // This route has no session gate. It must never reach the admin API: in network-trust
  // mode that would be unauthenticated admin access. Admin calls go through /api/admin.
  if ((path[0] || "").toLowerCase() === "admin") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return await proxyRequest(request, upstreamPublicBaseUrl(), path);
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
