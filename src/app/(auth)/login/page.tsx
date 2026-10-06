"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { BRAND_LOGO_WHITE, BRAND_NAME, CONTROL_CENTER_NAME } from "src/lib/branding";
import { BTN_PRIMARY, INPUT, InlineNotice, LABEL } from "src/app/(console)/console-ui";

const SUPPORT_EMAIL = "contact@umaisolutions.com";

export default function LoginPage() {
  const [returnTo, setReturnTo] = useState("/home");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReturnTo(params.get("returnTo") || "/home");
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: username, password, returnTo }),
      });
      const body = (await response.json().catch(() => null)) as
        | { redirectTo?: string; error?: string }
        | null;
      if (!response.ok) {
        setError(body?.error || "Sign-in failed. Check your username and password.");
        return;
      }
      window.location.assign(body?.redirectTo || returnTo);
    } catch {
      setError("The authentication service could not be reached. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[2fr_3fr]">
      <section className="flex flex-col justify-between bg-black px-8 py-8 text-white lg:px-12 lg:py-10">
        <Image
          src={BRAND_LOGO_WHITE}
          alt={`${BRAND_NAME} logo`}
          width={112}
          height={20}
          className="h-5 w-auto object-contain"
          priority
        />
        <div className="py-16 lg:py-0">
          <p className="text-sm font-medium text-white/60">{CONTROL_CENTER_NAME}</p>
          <h1 className="mt-2 max-w-md text-2xl font-semibold leading-snug lg:text-3xl">
            Guardrails, policies and monitoring for the AI your organization uses.
          </h1>
        </div>
        <p className="text-xs text-white/40">
          © {new Date().getFullYear()} {BRAND_NAME} Solutions
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-12 lg:px-12">
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5" noValidate>
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Sign in</h2>
            <p className="mt-1 text-sm text-gray-500">Use your corporate directory (LDAP) account.</p>
          </div>

          <div>
            <label className={LABEL} htmlFor="login-username">
              Username
            </label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              autoFocus
              className={`${INPUT} mt-1`}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="jdoe or jdoe@company.local"
              required
            />
          </div>

          <div>
            <label className={LABEL} htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              className={`${INPUT} mt-1`}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error && (
            <InlineNotice tone="error">
              <p>{error}</p>
              <p className="mt-1 text-xs">
                If the problem continues, contact{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium underline underline-offset-2">
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
            </InlineNotice>
          )}

          <button
            type="submit"
            className={`${BTN_PRIMARY} h-10 w-full`}
            disabled={submitting || !username.trim() || !password}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>

          <p className="text-xs text-gray-500">
            Accounts and access are managed by your UMAI administrator; there is no self-service
            sign-up.
          </p>
        </form>
      </section>
    </main>
  );
}
