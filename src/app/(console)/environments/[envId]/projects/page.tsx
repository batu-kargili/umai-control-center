"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchProjects, Project } from "src/lib/api";
import { useConsole } from "src/app/(console)/console-context";
import {
  Plus,
  MoreHorizontal,
  Settings,
  ChevronRight,
  ShieldCheck,
  Globe
} from "lucide-react";

export default function ProjectsPage() {
  const { envId } = useParams() as { envId: string };
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const { tenantId } = useConsole();

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    fetchProjects(tenantId, envId)
      .then((data: Project[]) => {
        setProjects(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        console.error(err);
        setLoading(false);
      });
  }, [envId, tenantId]);

  return (
    <div className="space-y-10 fade-up">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-3 h-3 text-slate/40" />
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate/60">Registry</p>
          </div>
          <h2 className="font-display text-4xl font-bold text-ink tracking-tight uppercase">Projects</h2>
          <p className="mt-1 text-sm text-slate">
            Secure and govern AI initiatives within the <span className="font-bold text-accent uppercase">{envId}</span> environment.
          </p>
        </div>
        <button className="rounded-xl bg-accent px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent/90 hover:shadow-xl flex items-center gap-2">
          <Plus className="w-4 h-4" /> Register Project
        </button>
      </header>

      <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {loading ? (
          <div className="col-span-full py-20 text-center animate-pulse text-slate/40 font-medium">
            Indexing project registry...
          </div>
        ) : projects.length === 0 ? (
          <div className="col-span-full py-20 text-center text-slate/40 font-medium font-sans">
            No projects found in this environment.
          </div>
        ) : projects.map((project) => (
          <div
            key={project.project_id}
            className="group relative flex flex-col justify-between rounded-3xl border border-slate/10 bg-white p-8 shadow-sm transition-all hover:-translate-y-1 hover:border-accent/30 hover:shadow-xl"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 rounded-full bg-mint/10 px-2 py-0.5 text-[9px] font-bold text-accent italic">
                  <span className="h-1 w-1 rounded-full bg-accent animate-pulse" />
                  Active
                </span>
                <span className="text-[10px] font-bold text-slate/30">v1.2.0</span>
              </div>
              <h3 className="mt-4 font-display text-2xl font-bold text-ink uppercase tracking-tight">{project.name}</h3>
              <p className="mt-2 text-[10px] font-medium text-slate uppercase tracking-wider bg-slate/5 px-2 py-1 rounded w-fit">
                ID: {project.project_id}
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-slate/5">
              <div className="flex items-center justify-between gap-4">
                <Link
                  href={`/environments/${envId}/projects/${project.project_id}`}
                  className="flex-1 rounded-xl bg-accent/5 border border-accent/10 px-4 py-2 text-center text-[10px] font-bold text-accent transition-all hover:bg-accent hover:text-white flex items-center justify-center gap-2"
                >
                  <Settings className="w-3 h-3" /> Configure
                </Link>
                <button className="rounded-xl border border-slate/10 px-3 py-2 text-xs text-slate hover:bg-slate/5 transition-all">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {!loading && (
          <button className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate/10 p-8 transition-all hover:border-accent/40 hover:bg-accent/[0.02] group">
            <div className="h-12 w-12 rounded-2xl bg-slate/5 flex items-center justify-center text-slate mb-4 group-hover:scale-110 transition-transform">
              <Plus className="w-6 h-6" />
            </div>
            <p className="text-xs font-bold text-slate">Register Initiative</p>
          </button>
        )}
      </section>
    </div>
  );
}
