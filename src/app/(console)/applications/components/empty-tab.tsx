import type { LucideIcon } from "lucide-react";

export function EmptyTab({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-secondary/20 bg-white px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary/10 text-secondary">
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="font-semibold text-ink">{title}</h3>
      <p className="max-w-sm text-sm text-slate">{description}</p>
    </div>
  );
}
