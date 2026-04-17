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
  return await proxyRequest(request, upstreamPublicBaseUrl(), params.path || []);
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
