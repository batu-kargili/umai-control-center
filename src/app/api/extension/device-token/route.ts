import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { getSessionUserFromRequest } from "src/lib/auth-session";

export const runtime = "nodejs";

const EXTENSION_INGEST_AUDIENCE = "duvarai-ext-ingest";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signHs256Jwt(claims: Record<string, unknown>, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const headerSegment = base64UrlEncode(JSON.stringify(header));
  const payloadSegment = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(signingInput)
    .digest();
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

export async function POST(req: Request) {
  const sessionUser = await getSessionUserFromRequest(req);
  if (!sessionUser?.sub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let tenantId = "";
  try {
    const body = (await req.json()) as { tenant_id?: string };
    tenantId = typeof body?.tenant_id === "string" ? body.tenant_id.trim() : "";
  } catch (_error) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!tenantId || !isUuid(tenantId)) {
    return NextResponse.json(
      { error: "tenant_id must be a UUID" },
      { status: 400 }
    );
  }

  const signingSecret = process.env.EXTENSION_CONNECT_JWT_SECRET;
  if (!signingSecret) {
    return NextResponse.json(
      { error: "Extension token signer is not configured" },
      { status: 503 }
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60;
  const token = signHs256Jwt(
    {
      sub: sessionUser.sub,
      tenant_id: tenantId,
      aud: EXTENSION_INGEST_AUDIENCE,
      iat: now,
      exp,
      roles: ["tenant-device"]
    },
    signingSecret
  );

  return NextResponse.json(
    {
      token,
      token_type: "Bearer",
      expires_at: exp,
      audience: EXTENSION_INGEST_AUDIENCE
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
