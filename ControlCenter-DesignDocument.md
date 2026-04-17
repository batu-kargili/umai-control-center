# Control Center Design Document

| **Author(s)** | Batu Kargili |
| --- | --- |
| **Version/Status** | v0.01 |
| **Date** | 28/12/25 |
| Content Description | Control Center is the operator-facing web UI for managing **tenants (organizations), environments, projects, guardrails, policies, licenses, keys**, and for **testing guardrails** and reviewing **usage/alerts**. It is a pure frontend application that communicates exclusively with **UMAI Service**. |

## Table of Contents

### 1. Introduction & Role in the Platform

**1.1 Purpose of Control Center**

**1.2 How Control Center Fits into UMAI Architecture**

**1.3 Responsibilities vs Non-Responsibilities**

**1.4 High-Level User Flow (Operator → Control Center → UMAI Service → AI Engine)**

### 2. UX Information Architecture

**2.1 Core Navigation Model (Tenant → Env → Project)**

**2.2 Primary Screens & Jobs-To-Be-Done**

**2.3 Guardrail Lifecycle UX (Draft → Publish → Rollback)**

**2.4 Testing UX (Single Message + Bulk)**

### 3. Frontend Architecture

**3.1 Tech Stack (Next.js, TypeScript, UI kit)**

**3.2 App Structure & Module Boundaries**

**3.3 Data Fetching Strategy (Server Actions vs API Routes vs Client Fetch)**

**3.4 State Management (URL state, cache, forms)**

**3.5 Error Handling & Empty States**

### 4. Data Structures & API Contracts

**4.1 API Client Conventions & Typed Contracts**

**4.2 Key Entities (Tenant/Env/Project/Guardrail/Policy)**

**4.3 Guardrail Snapshot Builder UI Model**

**4.4 Publish & Versioning Contracts**

**4.5 Audit / Events / Alerts Contracts**

### 5. Authentication, RBAC & Session Security

**5.1 Operator Authentication (LDAP → Service Session/JWT)**

**5.2 RBAC Enforcement Model**

**5.3 CSRF, Cookies, CORS, and Secure Headers**

### 6. Security & Hardening

**6.1 Threat Model (UI-facing risks)**

**6.2 Input Sanitization and XSS Protection**

**6.3 Secrets Handling (never store keys in browser)**

**6.4 Supply Chain Security (deps, builds, integrity)**

### 7. Deployment & Operations (On-Prem)

**7.1 Deployment Targets (Docker, K8s)**

**7.2 Runtime Configuration & Environment Variables**

**7.3 Reverse Proxy / TLS / Paths**

**7.4 Observability (frontend logs, error reporting)**

### 8. MVP Implementation Plan

**8.1 MVP Scope & Milestones**

**8.2 Page-by-Page Delivery Plan**

**8.3 Non-Goals & Phase-2 Backlog**

---

# 1. Introduction & Role in the Platform

## 1.1 Purpose of Control Center

Control Center provides operators (Enterprise security, IT, platform teams) a secure UI to:

- Create and manage **Organizations/Tenants**
- Create and manage **Environments** and **Projects**
- Create, edit, version and publish **Guardrails**
- Create and manage **Policies** (Heuristic and Context-Aware)
- Configure **LLM routing profiles** (open-source models or OpenAI key routing through Service)
- Generate and revoke **API keys** for enterprise apps
- View **Usage metrics**, **Events**, and **Alerts**
- Enforce and visualize **License state** (expiry, entitlements)

---

## 1.2 How Control Center Fits into UMAI Architecture

**Control Center (Next.js)** is the operator UI. It calls **UMAI Service (FastAPI)**:

- Control Center never calls AI Engine
- Control Center never reads Redis
- Control Center never touches SQL Server directly

All operations go through Service APIs:

- CRUD on config stored in SQL Server
- Publish guardrail snapshots to Redis
- Test guardrails by asking Service to call AI Engine internally

---

## 1.3 Responsibilities vs Non-Responsibilities

**Control Center is responsible for:**

