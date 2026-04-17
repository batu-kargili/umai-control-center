"use client";

import Link from "next/link";

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-lg rounded-3xl border border-slate/10 bg-white p-8 shadow-soft">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate/60">
          Directory access
        </p>
        <h1 className="mt-3 font-display text-4xl text-ink">Self-signup is disabled</h1>
        <p className="mt-4 text-sm text-slate">
          This control center is provisioned for enterprise directory login. Ask your
          administrator to grant you LDAP access, then sign in with your corporate
          account.
        </p>
        <div className="mt-6">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white shadow-lift transition hover:bg-[#0b1322]"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
