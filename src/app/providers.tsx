"use client";

import { AuthProvider } from "src/lib/auth-client";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