- Secure operator login and session handling (browser side)
- CRUD workflows for control-plane objects (Tenant/Env/Project/Guardrail/Policy)
- Guardrail version UX (drafting, publishing, rollback selection)
- Validation UX (forms + schema-level errors from Service)
- Operator visibility (usage, alerts, audit events)
- Safe display of policy/guardrail config (never execute user content)

**Control Center is NOT responsible for:**

- Enforcing security decisions at runtime (AI Engine does)
- License enforcement logic (Service is source of truth)
- Building guardrail snapshots on the server side (Service does canonical snapshot materialization)
- Storing secrets or keys in browser storage

---

## 1.4 High-Level User Flow (Operator → Control Center → Service → Engine)

1. Operator logs into Control Center
2. Control Center receives a session (cookie/JWT) from UMAI Service
3. Operator selects **Tenant → Environment → Project**
4. Operator creates/edits guardrails and policies (draft)
5. Operator presses **Publish**
6. Service persists version in SQL Server and publishes snapshot to Redis
7. Operator uses **Test Guardrail**
8. Service calls AI Engine internally, returns decision + triggering policy
9. UI shows result, logs the test event

---

# 2. UX Information Architecture

## 2.1 Core Navigation Model (Tenant → Env → Project)

Control Center is scoped by selection:

- **Tenant** (Organization) is the root boundary
- **Environment** is within tenant (prod/stage/test)
- **Project** is within environment (each app/agent domain)
- **Guardrails** belong to project
- **Policies** can be tenant-wide or project-scoped (MVP: project-scoped is fine)

UI should always show current context:

- Breadcrumb: `Tenant / Environment / Project`
- Context switcher in header

---

## 2.2 Primary Screens & Jobs-To-Be-Done

### Operator Home

- Recently modified guardrails
- Active alerts (if any)
- License status summary

### Tenants

- List/create tenants
- License status and expiry
- (Later) tenant-wide RBAC

### Environments & Projects

- Create env/project
- Show assigned keys and guardrails

### Guardrails

- List guardrails (name, mode, current version, last published)
- Create new guardrail
- Edit draft version
- Publish version
- Rollback to previous version

### Policies

- Create/edit policies
- Policy type:
    - Heuristic (regex/exact match)
    - Context-Aware (instructions + definitions + examples)
- Attach policies to guardrails

### Test Guardrails

- Single message test (chat-style)
- Bulk test (upload JSONL/CSV in future)
- Show final decision + triggering policy details

### Events / Alerts / Metrics

- Time-filtered list of evaluations (audit)
- Alerts (rules, acknowledged/unacknowledged)
- Usage metrics: requests, block rate, p95 latency (from Service aggregated)

---

## 2.3 Guardrail Lifecycle UX (Draft → Publish → Rollback)

A guardrail should have:

- **Current Published Version** (immutable)
- **Draft Workspace** (editable)
- Version history list (v1, v2, v3…) with:
    - author
    - created time
    - publish time
    - change summary (optional)

Publish flow:

1. Validate draft
2. Confirm publish (shows what will change)
3. On success: UI updates “current version”
4. Optionally show “published to Redis” confirmation (from Service response)

Rollback flow:

- Select a previous version
- Confirm rollback (Service sets it as current and republishes snapshot)

---

## 2.4 Testing UX (Single Message + Bulk)

Single message test:

- Operator selects guardrail version (default current)
- Inputs message(s) with optional conversation history
- Submits
- UI displays:
    - ALLOW/BLOCK
    - category
    - triggering policy (id, name, rationale)
    - latency
    - error list if any

Bulk test (Phase 2):

- upload dataset
- show summary: block rate by category/policy

---

# 3. Frontend Architecture

## 3.1 Tech Stack

- **Next.js** (App Router)
- **TypeScript**
- UI components: Tailwind + a component library (shadcn/ui recommended)
- Form + validation: react-hook-form + zod
- Data fetching: fetch wrapper + typed clients
- Optional: TanStack Query for client caching (nice for events pages)

---

## 3.2 App Structure & Module Boundaries

Suggested structure:

```
src/
  app/
    (auth)/
      login/
    (console)/
      layout.tsx
      tenants/
      environments/
      projects/
      guardrails/
      policies/
      test/
      events/
      alerts/
      settings/
  components/
    layout/
    tables/
    forms/
    guardrail/
  lib/
    api/
      client.ts
      types.ts
      errors.ts
    auth/
      session.ts
      rbac.ts
    utils/

```

