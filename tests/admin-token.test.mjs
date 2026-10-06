// Run with `npm test` (node --test with type stripping; no extra dependencies).
import assert from "node:assert/strict";
import test from "node:test";

import { decodeProtectedHeader, jwtVerify } from "jose";

import {
  ADMIN_TOKEN_TTL_SECONDS,
  defaultAdminRoles,
  isAdminTokenConfigured,
  mintAdminToken,
  resolveAdminRoles,
} from "../src/lib/admin-token.ts";

const SECRET = "test-admin-secret-0123456789abcdef";
const TENANT = "11111111-2222-3333-4444-555555555555";
const USER = {
  sub: "ldap:uid=ayse,ou=people,dc=example,dc=com",
  username: "ayse",
  groups: ["cn=umai-auditors,ou=groups,dc=example,dc=com"],
};

function env(extra = {}) {
  return {
    CONTROL_CENTER_ADMIN_JWT_SECRET: SECRET,
    CONTROL_CENTER_ORGANIZATION_ID: TENANT,
    ...extra,
  };
}

test("mints an HS256 admin token with the claims umai-service reads", async () => {
  const before = Math.floor(Date.now() / 1000);
  const token = await mintAdminToken(USER, env());
  assert.ok(token);
  assert.equal(decodeProtectedHeader(token).alg, "HS256");

  const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET));
  assert.equal(payload.sub, USER.sub);
  assert.equal(payload.tenant_id, TENANT);
  assert.deepEqual(payload.roles, ["tenant-admin"]);
  assert.equal(payload.iss, "umai-control-center");
  assert.equal(payload.aud, undefined);
  assert.ok(payload.iat >= before);
  assert.equal(payload.exp - payload.iat, ADMIN_TOKEN_TTL_SECONDS);
});

test("expires after five minutes", async () => {
  const token = await mintAdminToken(USER, env());
  const later = new Date(Date.now() + (ADMIN_TOKEN_TTL_SECONDS + 5) * 1000);
  await assert.rejects(
    jwtVerify(token, new TextEncoder().encode(SECRET), { currentDate: later }),
    (error) => error.code === "ERR_JWT_EXPIRED"
  );
});

test("does not verify with a different secret", async () => {
  const token = await mintAdminToken(USER, env());
  await assert.rejects(jwtVerify(token, new TextEncoder().encode("other-secret")));
});

test("returns null when the secret is not configured", async () => {
  const unset = { CONTROL_CENTER_ORGANIZATION_ID: TENANT };
  assert.equal(isAdminTokenConfigured(unset), false);
  assert.equal(await mintAdminToken(USER, unset), null);
  assert.equal(
    await mintAdminToken(USER, { ...unset, CONTROL_CENTER_ADMIN_JWT_SECRET: "   " }),
    null
  );
});

test("requires the organization id", async () => {
  await assert.rejects(
    mintAdminToken(USER, { CONTROL_CENTER_ADMIN_JWT_SECRET: SECRET }),
    /CONTROL_CENTER_ORGANIZATION_ID/
  );
});

test("sets aud only when CONTROL_CENTER_ADMIN_JWT_AUDIENCE is configured", async () => {
  const token = await mintAdminToken(
    USER,
    env({ CONTROL_CENTER_ADMIN_JWT_AUDIENCE: "umai-admin" })
  );
  const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET), {
    audience: "umai-admin",
  });
  assert.equal(payload.aud, "umai-admin");
});

test("CONTROL_CENTER_ADMIN_ROLE sets the default role and rejects unknown values", () => {
  assert.deepEqual(defaultAdminRoles({}), ["tenant-admin"]);
  assert.deepEqual(defaultAdminRoles({ CONTROL_CENTER_ADMIN_ROLE: "tenant-auditor" }), [
    "tenant-auditor",
  ]);
  assert.deepEqual(
    defaultAdminRoles({ CONTROL_CENTER_ADMIN_ROLE: "Platform-Admin, license-admin" }),
    ["platform-admin", "license-admin"]
  );
  assert.throws(
    () => defaultAdminRoles({ CONTROL_CENTER_ADMIN_ROLE: "superuser" }),
    /CONTROL_CENTER_ADMIN_ROLE/
  );
});

test("LDAP group mapping grants roles by cn short name or full DN", () => {
  const mapping = {
    CONTROL_CENTER_ADMIN_ROLE: "tenant-auditor",
    CONTROL_CENTER_ADMIN_GROUPS_TENANT_ADMIN: "umai-admins",
    CONTROL_CENTER_ADMIN_GROUPS_PLATFORM_ADMIN:
      "cn=umai-root,ou=groups,dc=example,dc=com; cn=umai-ops,ou=groups,dc=example,dc=com",
  };
  assert.deepEqual(resolveAdminRoles({ groups: ["CN=umai-admins,OU=Groups"] }, mapping), [
    "tenant-admin",
  ]);
  assert.deepEqual(
    resolveAdminRoles(
      { groups: ["cn=umai-root,ou=groups,dc=example,dc=com", "cn=umai-admins,ou=x"] },
      mapping
    ),
    ["platform-admin", "tenant-admin"]
  );
  // No mapped group: falls back to CONTROL_CENTER_ADMIN_ROLE.
  assert.deepEqual(resolveAdminRoles({ groups: USER.groups }, mapping), ["tenant-auditor"]);
});
