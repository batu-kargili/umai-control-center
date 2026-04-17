"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";

import {
  BRAND_LOGO_WHITE,
  BRAND_NAME,
  CONTROL_CENTER_NAME,
  MARKETING_SITE_URL,
} from "src/lib/branding";

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
        setError(body?.error || "Sign-in failed.");
        return;
      }
      window.location.assign(body?.redirectTo || returnTo);
    } catch {
      setError("Sign-in failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen grid lg:grid-cols-[1.2fr_0.8fr]">
      <section className="relative overflow-hidden bg-black text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_60%)]" />
        <div className="absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-white/10 blur-[140px]" />
        <div className="absolute right-0 top-16 h-60 w-60 rounded-full bg-white/5 blur-[140px]" />

        <div className="relative z-10 flex h-full flex-col justify-between px-8 py-12 lg:px-14">
          <div>
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
              Welcome to {BRAND_NAME}.
            </h1>
            <p className="mt-4 max-w-xl text-sm text-white/70 lg:text-base fade-up delay-2">
              Sign in with your organization directory account to access the control
              center.
            </p>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-2 fade-up delay-3">
            {[
              { label: "Identity", value: "LDAP", note: "Customer-managed directory" },
              { label: "Control Plane", value: "Private", note: "On-prem deployment" },
              { label: "Guardrails", value: "Managed", note: "Policies and audit trail" },
              { label: "Access", value: "Operators", note: "Restricted by directory groups" },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 backdrop-blur"
              >
                <p className="text-xs uppercase tracking-[0.25em] text-white/60">
                  {item.label}
                </p>
                <p className="mt-2 text-lg font-semibold">{item.value}</p>
                <p className="text-xs text-white/60">{item.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center bg-white px-6 py-12 lg:px-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2 fade-up">
            <p className="text-[10px] uppercase tracking-[0.3em] text-slate">
              Secure access
            </p>
            <h2 className="font-display text-3xl">Sign in to {CONTROL_CENTER_NAME}</h2>
            <p className="text-sm text-slate">
              Enter your LDAP username and password.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 fade-up delay-1">
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
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-600">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white shadow-lift transition hover:translate-y-[-1px] hover:bg-[#0b1322] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>
            <div className="rounded-2xl border border-slate/10 bg-white px-4 py-4 text-xs text-slate shadow-soft">
              Authentication is handled by your company LDAP directory.
            </div>
            <div className="text-xs text-slate">
              Need the main site?{" "}
              <Link href={MARKETING_SITE_URL} className="font-semibold text-ink hover:underline">
                Visit umai.ai
              </Link>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
