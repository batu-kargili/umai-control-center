const API_BASE = "/api/admin";
const PUBLIC_API_BASE = "/api/public";
const MAX_AUDIT_EVENT_LIMIT = 500;

function adminJsonHeaders(tenantId?: string): HeadersInit {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (tenantId?.trim()) {
        headers["X-Tenant-Id"] = tenantId.trim();
    }
    return headers;
}

function adminTenantHeaders(tenantId?: string): HeadersInit {
    const headers: Record<string, string> = {};
    if (tenantId?.trim()) {
        headers["X-Tenant-Id"] = tenantId.trim();
    }
    return headers;
}

async function readApiErrorMessage(res: Response, fallback: string): Promise<string> {
    try {
        const payload = await res.json();
        const message =
            payload?.error?.message ||
            payload?.detail?.message ||
            payload?.message;
        return typeof message === "string" && message.trim() ? message : fallback;
    } catch {
        return fallback;
    }
}

export interface Environment {
    tenant_id: string;
    environment_id: string;
    name: string;
}

export interface Project {
    tenant_id: string;
    environment_id: string;
    project_id: string;
    name: string;
}

export interface Tenant {
    tenant_id: string;
    name: string;
    status: string;
    created_at?: string;
}

export interface License {
    tenant_id: string;
    status: string;
    expires_at: string;
    features_json?: Record<string, unknown> | null;
}

export type PolicyPhase =
    | "PRE_LLM"
    | "POST_LLM"
    | "TOOL_INPUT"
    | "TOOL_OUTPUT"
    | "MCP_REQUEST"
    | "MCP_RESPONSE"
    | "MEMORY_WRITE";
export type PolicyScope = "ORGANIZATION" | "ENVIRONMENT" | "PROJECT";

export const POLICY_PHASE_OPTIONS: PolicyPhase[] = [
    "PRE_LLM",
    "POST_LLM",
    "TOOL_INPUT",
    "TOOL_OUTPUT",
    "MCP_REQUEST",
    "MCP_RESPONSE",
    "MEMORY_WRITE",
];

export const POLICY_PHASE_LABELS: Record<PolicyPhase, string> = {
    PRE_LLM: "Before AI",
    POST_LLM: "After AI",
    TOOL_INPUT: "Tool Input",
    TOOL_OUTPUT: "Tool Output",
    MCP_REQUEST: "MCP Request",
    MCP_RESPONSE: "MCP Response",
    MEMORY_WRITE: "Memory Write",
};

export interface Policy {
    tenant_id: string;
    environment_id: string;
    project_id: string;
    policy_id: string;
    name: string;
    type: "HEURISTIC" | "CONTEXT_AWARE";
    enabled: boolean;
    phases: PolicyPhase[];
    config: Record<string, unknown>;
    scope?: PolicyScope;
    created_at?: string;
}

export interface Guardrail {
    tenant_id: string;
    environment_id: string;
    project_id: string;
    guardrail_id: string;
    name: string;
    mode: "ENFORCE" | "MONITOR";
    current_version: number;
}

export interface GuardrailVersion {
    tenant_id: string;
    environment_id: string;
    project_id: string;
    guardrail_id: string;
    version: number;
    created_at?: string;
}

export interface GuardrailSnapshotPolicy {
    id: string;
    type: "HEURISTIC" | "CONTEXT_AWARE";
    name: string;
    enabled: boolean;
    phases: PolicyPhase[];
    config: Record<string, unknown>;
}

export interface GuardrailSnapshot {
    guardrail_id: string;
    version: number;
    mode: "ENFORCE" | "MONITOR";
    phases: PolicyPhase[];
    preflight: Record<string, unknown>;
    policies: GuardrailSnapshotPolicy[];
    llm_config: Record<string, unknown>;
    agt?: AgtConfig | null;
}

export interface GuardrailSnapshotResponse {
    tenant_id: string;
    environment_id: string;
    project_id: string;
    guardrail_id: string;
    version: number;
    redis_key: string;
    redis_available: boolean;
    redis_present: boolean;
    snapshot: GuardrailSnapshot;
}

export type ChatRole = "system" | "user" | "assistant";
export type PhaseFocus = "LAST_USER_MESSAGE" | "LAST_ASSISTANT_MESSAGE";
export type ContentType = "text" | "markdown" | "json";

export interface ChatMessage {
    role: ChatRole;
    content: string;
}

export interface GuardrailInputArtifact {
    artifact_type:
        | "TOOL_INPUT"
        | "TOOL_OUTPUT"
        | "MCP_REQUEST"
        | "MCP_RESPONSE"
        | "MEMORY_WRITE"
        | "CUSTOM";
    name?: string | null;
    payload_summary?: string | null;
    metadata: Record<string, unknown>;
}

