// Next.js startup hook. Runs once when the server process boots.
// See https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runStartupChecks } = await import("./lib/startup-checks");
  runStartupChecks();
}
