import runbookMap from "./runbooks.json";

/**
 * Turn a service error type into the runbook that explains it.
 *
 * An operator looking at "AI_ENGINE_UNREACHABLE" in a toast has the same problem as one
 * looking at a firing alert, and gets much less help: the alert carries a runbook_url,
 * the toast carries a string. This closes that gap.
 *
 * `runbooks.json` is a byte-for-byte copy of `deploy/observability/runbooks.json` in the
 * platform repository, and platform CI fails if the two diverge. Maintaining a second
 * list here would work until the day the two disagreed, and the half that had rotted
 * would be this one — the half nobody exercises until an incident.
 */
const ERROR_CODE_RUNBOOKS: Record<string, string> = runbookMap.error_codes;

export function runbookForErrorCode(code: unknown): string | null {
    if (typeof code !== "string") return null;
    return ERROR_CODE_RUNBOOKS[code] ?? null;
}

/**
 * Append the runbook path to an error message, when there is one.
 *
 * The path is shown rather than linked on purpose. This is an on-premises console: the
 * runbooks ship with the deployment and there is no documentation site to link to, so a
 * path the operator can open is more useful than a link that may not resolve.
 */
export function withRunbook(message: string, code: unknown): string {
    const runbook = runbookForErrorCode(code);
    return runbook ? `${message} (runbook: ${runbook})` : message;
}