export interface GuardrailInputPayload {
    messages: ChatMessage[];
    phase_focus: PhaseFocus;
    content_type: ContentType;
    language?: string;
    artifacts?: GuardrailInputArtifact[];
}

export interface AgtPolicyCondition {
    field: string;
    operator:
        | "EQUALS"
        | "NOT_EQUALS"
        | "IN"
        | "NOT_IN"
        | "CONTAINS"
        | "MATCHES_REGEX"
        | "EXISTS"
        | "NOT_EXISTS"
        | "STARTS_WITH"
        | "ENDS_WITH"
        | "GT"
        | "GTE"
        | "LT"
        | "LTE";
    value?: unknown;
}

export interface AgtPolicyRule {
    id: string;
    description?: string | null;
    effect: "ALLOW" | "BLOCK" | "STEP_UP_APPROVAL" | "ALLOW_WITH_WARNINGS";
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    conditions: AgtPolicyCondition[];
}

export interface AgtPolicyDocument {
    version: string;
    default_action: "ALLOW" | "BLOCK" | "STEP_UP_APPROVAL" | "ALLOW_WITH_WARNINGS";
    rules: AgtPolicyRule[];
}

export interface AgtConfig {
    enabled: boolean;
    mode: "ENFORCE" | "ADVISORY";
    enforced_phases: PolicyPhase[];
    policy_document: AgtPolicyDocument;
    bundle_ref?: string | null;
    fail_closed: boolean;
}

export interface GuardrailTestDecision {
    action: string;
    allowed: boolean;
    severity: string;
    reason: string;
}

export interface GuardrailTestTriggeringPolicy {
    policy_id: string;
    type: string;
    name: string;
    status: string;
    severity: string;
    score?: number | null;
    details: Record<string, unknown>;
    latency_ms: number;
}

export interface GuardrailTestLatency {
    total: number;
    preflight?: number | null;
}

export interface GuardrailTestResponse {
    request_id: string;
    guardrail_id: string;
    guardrail_version: number;
    phase: PolicyPhase;
    decision: GuardrailTestDecision;
    triggering_policy?: GuardrailTestTriggeringPolicy | null;
    latency_ms: GuardrailTestLatency;
    errors: {
        type: string;
        source?: string | null;
        message?: string | null;
        retryable?: boolean | null;
    }[];
}

export type AlertDecision = "BLOCK" | "FLAG";
export type AlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface AlertItem {
    id: string;
    workflow: string;
    flow: string;
    category: string;
    policy: string;
    guardrail_id: string;
    decision: AlertDecision;
    severity: AlertSeverity;
    phase: PolicyPhase;
    latency_ms: number;
    created_at: string;
    message: string;
    request_id: string;
    matched_rule: string;
}

export interface AuditEventItem {
    id: string;
    tenant_id: string;
    environment_id: string;
    project_id: string;
    guardrail_id: string;
    guardrail_version: number;
    request_id: string;
    phase: string;
    action: string;
    allowed: boolean;
    category?: string | null;
    decision_severity?: string | null;
    decision_reason?: string | null;
    latency_ms?: number | null;
    conversation_id?: string | null;
    message?: string | null;
    triggering_policy?: Record<string, unknown> | null;
    redacted: boolean;
    prev_event_hash?: string | null;
    event_hash?: string | null;
    event_signature?: string | null;
    hash_key_id?: string | null;
    created_at: string;
}

export interface EvidencePackItem {
    id: string;
    tenant_id: string;
    environment_id?: string | null;
    project_id?: string | null;
    regime: "EU_AI_ACT" | "GDPR" | "CPRA_ADMT" | "SEC_CYBER" | "CUSTOM";
    status: string;
    timeframe_start?: string | null;
    timeframe_end?: string | null;
    summary: Record<string, unknown>;
    artifact?: Record<string, unknown> | null;
    created_by?: string | null;
    created_at: string;
}

export interface ExtensionEventItem {
    id: string;
    tenant_id: string;
    event_id: string;
    event_type: string;
    site: string;
    url: string;
    tab_id?: number | null;
    user_email?: string | null;
    user_idp_subject?: string | null;
    device_id: string;
    browser_profile_id?: string | null;
    captured_at: string;
    prev_event_hash?: string | null;
    event_hash: string;
    chain_valid: boolean;
    chain_error?: string | null;
    decision?: string | null;
    message?: string | null;
    status?: string | null;
    prompt_hash?: string | null;
    response_hash?: string | null;
    prompt_len?: number | null;
    response_len?: number | null;
    payload: Record<string, unknown>;
    created_at: string;
}

export interface ExtensionDailyCount {
    day: string;
    count: number;
}

