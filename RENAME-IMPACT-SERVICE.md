# Service Integration Contract (UMAI)

This document lists the Control Center assumptions that the service app must
match in the current UMAI runtime contract.

---

## 1. Docker / Deployment Container Hostname

**Files involved:**
- `src/app/api/admin/[...path]/route.ts`
- `src/app/api/public/[...path]/route.ts`

**Current value:**
- `http://umai-service:8080/api/v1`
- `http://umai-service:8080/api/v1/admin`

These are the default fallback URLs used when
`CONTROL_CENTER_PUBLIC_API_URL` or `CONTROL_CENTER_ADMIN_API_URL` is not set.

**Service expectation:**
- Run the backend under the `umai-service` hostname, or set the control-center
  env vars to the correct upstream base URLs.

---

## 2. API Authentication Header

**File involved:** `src/app/api/tools/openai-agents-compare/route.ts`

**Current value:**
- `X-Umai-Api-Key: <key>`

This header is sent on guardrail requests from the compare tool to the service.

**Service expectation:**
- Accept `X-Umai-Api-Key` for public API key authentication.

---

## 3. JWT Audience Claim for Extension Device Tokens

**File involved:** `src/app/api/extension/device-token/route.ts`

**Current value:**
- `aud: "umai-ext-ingest"`

The Control Center mints short-lived JWTs for browser extension device
authentication, and the service validates the `aud` claim on ingest.

**Service expectation:**
- Accept `umai-ext-ingest` as the audience for extension ingest tokens.

---

## Summary

| Area | Current value | Service expectation |
|------|---------------|---------------------|
| Container hostname | `umai-service` | Backend reachable at that hostname or via configured env vars |
| API key header | `X-Umai-Api-Key` | Header accepted for public API auth |
| Extension JWT audience | `umai-ext-ingest` | Audience accepted during token validation |
