import { NextResponse } from "next/server";

import { authenticateWithLdap } from "src/lib/ldap-auth";
import { createSessionToken, setSessionCookie } from "src/lib/auth-session";

export const runtime = "nodejs";

function sanitizeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/home";
  }
  return value;
}

export async function POST(req: Request) {
  let body: { login?: string; password?: string; returnTo?: string } | null = null;
  try {
    body = (await req.json()) as { login?: string; password?: string; returnTo?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const login = body?.login?.trim() || "";
  const password = body?.password?.trim() || "";
  const returnTo = sanitizeReturnTo(body?.returnTo);
  if (!login || !password) {
    return NextResponse.json(
      { error: "Username and password are required" },
      { status: 400 }
    );
  }

  try {
    const user = await authenticateWithLdap(login, password);
    const token = await createSessionToken(user);
    const response = NextResponse.json(
      { ok: true, redirectTo: returnTo, user },
      { status: 200 }
    );
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "LDAP authentication failed";
    const status = /configured/i.test(message) ? 503 : 401;
    return NextResponse.json({ error: message }, { status });
  }
}
