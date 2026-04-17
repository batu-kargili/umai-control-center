import { NextResponse } from "next/server";

import { clearSessionCookie } from "src/lib/auth-session";

function sanitizeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/login";
  }
  return value;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const response = NextResponse.redirect(
    new URL(sanitizeReturnTo(url.searchParams.get("returnTo")), url)
  );
  clearSessionCookie(response);
  return response;
}

export async function POST() {
  const response = NextResponse.json({ ok: true }, { status: 200 });
  clearSessionCookie(response);
  return response;
}
