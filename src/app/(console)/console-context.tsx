"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuthSession } from "src/lib/auth-client";
import { fetchEnvironments, fetchProjects } from "src/lib/api";
import {
  loadTenantForUser,
  saveTenantForUser,
  type TenantBinding,
} from "src/lib/tenant-store";

interface ConsoleContextType {
  tenant: TenantBinding | null;
  tenantId: string | null;
  tenantReady: boolean;
  refreshTenant: () => void;
  selectedEnvironment: string | null;
  setSelectedEnvironment: (env: string | null) => void;
  selectedProject: string | null;
  setSelectedProject: (project: string | null) => void;
}

const ConsoleContext = createContext<ConsoleContextType | undefined>(undefined);

function mergeTenantBinding(
  existing: TenantBinding | null,
  defaultTenant: TenantBinding | null
): TenantBinding | null {
  if (!defaultTenant) {
    return existing;
  }
  if (!existing || existing.tenant_id !== defaultTenant.tenant_id) {
    return defaultTenant;
  }
  return {
    ...existing,
    tenant_id: defaultTenant.tenant_id,
    tenant_name: defaultTenant.tenant_name ?? existing.tenant_name ?? null,
    plan: defaultTenant.plan || existing.plan,
    license_expires_at:
      defaultTenant.license_expires_at || existing.license_expires_at,
    environment_id: existing.environment_id ?? defaultTenant.environment_id ?? null,
    project_id: existing.project_id ?? defaultTenant.project_id ?? null,
    api_key: existing.api_key ?? null,
  };
}

async function hydrateTenantBinding(
  tenant: TenantBinding
): Promise<TenantBinding> {
  if (!tenant.tenant_id) {
    return tenant;
  }

  const environments = await fetchEnvironments(tenant.tenant_id);
  if (environments.length === 0) {
    return {
      ...tenant,
      environment_id: null,
      project_id: null,
    };
  }

  const environmentIds = environments.map((env) => env.environment_id);
  const preferredEnvironmentIds =
    tenant.environment_id && environmentIds.includes(tenant.environment_id)
      ? [
          tenant.environment_id,
          ...environmentIds.filter((envId) => envId !== tenant.environment_id),
        ]
      : environmentIds;

  const projectCache = new Map<string, Promise<Awaited<ReturnType<typeof fetchProjects>>>>();
  const getProjects = (envId: string) => {
    const cached = projectCache.get(envId);
    if (cached) {
      return cached;
    }
    const request = fetchProjects(tenant.tenant_id, envId).catch(() => []);
    projectCache.set(envId, request);
    return request;
  };

  if (tenant.project_id) {
    for (const envId of preferredEnvironmentIds) {
      const projects = await getProjects(envId);
      const matchingProject = projects.find(
        (project) => project.project_id === tenant.project_id
      );
      if (matchingProject) {
        return {
          ...tenant,
          environment_id: envId,
          project_id: matchingProject.project_id,
        };
      }
    }
  }

  const preferredEnvironmentId =
    tenant.environment_id && environmentIds.includes(tenant.environment_id)
      ? tenant.environment_id
      : environmentIds[0];

  const preferredProjects = await getProjects(preferredEnvironmentId);
  if (preferredProjects.length > 0) {
    return {
      ...tenant,
      environment_id: preferredEnvironmentId,
      project_id: preferredProjects[0].project_id,
    };
  }

  for (const envId of preferredEnvironmentIds) {
    if (envId === preferredEnvironmentId) {
      continue;
    }
    const projects = await getProjects(envId);
    if (projects.length > 0) {
      return {
        ...tenant,
        environment_id: envId,
        project_id: projects[0].project_id,
      };
    }
  }

  return {
    ...tenant,
    environment_id: preferredEnvironmentId,
    project_id: null,
  };
}

export function ConsoleProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading, defaultTenant } = useAuthSession();
  const [tenant, setTenant] = useState<TenantBinding | null>(null);
  const [tenantReady, setTenantReady] = useState(false);
  const [selectedEnvironment, setSelectedEnvironment] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    let active = true;

    if (isLoading) {
      return;
    }
    if (!user?.sub) {
      setTenant(null);
      setTenantReady(true);
      return () => {
        active = false;
      };
    }

    setTenantReady(false);

    const syncTenant = async () => {
      const existing = loadTenantForUser(user.sub);
      const resolved = mergeTenantBinding(existing, defaultTenant);

      if (!resolved) {
        if (!active) {
          return;
        }
        setTenant(null);
        setTenantReady(true);
        return;
      }

      try {
        const hydrated = await hydrateTenantBinding(resolved);
        if (!active) {
          return;
        }
        saveTenantForUser(user.sub, hydrated);
        setTenant(hydrated);
      } catch {
        if (!active) {
          return;
        }
        saveTenantForUser(user.sub, resolved);
        setTenant(resolved);
      } finally {
        if (active) {
          setTenantReady(true);
        }
      }
    };

    void syncTenant();

    return () => {
      active = false;
    };
  }, [defaultTenant, user, isLoading]);

  const refreshTenant = () => {
    if (!user?.sub) return;
    setTenant(loadTenantForUser(user.sub));
  };

  // Navigation management
  useEffect(() => {
    // Clear all if at root levels
    if (pathname === "/home" || pathname === "/environments") {
      setSelectedEnvironment(null);
      setSelectedProject(null);
      return;
    }

    // Handle Environment detection
    const envMatch = pathname.match(/\/environments\/([^/]+)/);
    if (envMatch) {
      setSelectedEnvironment(envMatch[1]);
    } else {
      setSelectedEnvironment(null);
    }

    // Handle Project detection
    const projectMatch = pathname.match(/\/projects\/([^/]+)/);
    if (projectMatch) {
      setSelectedProject(projectMatch[1]);
    } else {
      setSelectedProject(null);
    }
  }, [pathname]);


  return (
    <ConsoleContext.Provider
      value={{
        tenant,
        tenantId: tenant?.tenant_id || null,
        tenantReady,
        refreshTenant,
        selectedEnvironment,
        setSelectedEnvironment,
        selectedProject,
        setSelectedProject,
      }}
    >
      {children}
    </ConsoleContext.Provider>
  );
}


export function useConsole() {
  const context = useContext(ConsoleContext);
  if (context === undefined) {
    throw new Error("useConsole must be used within a ConsoleProvider");
  }
  return context;
}