Rules:

- All calls go through `lib/api/client.ts`
- All API payloads are typed in `lib/api/types.ts`
- Pages should be thin (compose components + call hooks)

---

## 3.3 Data Fetching Strategy

On-prem environments often prefer predictable server-side behavior.

Recommended:

- Use **server components** for initial page loads (list tenants, list guardrails).
- Use **client components** only where needed:
    - forms with complex validation
    - live log/event views
    - test runner UI

Avoid putting secrets in the browser:

- Operator auth via HttpOnly cookies (preferred)
- API calls from browser carry session cookies; Service validates them

---

## 3.4 State Management

- URL state for:
    - selected tenant/env/project
    - time filters for events
    - pagination
- Form state in react-hook-form
- Cache:
    - server-side revalidation after publish/update
    - optional client cache for events pages

---

## 3.5 Error Handling & Empty States

Standardize UI error mapping:

- 401 → redirect to login
- 403 → show “insufficient permissions”
- 409 → “version conflict / stale draft”
- 422 → validation errors displayed next to fields
- 500/503 → “service unavailable” with retry

Empty states:

- no tenants
- no guardrails
- no policies
- no events

---

# 4. Data Structures & API Contracts

## 4.1 API Client Conventions

All Control Center calls should:

- send cookies (session) automatically
- include `X-Request-Id` header generated in UI for correlation
- expect structured errors (`{ error: { type, message, retryable } }`)

---

## 4.2 Key Entities

UI displays these as control-plane objects:

- Tenant: `{ tenant_id, name, status, license_expires_at }`
- Environment: `{ environment_id, name }`
- Project: `{ project_id, name }`
- Guardrail: `{ guardrail_id, name, mode, current_version }`
- GuardrailVersion: `{ version, created_at, snapshot_summary }`
- Policy:
    - Heuristic: regex/exact config
    - Context-Aware: instructions + definitions + examples

---

## 4.3 Guardrail Snapshot Builder UI Model

Important: UI can help operators build a guardrail *visually*, but Service must produce the canonical snapshot.

UI model:

- preflight rules
- policy list + per-policy config
- ensemble roles and modes
- LLM backend selection per policy

UI submits a “DraftConfig” to Service; Service validates and stores versioned snapshot.

---

## 4.4 Publish & Versioning Contracts

- Create draft version → returns version number
- Publish version → returns:
    - published version
    - redis key published
    - publish timestamp

Rollback:

- post rollback version selection → service republish snapshot

---

## 4.5 Audit / Events / Alerts Contracts

Events page consumes:

- list of evaluations with filters:
    - time range
    - guardrail
    - action (ALLOW/BLOCK)
    - category
    - severity

Alerts page consumes:

- active alerts
- acknowledge action (Phase 2)

---

# 5. Authentication, RBAC & Session Security

## 5.1 Operator Authentication (LDAP → Service Session/JWT)

Control Center login flow:

- UI posts credentials or SSO token to Service
- Service performs LDAP auth (or delegates) and returns session cookie (HttpOnly)
- UI never stores password; session lives in cookie

---

## 5.2 RBAC Enforcement Model

RBAC is enforced primarily in Service.

UI uses RBAC only to hide/show features (not as security).

Role examples:

- Tenant Admin
- Project Admin
- Auditor (read-only)
- Security Operator (alerts)

---

## 5.3 CSRF, Cookies, CORS

- Prefer same-site deployment behind same domain
- Use HttpOnly cookies + CSRF token header for mutation endpoints
- Strict CORS allow-list

---

# 6. Security & Hardening

## 6.1 Threat Model

UI threats:

- XSS from displaying policy content
- CSRF on admin mutations
- Token leakage in logs/local storage
- Supply chain compromise

---

## 6.2 Input Sanitization

- Never render untrusted HTML
- Display policy text in code blocks with escaping
- Use safe markdown renderer if needed (no raw HTML)

---

## 6.3 Secrets Handling

- Never store API keys in localStorage
- When showing generated keys:
    - show once, require re-generation afterwards
    - mask by default

---

