import { SignJWT, jwtVerify } from "jose";
import type { NextRequest, NextResponse } from "next/server";

export const SESSION_COOKIE_NAME = "umai_cc_session";

export interface SessionUser {
  sub: string;
  username: string;
  name: string;
  email?: string;
  groups: string[];
}

interface SessionPayload {
  sub: string;
  username: string;
  name: string;
  email?: string;
  groups?: string[];
}

function sessionSecret(): Uint8Array {
  const raw = process.env.CONTROL_CENTER_SESSION_SECRET?.trim();
  if (!raw) {
    throw new Error("CONTROL_CENTER_SESSION_SECRET is not configured");
  }
  return new TextEncoder().encode(raw);
}

function sessionTtlSeconds(): number {
  const raw = process.env.CONTROL_CENTER_SESSION_TTL_SECONDS?.trim();
  if (!raw) {
    return 12 * 60 * 60;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 300) {
    throw new Error("CONTROL_CENTER_SESSION_TTL_SECONDS must be at least 300");
  }
  return Math.floor(parsed);
}

function normalizePayload(payload: SessionPayload): SessionUser | null {
  if (!payload.sub || !payload.username || !payload.name) {
    return null;
  }
  return {
    sub: String(payload.sub),
    username: String(payload.username),
    name: String(payload.name),
    email: payload.email ? String(payload.email) : undefined,
    groups: Array.isArray(payload.groups)
      ? payload.groups.map((item) => String(item))
      : [],
  };
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return await new SignJWT({
    sub: user.sub,
    username: user.username,
    name: user.name,
    email: user.email,
    groups: user.groups,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${sessionTtlSeconds()}s`)
    .sign(sessionSecret());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    return normalizePayload(payload as unknown as SessionPayload);
  } catch {
    return null;
  }
}

function cookieSecure(): boolean {
  const raw = process.env.CONTROL_CENTER_SESSION_SECURE?.trim();
  if (raw) {
    return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
  }
  return process.env.NODE_ENV === "production";
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: sessionTtlSeconds(),
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: 0,
  });
}

export async function getSessionUserFromRequest(
  request: Request | NextRequest
): Promise<SessionUser | null> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }
  const target = `${SESSION_COOKIE_NAME}=`;
  const token = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(target))
    ?.slice(target.length);
  if (!token) {
    return null;
  }
  return await verifySessionToken(token);
}
