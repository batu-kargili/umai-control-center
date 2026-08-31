"use client";

import type { ApplicationCategoryTotal } from "src/lib/api";
import { CATEGORY_LABELS } from "./constants";

const TONES = [
  "bg-secondary",
  "bg-secondary/85",
  "bg-secondary/70",
  "bg-secondary/55",
  "bg-secondary/40",
  "bg-zinc-300",
];

export function CategoryBar({ categories }: { categories: ApplicationCategoryTotal[] }) {
  const max = Math.max(1, ...categories.map((item) => item.sessions));

  return (
    <div className="rounded-lg border border-secondary/10 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-ink">Top application by category</h3>
      <div className="mt-4 space-y-3">
        {categories.length === 0 ? (
          <p className="text-sm text-slate">No category activity yet.</p>
        ) : (
          categories.slice(0, 6).map((item, index) => (
            <div key={item.category} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate">
                <span className="font-semibold text-ink">
                  {CATEGORY_LABELS[item.category] ?? item.category}
                </span>
                <span>{item.sessions}</span>
              </div>
              <div className="h-2 rounded-full bg-secondary/10">
                <div
                  className={`h-full rounded-full ${TONES[index % TONES.length]}`}
                  style={{ width: `${(item.sessions / max) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