## 6.4 Supply Chain Security

- lock dependencies
- run SCA scanning in CI (Phase 2)
- build reproducible Docker images

---

# 7. Deployment & Operations (On-Prem)

## 7.1 Deployment Targets

- Docker container
- Kubernetes Deployment (recommended)
- Behind reverse proxy (Nginx/Traefik) with TLS

---

## 7.2 Runtime Configuration

Environment variables:

- `UMAI_SERVICE_BASE_URL` (internal)
- `PUBLIC_APP_BASE_URL` (for redirects)
- feature flags (optional)

---

## 7.3 Reverse Proxy & Paths

Recommended:

- `https://umai.example.local/console` → Control Center
- `https://umai.example.local/api` → UMAI Service

---

## 7.4 Observability

- Frontend logs: minimal, never log secrets
- Error tracking: on-prem option (Sentry self-hosted) later
- Correlation: `X-Request-Id` propagated to Service logs

---

# 8. MVP Implementation Plan

## 8.1 MVP Scope (Phase 1)

Deliver these pages end-to-end:

1. Login (operator session)
2. Tenant list/create + license view
3. Environment + Project CRUD
4. Guardrail list/create/edit draft
5. Policies create/edit (heuristic + context-aware)
6. Attach policies to guardrail + set ensemble mode/roles
7. Publish guardrail version
8. Test guardrail (single message) → calls Service → Engine
9. Events list (audit) basic filter

---

## Control Center UI/UX & Design Principles

*UMAI culture: Microsoft-grade enterprise clarity + Confluent-grade operational rigor + OpenAI-grade simplicity & intelligence.*

---

# 1) Design North Star

**Control Center should feel like:**

- **Trustworthy and predictable** (operators never wonder “did it apply?”)
- **Fast to scan, easy to act** (high signal, low noise)
- **Safe by default** (no foot-guns; guardrails, versioning, and rollback are first-class)
- **Delightfully minimal** (smart defaults, helpful hints, less configuration fatigue)

**Primary user mindset:** “I’m managing risk in production. Show me what matters, let me act safely.”

---

# 2) Core UX Principles

## 2.1 Microsoft: Enterprise Clarity & Information Architecture

1. **Strong hierarchy, consistent layout**
- Left nav with clear sections (Tenants, Projects, Guardrails, Policies, Test, Events, Alerts, Settings)
- Persistent top bar for context: `Tenant / Environment / Project`
1. **Scannable density**
- Prefer data tables with:
    - sticky headers
    - column alignment
    - sortable fields
    - search + filters
- Use “detail drawer” or “details panel” instead of constant page changes.
1. **Predictable forms**
- Forms use:
    - labeled inputs (never placeholder-only)
    - inline validation
    - explicit Save/Cancel
    - clear “dirty state” warnings
1. **Enterprise-friendly accessibility**
- Keyboard navigation
- High contrast options
- Screen-reader semantics
- Avoid color-only meaning

## 2.2 Confluent: Operational Rigor & Lifecycle Control

1. **Everything is versioned**
- Guardrails always show:
    - current version
    - draft state
    - last publish time
    - published by
- Policy changes must clearly indicate:
    - which guardrails are impacted
1. **Safe change management**
- Publish is always a *review moment*:
    - diff summary
    - impacted projects/apps
    - rollback plan visible
- Rollback is one-click with explicit confirmation.
1. **Observability-first UI**
- Every action leaves a trail:
    - audit events
    - “why blocked?” drill-down
    - evaluation latency
- Alerts are actionable:
    - acknowledge
    - filter by severity/category/guardrail

## 2.3 OpenAI: Intelligent Simplicity & Guided Workflows

1. **Default paths should be “works out of the box”**
- Provide templates:
    - “Strict Enterprise Guardrail”
    - “PII & Secrets Guardrail”
    - “Prompt Injection Defense (Ensemble)”
- Smart defaults:
    - sensible timeouts
    - recommended ensemble mode (`PRIMARY_FAST`)
    - recommended phase focus (`LAST_USER_MESSAGE`)
1. **Progressive disclosure**
- Show the 20% of controls used 80% of the time.
- Advanced settings are collapsible:
    - “Advanced”
    - “Experimental”
    - “Performance”
