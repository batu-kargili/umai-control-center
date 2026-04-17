import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getSessionUserFromRequest } from "@/lib/auth-session";

export default async function middleware(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (user) {
    return NextResponse.next();
  }
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set(
    "returnTo",
    `${request.nextUrl.pathname}${request.nextUrl.search}`
  );
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/home",
    "/environments/:path*",
    "/settings",
    "/events",
    "/extension/:path*",
    "/extension-monitoring",
    "/tenants",
    "/onboarding/:path*",
  ],
};