export interface ExtensionSummary {
    total_events: number;
    unique_devices: number;
    unique_users: number;
    blocked_events: number;
    warned_events: number;
    redacted_events: number;
    last_event_at?: string | null;
    by_site: Record<string, number>;
    by_event_type: Record<string, number>;
    by_decision: Record<string, number>;
    daily: ExtensionDailyCount[];
}

export type EvaluationStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export interface EvaluationMetrics {
    total: number;
    allowed: number;
    blocked: number;
    flagged: number;
    actions: Record<string, number>;
    expected_action_total?: number;
    expected_action_matches?: number;
    expected_action_accuracy?: number | null;
    expected_allowed_total?: number;
    expected_allowed_matches?: number;
    expected_allowed_accuracy?: number | null;
    expected_severity_total?: number;
    expected_severity_matches?: number;
    expected_severity_accuracy?: number | null;
    action_confusion?: Record<string, Record<string, number>>;
}

export interface EvaluationRun {
    id: string;
    tenant_id: string;
    environment_id: string;
    project_id: string;
    guardrail_id: string;
    guardrail_version: number;
    name?: string | null;
    dataset_id?: string | null;
    phase: PolicyPhase;
    status: EvaluationStatus;
    total_cases: number;
    processed_cases: number;
    metrics?: EvaluationMetrics | null;
    error_message?: string | null;
    created_at?: string | null;
    completed_at?: string | null;
}

export interface EvaluationCase {
    id: string;
    run_id: string;
    index: number;
    label?: string | null;
    prompt: string;
    expected_action?: string | null;
    expected_allowed?: boolean | null;
    expected_severity?: string | null;
    decision_action?: string | null;
    decision_allowed?: boolean | null;
    decision_severity?: string | null;
    decision_reason?: string | null;
    expected_action_match?: boolean | null;
    expected_allowed_match?: boolean | null;
    expected_severity_match?: boolean | null;
    triggering_policy?: Record<string, unknown> | null;
    latency_ms?: number | null;
    errors?: Record<string, unknown>[] | null;
}

export interface EvaluationRunDetail extends EvaluationRun {
    cases: EvaluationCase[];
}

export interface EvaluationSet {
    id: string;
    name: string;
    description?: string | null;
    total_cases: number;
}

export interface PolicyLibraryItem {
    template_id: string;
    default_policy_id: string;
    name: string;
    description?: string;
    type: "HEURISTIC" | "CONTEXT_AWARE";
    enabled: boolean;
    phases: PolicyPhase[];
    config: Record<string, unknown>;
    managed: boolean;
    tags?: string[];
}

export interface GuardrailLibraryPolicy {
    template_id: string;
    default_policy_id: string;
    name: string;
    description?: string;
    type: "HEURISTIC" | "CONTEXT_AWARE";
    enabled: boolean;
    phases: PolicyPhase[];
    config: Record<string, unknown>;
    managed: boolean;
    tags?: string[];
}

export interface GuardrailLibraryItem {
    template_id: string;
    default_guardrail_id: string;
    name: string;
    description?: string;
    mode: "ENFORCE" | "MONITOR";
    version: number;
    phases: PolicyPhase[];
    preflight: Record<string, unknown>;
    llm_config: Record<string, unknown>;
    agt?: AgtConfig | null;
    policies: GuardrailLibraryPolicy[];
    managed: boolean;
    tags?: string[];
}

export interface GuardrailLibraryDeployResponse {
    guardrail: Guardrail;
    version: GuardrailVersion;
    policy_ids: string[];
    published: boolean;
    redis_key?: string | null;
}

export interface AgenticPolicyDraft {
    policy_id: string;
    name: string;
    type: "HEURISTIC" | "CONTEXT_AWARE";
    enabled: boolean;
    phases: PolicyPhase[];
    config: Record<string, unknown>;
}

export interface AgenticGuardrailDraft {
    guardrail: {
        guardrail_id: string;
        name: string;
        mode: "ENFORCE" | "MONITOR";
        phases: PolicyPhase[];
        preflight: Record<string, unknown>;
        llm_config: Record<string, unknown>;
        agt?: AgtConfig | null;
    };
    policies: AgenticPolicyDraft[];
    rationale: string;
    notes: string[];
}