1. **Explain decisions, don’t just show them**
- For BLOCK decisions:
    - category + short rationale
    - triggering policy name
    - “what to do next” guidance
- For ALLOW:
    - keep it lightweight (don’t overwhelm)

---

# 3) Interaction Principles

## 3.1 System Status & Confidence

- Always show **system readiness** at top:
    - Service: OK
    - AI Engine: OK
    - Redis Snapshot: OK
    - License: OK / expires in X days

## 3.2 Guardrail Authoring: “Draft Workspace”

- Draft mode is a protected area:
    - edits do not affect production until publish
- Draft banner:
    - “Draft changes not published”
    - “Publish” primary CTA
    - “Discard changes” secondary CTA

## 3.3 Publishing: “Review → Publish”

Publish is never a blind action:

- Step 1: Review (diff + impacted objects)
- Step 2: Validate (schema + engine compatibility check)
- Step 3: Publish (writes version to DB + snapshot to Redis)

## 3.4 Testing: “Instant Feedback Loop”

Test page should be fast and comforting:

- Chat-like input
- One-click “Test PRE_LLM”
- Result card:
    - decision
    - category
    - triggering policy
    - latency
- Quick toggles:
    - choose version (current vs selected)
    - include conversation history

---

# 4) Visual Design System

## 4.1 Tone: “Corporate but modern”

- Light mode default (enterprise-friendly)
- Calm neutrals, minimal gradients
- Use color sparingly to highlight:
    - severity
    - alerts
    - publish status

## 4.2 Layout & Spacing

- 12-column grid
- Consistent spacing scale (4/8/12/16/24/32)
- Page structure:
    - Title + subtitle (1 line description)
    - Action row (primary CTA + secondary actions)
    - Content (table/cards)

## 4.3 Component rules

**Tables (default for lists):**

- search + filters always above
- empty state: helpful message + CTA
- row actions: kebab menu, not clutter

**Cards (for summaries):**

- top-level metrics, “health”, “license”, “alerts”

**Drawers/Side panels:**

- edit/view details without navigation loss

**Modals:**

- only for destructive actions or publish confirmations

---

# 5) Naming & Content Principles (Microcopy)

- Use **operator language**:
    - “Publish Guardrail”
    - “Rollback to Version”
    - “Triggering Policy”
- Avoid jargon unless necessary.
- Every error message should include:
    - what happened
    - why it matters
    - what to do next

**Examples**

- Bad: “Error 409”
- Good: “Publish failed: Draft is out of date. Refresh to load latest version.”

---

# 6) UX for Multi-Tenancy (Enterprise reality)

- Tenant selection is explicit and persistent.
- Environment is always visible (prod/staging/test).
- Never allow cross-tenant context confusion:
    - show tenant name in header
    - color-badge for environment (e.g., PROD badge)
- “Danger zone” actions require explicit confirmation:
    - deleting guardrails/policies
    - rotating keys
    - disabling license

---

# 7) Key Screens and “What Good Looks Like”

## 7.1 Guardrails List

- columns:
    - Name
    - Mode (ENFORCE/MONITOR)
    - Current Version
    - Last Published
    - Alerts (count)
- actions:
    - View
    - Edit Draft
    - Test
    - Rollback

## 7.2 Guardrail Builder

- Sections:
    1. Preflight (heuristics)
    2. Policies (list with enable/disable)
    3. Ensemble (PRIMARY_FAST / STRICT)
    4. LLM Backends (mapping)
- “Validate” button before publish
- “Diff vs current” panel

## 7.3 Test Page

- Chat input
- Choose guardrail version
- Show decision result with drill-down

## 7.4 Events

- Filters:
    - time range
    - guardrail
    - decision
    - category
    - severity
- Drill-down event details

---

# 8) Accessibility & Compliance (Enterprise-grade)

- WCAG-aware UI patterns
- No color-only alerts
- Keyboard accessible forms and tables
- Export-ready views for audit (CSV/PDF later)

---

# 9) Default “UMAI Look”

If you want a one-liner guideline for designers/devs:

**“Neutral enterprise base, high density tables, safe change workflows, and intelligent defaults with minimal friction.”**