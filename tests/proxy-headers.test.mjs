import assert from "node:assert/strict";
import test from "node:test";

import { buildUpstreamHeaders, hasUnsafePathSegment } from "../src/lib/proxy-headers.ts";

function clientHeaders() {
  return new Headers({
    "content-type": "application/json",
    accept: "application/json",
    authorization: "Bearer client-supplied",
    cookie: "umai_cc_session=secret",
    "x-umai-api-key": "key",
    "x-forwarded-for": "10.0.0.1",
  });
}

test("admin proxy: injects the minted token and drops the client's Authorization", () => {
  const headers = buildUpstreamHeaders(clientHeaders(), {
    authorization: "Bearer minted",
    forwardClientAuthorization: false,
  });
  assert.equal(headers.get("authorization"), "Bearer minted");
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("x-umai-api-key"), "key");
  assert.equal(headers.get("cookie"), null);
  assert.equal(headers.get("x-forwarded-for"), null);
});

test("admin proxy without a configured secret forwards no Authorization at all", () => {
  const headers = buildUpstreamHeaders(clientHeaders(), {
    authorization: null,
    forwardClientAuthorization: false,
  });
  assert.equal(headers.get("authorization"), null);
});

test("public proxy: passes the client's own Authorization, never a minted one", () => {
  const headers = buildUpstreamHeaders(clientHeaders());
  assert.equal(headers.get("authorization"), "Bearer client-supplied");
  assert.equal(buildUpstreamHeaders(new Headers()).get("authorization"), null);
});

test("dot segments are rejected", () => {
  assert.equal(hasUnsafePathSegment(["guardrails", "abc"]), false);
  assert.equal(hasUnsafePathSegment(["..", "guard"]), true);
  assert.equal(hasUnsafePathSegment(["x", ".", "y"]), true);
});