export interface AgentRegistryItem {
    tenant_id: string;
    environment_id: string;
    project_id: string;
    agent_id: string;
    display_name: string;
    runtime: string;
    owner?: string | null;
    risk_tier: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    status: "ACTIVE" | "DISABLED" | "DEPRECATED";
    agent_did?: string | null;
    public_key_fingerprint?: string | null;
    capabilities: string[];
    trust_score: number;
    trust_tier: string;
    identity_status: string;
    kill_switch_enabled: boolean;
    kill_switch_reason?: string | null;
    last_seen_at?: string | null;
    metadata?: Record<string, unknown> | null;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface AgentBootstrapTokenResponse {
    token_id: string;
    tenant_id: string;
    environment_id: string;
    project_id: string;
    agent_id: string;
    bootstrap_token: string;
    expires_at: string;
}

export interface AgentRunSession {
    tenant_id: string;
    environment_id: string;
    project_id: string;
    run_id: string;
    agent_id: string;
    agent_did: string;
    guardrail_id?: string | null;
    status: string;
    decision_action?: string | null;
    decision_severity?: string | null;
    trust_score?: number | null;
    trust_tier?: string | null;
    summary?: Record<string, unknown> | null;
    started_at?: string | null;
    updated_at?: string | null;
    completed_at?: string | null;
    step_count: number;
}

export interface AgentRunStep {
    run_id: string;
    step_id: string;
    parent_step_id?: string | null;
    sequence: number;
    event_type: string;
    phase?: string | null;
    status: string;
    agent_id: string;
    agent_did: string;
    action?: string | null;
    resource_type?: string | null;
    resource_name?: string | null;
    decision_action?: string | null;
    decision_severity?: string | null;
    decision_reason?: string | null;
    policy_id?: string | null;
    matched_rule_id?: string | null;
    latency_ms?: number | null;
    payload_summary?: string | null;
    metadata?: Record<string, unknown> | null;
    input_hash?: string | null;
    output_hash?: string | null;
    prev_step_hash?: string | null;
    step_hash?: string | null;
    audit_event_id?: string | null;
    created_at?: string | null;
}

export interface AgentRunDetail extends AgentRunSession {
    steps: AgentRunStep[];
    audit_events: AuditEventItem[];
}

export interface FreeSubscriptionResponse {
    tenant_id: string;
    plan: string;
    license_expires_at: string;
}

export async function fetchTenants(): Promise<Tenant[]> {
    const res = await fetch(`${API_BASE}/tenants`);
    if (!res.ok) throw new Error("Failed to fetch tenants");
    return res.json();
}

export async function fetchLicense(tenantId: string): Promise<License | null> {
    const res = await fetch(`${API_BASE}/tenants/${tenantId}/license`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("Failed to fetch license");
    return res.json();
}

export async function applyLicenseToken(payload: { token: string }): Promise<License> {
    const res = await fetch(`${API_BASE}/licenses/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to apply license");
    return res.json();
}

export async function fetchEnvironments(tenantId: string): Promise<Environment[]> {
    const res = await fetch(`${API_BASE}/environments`, {
        headers: { "X-Tenant-Id": tenantId },
    });
    if (!res.ok) throw new Error("Failed to fetch environments");
    return res.json();
}

export async function createEnvironment(payload: {
    tenant_id: string;
    environment_id: string;
    name: string;
}): Promise<Environment> {
    const res = await fetch(`${API_BASE}/environments`, {
        method: "POST",
        headers: adminJsonHeaders(payload.tenant_id),
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to create environment");
    return res.json();
}

export async function fetchProjects(tenantId: string, envId: string): Promise<Project[]> {
    const res = await fetch(`${API_BASE}/projects/${tenantId}/${envId}`, {
        headers: adminTenantHeaders(tenantId),
    });
    if (!res.ok) throw new Error("Failed to fetch projects");
    return res.json();
}

export async function createProject(payload: {
    tenant_id: string;
    environment_id: string;
    project_id: string;
    name: string;
}): Promise<Project> {
    const res = await fetch(`${API_BASE}/projects`, {
        method: "POST",
        headers: adminJsonHeaders(payload.tenant_id),
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to create project");
    return res.json();
}

export interface ApiKeyResponse {
    id: string;
    tenant_id: string;
    environment_id: string;
    project_id: string | null;
    api_key?: string | null;
    name?: string | null;
    key_preview?: string | null;
    created_at?: string | null;
    revoked?: boolean;
}

export async function createApiKey(payload: {
    tenant_id: string;
    environment_id: string;
    project_id: string;
    name?: string;
}): Promise<ApiKeyResponse> {
    const res = await fetch(`${API_BASE}/api-keys`, {
        method: "POST",
        headers: adminJsonHeaders(payload.tenant_id),
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to create API key");
    return res.json();
}

export async function fetchApiKeys(
    tenantId: string,
    environmentId: string,
    projectId: string
): Promise<ApiKeyResponse[]> {
    const params = new URLSearchParams({
        environment_id: environmentId,
        project_id: projectId,
    });
    const res = await fetch(`${API_BASE}/api-keys?${params.toString()}`, {
        headers: { "X-Tenant-Id": tenantId },
    });
    if (!res.ok) throw new Error("Failed to fetch API keys");
    return res.json();
}

export async function revokeApiKey(
    tenantId: string,
    keyId: string
): Promise<ApiKeyResponse> {
    const res = await fetch(`${API_BASE}/api-keys/${keyId}`, {
        method: "DELETE",
        headers: { "X-Tenant-Id": tenantId },
    });
    if (!res.ok) throw new Error("Failed to revoke API key");
    return res.json();
}

export async function fetchPolicies(
    tenantId: string,
    envId: string,
    projectId: string
): Promise<Policy[]> {
    const res = await fetch(`${API_BASE}/policies/${envId}/${projectId}`, {
        headers: { "X-Tenant-Id": tenantId },
    });
    if (!res.ok) throw new Error("Failed to fetch policies");
    return res.json();
}

export async function createPolicy(payload: Omit<Policy, "created_at">): Promise<Policy> {
    const res = await fetch(`${API_BASE}/policies`, {
        method: "POST",
        headers: adminJsonHeaders(payload.tenant_id),
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const error = await readApiErrorMessage(res, "Failed to create policy");
        throw new Error(error);
    }
    return res.json();
}

export async function updatePolicy(
    tenantId: string,
    envId: string,
    projectId: string,
    policyId: string,
    payload: Partial<Pick<Policy, "name" | "enabled" | "phases" | "config">>
): Promise<Policy> {
    const res = await fetch(`${API_BASE}/policies/${envId}/${projectId}/${policyId}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            "X-Tenant-Id": tenantId,
        },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to update policy");
    return res.json();
}

export async function fetchGuardrails(
    tenantId: string,
    envId: string,
    projectId: string
): Promise<Guardrail[]> {
    const res = await fetch(`${API_BASE}/guardrails/${envId}/${projectId}`, {
        headers: { "X-Tenant-Id": tenantId },
    });
    if (!res.ok) throw new Error("Failed to fetch guardrails");
    return res.json();
}

export async function createGuardrail(payload: Omit<Guardrail, "current_version"> & { current_version?: number }): Promise<Guardrail> {
    const res = await fetch(`${API_BASE}/guardrails`, {
        method: "POST",
        headers: adminJsonHeaders(payload.tenant_id),
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const error = await readApiErrorMessage(res, "Failed to create guardrail");
        throw new Error(error);
    }
    return res.json();
}

export async function fetchGuardrailVersions(
    tenantId: string,
    envId: string,
    projectId: string,
    guardrailId: string
): Promise<GuardrailVersion[]> {
    const res = await fetch(`${API_BASE}/guardrails/${envId}/${projectId}/${guardrailId}/versions`, {
        headers: { "X-Tenant-Id": tenantId },
    });
    if (!res.ok) throw new Error("Failed to fetch guardrail versions");
    return res.json();
}

export async function createGuardrailVersion(
    guardrailId: string,
    payload: {
        tenant_id: string;
        environment_id: string;
        project_id: string;
        version: number;
        policy_ids?: string[];
        preflight?: Record<string, unknown>;
        llm_config?: Record<string, unknown>;
        phases?: PolicyPhase[];
        agt?: AgtConfig;
        snapshot_json?: Record<string, unknown>;
    }
): Promise<GuardrailVersion> {
    const res = await fetch(`${API_BASE}/guardrails/${guardrailId}/versions`, {
        method: "POST",
        headers: adminJsonHeaders(payload.tenant_id),
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const error = await readApiErrorMessage(res, "Failed to create guardrail version");
        throw new Error(error);
    }
    return res.json();
}

export async function publishGuardrailVersion(
    guardrailId: string,
    version: number,
    payload: {
        tenant_id: string;
        environment_id: string;
        project_id: string;
        publisher_id?: string;
        approver_id?: string;
        bypass_eval_gate?: boolean;
        bypass_reason?: string;
        break_glass_reason?: string;
    }
): Promise<{ redis_key: string }> {
    const res = await fetch(`${API_BASE}/guardrails/${guardrailId}/publish/${version}`, {
        method: "POST",
        headers: adminJsonHeaders(payload.tenant_id),
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const error = await readApiErrorMessage(res, "Failed to publish guardrail version");
        throw new Error(error);
    }
    return res.json();
}

export async function fetchGuardrailSnapshot(
    tenantId: string,
    envId: string,
    projectId: string,
    guardrailId: string,
    version: number
): Promise<GuardrailSnapshotResponse> {
    const res = await fetch(
        `${API_BASE}/guardrails/${envId}/${projectId}/${guardrailId}/snapshot/${version}`,
        {
            headers: { "X-Tenant-Id": tenantId },
        }
    );
    if (!res.ok) throw new Error("Failed to fetch guardrail snapshot");
    return res.json();
}

export async function testGuardrail(payload: {
    tenant_id: string;
    environment_id: string;
    project_id: string;
    guardrail_id: string;
    guardrail_version?: number;
    phase: PolicyPhase;
    input: GuardrailInputPayload;
    timeout_ms?: number;
    allow_llm_calls?: boolean;
}): Promise<GuardrailTestResponse> {
    const res = await fetch(`${API_BASE}/test/guard`, {
        method: "POST",
        headers: adminJsonHeaders(payload.tenant_id),
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to test guardrail");
    return res.json();
}

export async function fetchAlerts(
    tenantId: string,
    envId: string,
    projectId: string,
    limit = 50
): Promise<AlertItem[]> {
    const res = await fetch(
        `${API_BASE}/alerts/${envId}/${projectId}?limit=${limit}`,
        {
            headers: { "X-Tenant-Id": tenantId },
        }
    );
    if (!res.ok) throw new Error("Failed to fetch alerts");
    return res.json();
}

export async function fetchAuditEvents(
    tenantId: string,
    params?: {
        environment_id?: string;
        project_id?: string;
        guardrail_id?: string;
        action?: string;
        phase?: string;
        limit?: number;
    }
): Promise<AuditEventItem[]> {
    const query = new URLSearchParams();
    if (params?.environment_id) query.set("environment_id", params.environment_id);
    if (params?.project_id) query.set("project_id", params.project_id);
    if (params?.guardrail_id) query.set("guardrail_id", params.guardrail_id);
    if (params?.action) query.set("action", params.action);
    if (params?.phase) query.set("phase", params.phase);
    if (params?.limit) {
        query.set("limit", String(Math.min(params.limit, MAX_AUDIT_EVENT_LIMIT)));
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const res = await fetch(`${API_BASE}/audit-events${suffix}`, {
        headers: { "X-Tenant-Id": tenantId },
    });
    if (!res.ok) throw new Error("Failed to fetch audit events");
    return res.json();
}

export async function exportAuditEvents(
    tenantId: string,
    params?: {
        environment_id?: string;
        project_id?: string;
        guardrail_id?: string;
        action?: string;
        phase?: string;
        limit?: number;
    }
): Promise<string> {
    const query = new URLSearchParams();
    if (params?.environment_id) query.set("environment_id", params.environment_id);
    if (params?.project_id) query.set("project_id", params.project_id);
    if (params?.guardrail_id) query.set("guardrail_id", params.guardrail_id);
    if (params?.action) query.set("action", params.action);
    if (params?.phase) query.set("phase", params.phase);
    query.set("limit", String(params?.limit ?? 1000));
    const res = await fetch(`${API_BASE}/audit-events/export?${query.toString()}`, {
        headers: { "X-Tenant-Id": tenantId },
    });
    if (!res.ok) throw new Error("Failed to export audit events");
    return res.text();
}

export async function fetchEvidencePacks(
    tenantId: string,
    params?: {
        environment_id?: string;
        project_id?: string;
        regime?: string;
        limit?: number;
    }
): Promise<EvidencePackItem[]> {
    const query = new URLSearchParams();
    if (params?.environment_id) query.set("environment_id", params.environment_id);
    if (params?.project_id) query.set("project_id", params.project_id);
    if (params?.regime) query.set("regime", params.regime);
    if (params?.limit) query.set("limit", String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const res = await fetch(`${API_BASE}/evidence-packs${suffix}`, {
        headers: { "X-Tenant-Id": tenantId },
    });
    if (!res.ok) throw new Error("Failed to fetch evidence packs");
    return res.json();
}

export async function fetchExtensionEvents(
    tenantId: string,
    params?: {
        site?: string;
        event_type?: string;
        decision?: string;
        device_id?: string;
        chain_valid?: boolean;
        from_ts?: string;
        to_ts?: string;
        limit?: number;
    }
): Promise<ExtensionEventItem[]> {
    const query = new URLSearchParams();
    if (params?.site) query.set("site", params.site);
    if (params?.event_type) query.set("event_type", params.event_type);
    if (params?.decision) query.set("decision", params.decision);
    if (params?.device_id) query.set("device_id", params.device_id);
    if (typeof params?.chain_valid === "boolean") {
        query.set("chain_valid", params.chain_valid ? "true" : "false");
    }
    if (params?.from_ts) query.set("from_ts", params.from_ts);
    if (params?.to_ts) query.set("to_ts", params.to_ts);
    if (params?.limit) query.set("limit", String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const res = await fetch(`${API_BASE}/extension/events${suffix}`, {
        headers: { "X-Tenant-Id": tenantId },
    });
    if (!res.ok) throw new Error("Failed to fetch extension events");
    return res.json();
}

export async function fetchExtensionSummary(
    tenantId: string,
    days = 7
): Promise<ExtensionSummary> {
    const query = new URLSearchParams({ days: String(days) });
    const res = await fetch(`${API_BASE}/extension/summary?${query.toString()}`, {
        headers: { "X-Tenant-Id": tenantId },
    });
    if (!res.ok) throw new Error("Failed to fetch extension summary");
    return res.json();
}

export async function createEvidencePack(payload: {
    tenant_id: string;
    regime: "EU_AI_ACT" | "GDPR" | "CPRA_ADMT" | "SEC_CYBER" | "CUSTOM";
    environment_id?: string;
    project_id?: string;
    timeframe_start?: string;
    timeframe_end?: string;
    created_by?: string;
}): Promise<EvidencePackItem> {
    const res = await fetch(`${API_BASE}/evidence-packs`, {
        method: "POST",
        headers: adminJsonHeaders(payload.tenant_id),
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to create evidence pack");
    return res.json();
}

export async function fetchPolicyLibrary(): Promise<PolicyLibraryItem[]> {
    const res = await fetch(`${API_BASE}/library/policies`);
    if (!res.ok) throw new Error("Failed to fetch policy library");
    return res.json();
}

export async function fetchEvaluationSets(): Promise<EvaluationSet[]> {
    const res = await fetch(`${API_BASE}/evaluations/sets`);
    if (!res.ok) throw new Error("Failed to fetch evaluation sets");
    return res.json();
}

export async function fetchEvaluationRuns(
    tenantId: string,
    envId: string,
    projectId: string
): Promise<EvaluationRun[]> {
    const params = new URLSearchParams({
        environment_id: envId,
        project_id: projectId,
    });
    const res = await fetch(`${API_BASE}/evaluations?${params.toString()}`, {
        headers: { "X-Tenant-Id": tenantId },
    });
    if (!res.ok) throw new Error("Failed to fetch evaluations");
    return res.json();
}

export async function fetchEvaluationRun(
    tenantId: string,
    runId: string,
    limit = 50
): Promise<EvaluationRunDetail> {
    const res = await fetch(`${API_BASE}/evaluations/${runId}?limit=${limit}`, {
        headers: { "X-Tenant-Id": tenantId },
    });
    if (!res.ok) throw new Error("Failed to fetch evaluation run");
    return res.json();
}

export async function createEvaluationRun(
    tenantId: string,
    formData: FormData
): Promise<EvaluationRun> {
    const res = await fetch(`${API_BASE}/evaluations`, {
        method: "POST",
        headers: { "X-Tenant-Id": tenantId },
        body: formData,
    });
    if (!res.ok) throw new Error("Failed to create evaluation run");
    return res.json();
}

export async function deployPolicyTemplate(payload: {
    tenant_id: string;
    environment_id: string;
    project_id: string;
    template_id: string;
    policy_id?: string;
    name?: string;
}): Promise<Policy> {
    const res = await fetch(`${API_BASE}/library/policies/deploy`, {
        method: "POST",
        headers: adminJsonHeaders(payload.tenant_id),
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to deploy policy template");
    return res.json();
}

export async function fetchGuardrailLibrary(): Promise<GuardrailLibraryItem[]> {
    const res = await fetch(`${API_BASE}/library/guardrails`);
    if (!res.ok) throw new Error("Failed to fetch guardrail library");
    return res.json();
}

export async function deployGuardrailTemplate(payload: {
    tenant_id: string;
    environment_id: string;
    project_id: string;
    template_id: string;
    guardrail_id?: string;
    name?: string;
    mode?: Guardrail["mode"];
    publish?: boolean;
}): Promise<GuardrailLibraryDeployResponse> {
    const res = await fetch(`${API_BASE}/library/guardrails/deploy`, {
        method: "POST",
        headers: adminJsonHeaders(payload.tenant_id),
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const error = await readApiErrorMessage(res, "Failed to deploy guardrail template");
        throw new Error(error);
    }
    return res.json();
}

export async function generateAgenticGuardrail(payload: {
    tenant_id: string;
    environment_id: string;
    project_id: string;
    agent_description: string;
    agent_type: string;
    target_audience: string;
    available_countries: string[];
    architecture: string[];
}): Promise<AgenticGuardrailDraft> {
    const res = await fetch(`${API_BASE}/guardrails/agentic`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Tenant-Id": payload.tenant_id,
        },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to generate guardrail draft");
    return res.json();
}

export async function fetchAgentRegistry(
    tenantId: string,
    envId: string,
    projectId: string
): Promise<AgentRegistryItem[]> {
    const query = new URLSearchParams({ environment_id: envId, project_id: projectId });
    const res = await fetch(`${API_BASE}/registry/agents?${query.toString()}`, {
        headers: adminTenantHeaders(tenantId),
    });
    if (!res.ok) throw new Error("Failed to fetch agent registry");
    return res.json();
}

export async function upsertAgentRegistry(payload: {
    tenant_id: string;
    environment_id: string;
    project_id: string;
    agent_id: string;
    display_name: string;
    runtime: string;
    owner?: string;
    risk_tier?: AgentRegistryItem["risk_tier"];
    status?: AgentRegistryItem["status"];
    capabilities?: string[];
    trust_score?: number;
    trust_tier?: string;
    identity_status?: string;
    kill_switch_enabled?: boolean;
    metadata?: Record<string, unknown>;
}): Promise<AgentRegistryItem> {
    const res = await fetch(`${API_BASE}/registry/agents/${encodeURIComponent(payload.agent_id)}`, {
        method: "PUT",
        headers: adminJsonHeaders(payload.tenant_id),
        body: JSON.stringify({
            tenant_id: payload.tenant_id,
            environment_id: payload.environment_id,
            project_id: payload.project_id,
            agent_id: payload.agent_id,
            display_name: payload.display_name,
            runtime: payload.runtime,
            owner: payload.owner,
            risk_tier: payload.risk_tier ?? "MEDIUM",
            status: payload.status ?? "ACTIVE",
            capabilities: payload.capabilities ?? [],
            trust_score: payload.trust_score ?? 0.25,
            trust_tier: payload.trust_tier ?? "SANDBOX",
            identity_status: payload.identity_status ?? "UNREGISTERED",
            kill_switch_enabled: payload.kill_switch_enabled ?? false,
            metadata: payload.metadata ?? {},
        }),
    });
    if (!res.ok) throw new Error("Failed to save agent");
    return res.json();
}

export async function createAgentBootstrapToken(payload: {
    tenant_id: string;
    environment_id: string;
    project_id: string;
    agent_id: string;
    expires_in_seconds?: number;
}): Promise<AgentBootstrapTokenResponse> {
    const res = await fetch(`${API_BASE}/registry/agents/${encodeURIComponent(payload.agent_id)}/bootstrap-token`, {
        method: "POST",
        headers: adminJsonHeaders(payload.tenant_id),
        body: JSON.stringify({
            tenant_id: payload.tenant_id,
            environment_id: payload.environment_id,
            project_id: payload.project_id,
            expires_in_seconds: payload.expires_in_seconds ?? 900,
        }),
    });
    if (!res.ok) throw new Error("Failed to create bootstrap token");
    return res.json();
}

export async function updateAgentKillSwitch(payload: {
    tenant_id: string;
    environment_id: string;
    project_id: string;
    agent_id: string;
    enabled: boolean;
    reason?: string;
}): Promise<AgentRegistryItem> {
    const res = await fetch(`${API_BASE}/registry/agents/${encodeURIComponent(payload.agent_id)}/kill-switch`, {
        method: "POST",
        headers: adminJsonHeaders(payload.tenant_id),
        body: JSON.stringify({
            tenant_id: payload.tenant_id,
            environment_id: payload.environment_id,
            project_id: payload.project_id,
            enabled: payload.enabled,
            reason: payload.reason,
        }),
    });
    if (!res.ok) throw new Error("Failed to update kill switch");
    return res.json();
}

export async function fetchAgentRuns(
    tenantId: string,
    envId: string,
    projectId: string,
    params?: { agent_id?: string; status?: string; decision?: string; limit?: number }
): Promise<AgentRunSession[]> {
    const query = new URLSearchParams({ environment_id: envId, project_id: projectId });
    if (params?.agent_id) query.set("agent_id", params.agent_id);
    if (params?.status) query.set("status", params.status);
    if (params?.decision) query.set("decision", params.decision);
    query.set("limit", String(params?.limit ?? 100));
    const res = await fetch(`${API_BASE}/agent-runs?${query.toString()}`, {
        headers: adminTenantHeaders(tenantId),
    });
    if (!res.ok) throw new Error("Failed to fetch agent runs");
    return res.json();
}

export async function fetchAgentRun(
    tenantId: string,
    envId: string,
    projectId: string,
    runId: string
): Promise<AgentRunDetail> {
    const query = new URLSearchParams({ environment_id: envId, project_id: projectId });
    const res = await fetch(`${API_BASE}/agent-runs/${encodeURIComponent(runId)}?${query.toString()}`, {
        headers: adminTenantHeaders(tenantId),
    });
    if (!res.ok) throw new Error("Failed to fetch agent run");
    return res.json();
}

export async function subscribeFree(payload: {
    tenant_name: string;
    admin_email?: string;
}): Promise<FreeSubscriptionResponse> {
    const res = await fetch(`${PUBLIC_API_BASE}/subscriptions/free`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to subscribe to free plan");
    return res.json();
}
