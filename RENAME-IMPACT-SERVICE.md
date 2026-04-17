# Rename Impact: duvarai → umai (Service App)

This document lists the changes made in the Control Center that **directly affect the service app** and require matching updates on the backend side.

---

## 1. Docker / Deployment — Container Hostname

**Files changed:**
- `src/app/api/admin/[...path]/route.ts`
- `src/app/api/public/[...path]/route.ts`

**What changed:**

| Before | After |
|--------|-------|
| `http://duvarai-service:8080/api/v1` | `http://umai-service:8080/api/v1` |
| `http://duvarai-service:8080/api/v1/admin` | `http://umai-service:8080/api/v1/admin` |

These are the default fallback URLs used when `CONTROL_CENTER_PUBLIC_API_URL` / `CONTROL_CENTER_ADMIN_API_URL` env vars are not set.

**Action required:**
Rename the service container in `docker-compose.yml` (or equivalent) from `duvarai-service` to `umai-service`, or explicitly set the env vars to the correct hostname.

---

## 2. API Authentication Header

**File changed:** `src/app/api/tools/openai-agents-compare/route.ts`

**What changed:**

| Before | After |
|--------|-------|
| `X-DuvarAI-Api-Key: <key>` | `X-Umai-Api-Key: <key>` |

This header is sent on every guardrail guard request from the compare tool to the service.

**Action required:**
Update the service app to read `X-Umai-Api-Key` instead of `X-DuvarAI-Api-Key` for API key authentication.

---

## 3. JWT Audience Claim — Extension Device Tokens

**File changed:** `src/app/api/extension/device-token/route.ts`

**What changed:**

| Before | After |
|--------|-------|
| `aud: "duvarai-ext-ingest"` | `aud: "umai-ext-ingest"` |

The Control Center mints short-lived JWTs for browser extension device authentication. These tokens are forwarded to the service ingest endpoint and the service must validate the `aud` claim.

**Action required:**
Update the service app's JWT validation to accept `umai-ext-ingest` as a valid audience. Remove or deprecate `duvarai-ext-ingest` once all issued tokens have expired (TTL is 1 hour).

---

## Summary

| # | What | Old value | New value | Service action |
|---|------|-----------|-----------|----------------|
| 1 | Container hostname | `duvarai-service` | `umai-service` | Rename container / set env var |
| 2 | API key header | `X-DuvarAI-Api-Key` | `X-Umai-Api-Key` | Read new header name |
| 3 | JWT audience | `duvarai-ext-ingest` | `umai-ext-ingest` | Accept new audience claim |
