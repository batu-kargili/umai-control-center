"use client";

import { useCallback, useEffect, useState } from "react";

// Rehberlerde kullanılan bağlam: kullanıcı bir kez girer, tüm snippet'lere yansır.
export interface ImplementationContext {
  endpoint: string;
  guardrailId: string;
  agentId: string;
}

export const DEFAULT_ENDPOINT = "https://umai.example.com";

const defaults: ImplementationContext = {
  endpoint: DEFAULT_ENDPOINT,
  guardrailId: "",
  agentId: "support-agent",
};

export function useImplementationContext(envId: string, projectId: string) {
  const storageKey = `umai.cc.implementation.${envId}.${projectId}`;
  const [ctx, setCtx] = useState<ImplementationContext>(defaults);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setCtx({ ...defaults, ...(JSON.parse(raw) as Partial<ImplementationContext>) });
    } catch {
      /* depolama yoksa varsayılanlar kalır */
    }
    setReady(true);
  }, [storageKey]);

  const update = useCallback(
    (patch: Partial<ImplementationContext>) => {
      setCtx((current) => {
        const next = { ...current, ...patch };
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* yok say */
        }
        return next;
      });
    },
    [storageKey]
  );

  return { ctx, update, ready };
}
