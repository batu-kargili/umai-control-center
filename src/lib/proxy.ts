import { NextResponse } from "next/server";

import {
  buildUpstreamHeaders,
  hasUnsafePathSegment,
  type ProxyHeaderOptions,
} from "src/lib/proxy-headers";

function cleanBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function buildTargetUrl(baseUrl: string, path: string[], query: string): string {
  const suffix = path.map((segment) => encodeURIComponent(segment)).join("/");
  return `${cleanBaseUrl(baseUrl)}/${suffix}${query}`;
}

function copyResponseHeaders(source: Headers): Headers {
  const headers = new Headers();
  const copyNames = [
    "content-type",
    "content-disposition",
    "cache-control",
    "location",
  ];
  for (const name of copyNames) {
    const value = source.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  return headers;
}

export async function proxyRequest(
  request: Request,
  upstreamBaseUrl: string,
  path: string[],
  options: ProxyHeaderOptions = {}
): Promise<NextResponse> {
  if (hasUnsafePathSegment(path)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  const method = request.method.toUpperCase();
  const targetUrl = buildTargetUrl(
    upstreamBaseUrl,
    path,
    new URL(request.url).search
  );
  const headers = buildUpstreamHeaders(request.headers, options);
  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : Buffer.from(await request.arrayBuffer());

  const upstream = await fetch(targetUrl, {
    method,
    headers,
    body,
    redirect: "manual",
  });

  return new NextResponse(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: copyResponseHeaders(upstream.headers),
  });
}
