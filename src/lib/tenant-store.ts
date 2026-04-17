"use client";

export interface TenantBinding {
  tenant_id: string;
  plan: string;
  license_expires_at: string;
  environment_id?: string | null;
  project_id?: string | null;
  api_key?: string | null;
  tenant_name?: string | null;
}

type TenantMap = Record<string, TenantBinding>;

const STORAGE_KEY = "umai.tenants";

function loadMap(): TenantMap {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as TenantMap;
    }
    return {};
  } catch {
    return {};
  }
}

function saveMap(map: TenantMap): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function loadTenantForUser(userSub: string): TenantBinding | null {
  if (!userSub) return null;
  const map = loadMap();
  return map[userSub] || null;
}

export function saveTenantForUser(userSub: string, tenant: TenantBinding): void {
  if (!userSub) return;
  const map = loadMap();
  map[userSub] = tenant;
  saveMap(map);
}

export function updateTenantForUser(
  userSub: string,
  update: Partial<TenantBinding>
): void {
  if (!userSub) return;
  const map = loadMap();
  const existing = map[userSub];
  if (!existing) return;
  map[userSub] = { ...existing, ...update };
  saveMap(map);
}

export function clearTenantForUser(userSub: string): void {
  if (!userSub) return;
  const map = loadMap();
  delete map[userSub];
  saveMap(map);
}
