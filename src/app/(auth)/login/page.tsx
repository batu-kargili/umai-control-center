"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";

import {
  BRAND_LOGO_WHITE,
  BRAND_NAME,
  CONTROL_CENTER_NAME,
} from "src/lib/branding";

const SUPPORT_EMAIL = "contact@umaisolutions.com";
const LEARN_MORE_URL = "https://umaisolutions.com";

const PLATFORM_HIGHLIGHTS = [
  {
    title: "Unified control plane",
    description: "Manage environments, projects, and operator workflows from a single console.",
  },
  {
    title: "Governed AI operations",
    description: "Apply guardrails, approvals, and policy controls before changes move forward.",
  },
  {
    title: "Runtime visibility",
    description: "Track evaluations, incidents, and operational signals across your platform footprint.",
  },
  {
    title: "Directory-backed access",
    description: "Restrict operator access with organization credentials and traceable authentication.",
  },
] as const;

export default function LoginPage() {
  const [returnTo, setReturnTo] = useState("/home");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
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
        body: JSON.stringify({
          login: username,
          password,
          returnTo,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { redirectTo?: string; error?: string }
        | null;
      if (!response.ok) {
        setError(
          body?.error || "We could not sign you in. Check your credentials and try again."
        );
        return;
      }
      window.location.assign(body?.redirectTo || returnTo);
    } catch {
      setError("We could not reach the authentication service. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.2fr_0.8fr]">
      <section className="relative overflow-hidden bg-black text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_60%)]" />
        <div className="absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-white/10 blur-[140px]" />
        <div className="absolute right-0 top-16 h-60 w-60 rounded-full bg-white/5 blur-[140px]" />

        <div className="relative z-10 flex h-full items-center px-8 py-12 lg:px-14">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 fade-up">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
                <Image
                  src={BRAND_LOGO_WHITE}
                  alt={`${BRAND_NAME} Logo`}
                  width={26}
                  height={26}
                  className="object-contain"
                />
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1 text-[10px] uppercase tracking-[0.35em] text-white/80">
                {BRAND_NAME} Operator Access
              </div>
            </div>
            <h1 className="mt-6 font-display text-4xl leading-tight lg:text-5xl fade-up delay-1">
              Govern your AI platform from one secure control center.
            </h1>
            <p className="mt-4 max-w-xl text-sm text-white/70 lg:text-base fade-up delay-2">
              {CONTROL_CENTER_NAME} gives operators a single place to manage access,
              rollout governance, and operational oversight across the UMAI platform.
            </p>

            <div className="mt-10 rounded-[28px] border border-white/12 bg-white/[0.04] p-6 backdrop-blur fade-up delay-3">
              <p className="text-xs uppercase tracking-[0.28em] text-white/50">
                Platform overview
              </p>
              <ul className="mt-5 grid gap-5 sm:grid-cols-2">
                {PLATFORM_HIGHLIGHTS.map((item) => (
                  <li key={item.title} className="flex items-start gap-3">
                    <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-white/80" />
                    <div>
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-white/65">
                        {item.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center bg-white px-6 py-12 lg:px-12">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2 fade-up">
            <p className="text-[10px] uppercase tracking-[0.3em] text-slate">
              Secure access
            </p>
            <h2 className="font-display text-3xl">Sign in to {CONTROL_CENTER_NAME}</h2>
            <p className="text-sm text-slate">
              Enter your LDAP username and password.
            </p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 fade-up delay-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-800">
              Warning
            </p>
            <p className="mt-2 text-sm leading-6 text-amber-950">
              This is a temporary POC environment. Access, configuration, and
              available features may change while validation is in progress.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 fade-up delay-2">
            <label className="block text-sm font-medium text-ink">
              Username
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate/20 bg-white px-4 py-3 text-sm shadow-soft focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                placeholder="jdoe or jdoe@company.local"
              />
            </label>
            <label className="block text-sm font-medium text-ink">
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate/20 bg-white px-4 py-3 text-sm shadow-soft focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </label>
            {error && (
              <div
                role="alert"
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700"
              >
                <p className="font-semibold text-red-800">Sign-in unsuccessful</p>
                <p className="mt-1 leading-6">{error}</p>
                <p className="mt-2 text-xs text-red-700/90">
                  If the issue continues, contact{" "}
                  <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="font-semibold text-red-800 underline underline-offset-2"
                  >
                    {SUPPORT_EMAIL}
                  </a>
                  .
                </p>
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white shadow-lift transition hover:translate-y-[-1px] hover:bg-[#0b1322] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>
            <div className="rounded-2xl border border-slate/10 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate">
              Authentication is handled by your company LDAP directory.
            </div>
            <div className="text-xs text-slate">
              Learn more:{" "}
              <Link href={LEARN_MORE_URL} className="font-semibold text-ink hover:underline">
                umaisolutions.com
              </Link>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
