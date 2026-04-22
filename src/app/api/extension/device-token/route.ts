import { SignJWT } from "jose";
import { NextResponse } from "next/server";

import { getSessionUserFromRequest } from "src/lib/auth-session";
import { getDefaultTenantBinding } from "src/lib/default-tenant";

export const runtime = "nodejs";

const DEVICE_TOKEN_AUDIENCE = "umai-ext-ingest";
const DEVICE_TOKEN_TTL_SECONDS = 60 * 60;

interface DeviceTokenRequest {
  tenant_id?: string;
}

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function tokenSecret(): Uint8Array {
  const raw = process.env.EXTENSION_CONNECT_JWT_SECRET?.trim();
  if (!raw) {
    throw new Error("EXTENSION_CONNECT_JWT_SECRET is not configured");
  }
  return new TextEncoder().encode(raw);
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return jsonError("Not authenticated", 401);
  }

  let payload: DeviceTokenRequest;
  try {
    payload = (await request.json()) as DeviceTokenRequest;
  } catch {
    return jsonError("Request body must be valid JSON", 400);
  }

  const tenantId = payload.tenant_id?.trim();
  if (!tenantId) {
    return jsonError("tenant_id is required", 400);
  }

  const defaultTenant = getDefaultTenantBinding();
  if (defaultTenant && defaultTenant.tenant_id !== tenantId) {
    return jsonError("Requested tenant_id does not match the active organization", 403);
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + DEVICE_TOKEN_TTL_SECONDS;
  const token = await new SignJWT({
    tenant_id: tenantId,
    username: user.username,
    name: user.name,
    email: user.email,
    roles: ["tenant-device"],
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.sub || user.username)
    .setAudience(DEVICE_TOKEN_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(tokenSecret());

  return NextResponse.json(
    {
      token,
      token_type: "bearer",
      expires_at: expiresAt,
      audience: DEVICE_TOKEN_AUDIENCE,
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
