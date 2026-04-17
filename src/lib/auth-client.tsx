"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { TenantBinding } from "src/lib/tenant-store";

export interface AuthenticatedUser {
  sub: string;
  username: string;
  name: string;
  email?: string;
  groups: string[];
}

interface AuthState {
  user: AuthenticatedUser | null;
  defaultTenant: TenantBinding | null;
  isLoading: boolean;
  error?: string;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

async function fetchCurrentSession(): Promise<{
  user: AuthenticatedUser | null;
  defaultTenant: TenantBinding | null;
}> {
  const response = await fetch("/api/auth/me", {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
  });
  if (response.status === 401) {
    return { user: null, defaultTenant: null };
  }
  if (!response.ok) {
    throw new Error("Failed to load authentication session");
  }
  return (await response.json()) as {
    user: AuthenticatedUser | null;
    defaultTenant: TenantBinding | null;
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [defaultTenant, setDefaultTenant] = useState<TenantBinding | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = async () => {
    setIsLoading(true);
    try {
      const session = await fetchCurrentSession();
      setUser(session.user);
      setDefaultTenant(session.defaultTenant);
      setError(undefined);
    } catch (err) {
      setUser(null);
      setDefaultTenant(null);
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      defaultTenant,
      isLoading,
      error,
      refresh,
    }),
    [defaultTenant, error, isLoading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthSession(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthSession must be used within an AuthProvider");
  }
  return context;
}

export function useUser(): {
  user: AuthenticatedUser | null;
  isLoading: boolean;
  error?: string;
} {
  const { user, isLoading, error } = useAuthSession();
  return { user, isLoading, error };
}
