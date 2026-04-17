import { NextResponse } from "next/server";

import { getSessionUserFromRequest } from "src/lib/auth-session";
import { getDefaultTenantBinding } from "src/lib/default-tenant";

export async function GET(req: Request) {
  const user = await getSessionUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { user: null, defaultTenant: null },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json(
    { user, defaultTenant: getDefaultTenantBinding() },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
