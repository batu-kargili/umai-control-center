"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useUser } from "src/lib/auth-client";
import { ConsoleProvider, useConsole } from "./console-context";
import {
  BRAND_LOGO_WHITE,
  BRAND_NAME,
  CONTROL_CENTER_NAME,
} from "src/lib/branding";
import {
  Home,
  Layers,
  Search,
  Bell,
  HelpCircle,
  Menu,
  LayoutDashboard,
  BarChart3,
  Shield,
  FileText,
  FlaskConical,
  Code2,
  MessageSquare,
  LifeBuoy,
  ChevronRight,
  Activity,
  KeyRound
} from "lucide-react";

function TopNavbar({ variant = "default" }: { variant?: "default" | "onboarding" }) {
  if (variant === "onboarding") {
    return (
      <header className="h-[56px] bg-white border-b border-slate/10 text-ink flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate/5 border border-slate/10">
            <Image
              src={BRAND_LOGO_WHITE}
              alt={`${BRAND_NAME} Logo`}
              width={18}
              height={18}
              className="object-contain invert"
            />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] uppercase tracking-[0.3em] text-slate">Onboarding</span>
            <span className="text-sm font-semibold">{CONTROL_CENTER_NAME}</span>
          </div>
        </div>
        <span className="text-xs font-semibold text-slate">
          Complete setup to unlock the console
        </span>
      </header>
    );
  }

  const { user } = useUser();
  const { tenant } = useConsole();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const userLabel = user?.name || user?.email || "User";
  const userInitial = userLabel.charAt(0).toUpperCase();

  return (
    <header className="h-[56px] bg-black text-white flex items-center justify-between px-4 z-50">
      <div className="flex items-center gap-4">
        <Link href="/home" className="group flex items-center">
          <Image
            src={BRAND_LOGO_WHITE}
            alt={`${BRAND_NAME} Logo`}
            width={120}
            height={32}
            className="h-8 w-auto object-contain transition-opacity group-hover:opacity-80"
            priority
          />
        </Link>
      </div>

      <div className="flex items-center gap-6">
        <div className="relative group w-[320px]">
          <input
            placeholder="Search"
            className="w-full h-8 rounded-md bg-white/10 border-none px-4 pl-10 text-xs font-medium text-white placeholder-white/40 focus:bg-white/15 focus:outline-none transition-all"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-white/60 transition-colors w-4 h-4" />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <span className="text-[10px] text-white/20 border border-white/20 rounded px-1">K</span>
          </div>
        </div>

        <div className="relative flex items-center gap-4" ref={menuRef}>
          <button title="Notifications" className="text-white/60 hover:text-white transition-colors">
            <Bell className="w-5 h-5" />
          </button>
          <button title="Help" className="text-white/60 hover:text-white transition-colors">
            <HelpCircle className="w-5 h-5" />
          </button>
          <button
            title="Menu"
            className={`text-white/60 hover:text-white transition-colors ${menuOpen ? "text-white" : ""}`}
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            <Menu className="w-6 h-6" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-[52px] w-[280px] rounded-2xl border border-slate/10 bg-white text-ink shadow-soft z-50">
              <div className="p-4 border-b border-slate/10 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-slate/100 text-white flex items-center justify-center text-sm font-bold">
                  {userInitial}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{userLabel}</p>
                  {user?.email && (
                    <p className="text-xs text-slate truncate">{user.email}</p>
                  )}
                </div>
              </div>
              <div className="p-4 space-y-3 text-xs text-slate">
                <div className="flex items-center justify-between">
                  <span>Organization</span>
                  <span className="font-semibold text-ink">
                    {tenant?.tenant_name || "Organization"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Plan</span>
                  <span className="font-semibold text-ink">{tenant?.plan || "free"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Tenant ID</span>
                  <span className="font-semibold text-ink truncate max-w-[140px]">
                    {tenant?.tenant_id || "-"}
                  </span>
                </div>
              </div>
              <div className="p-4 border-t border-slate/10">
                <a
                  href="/api/auth/logout?returnTo=/login"
                  className="inline-flex w-full items-center justify-center rounded-xl bg-ink px-4 py-2 text-xs font-semibold text-white hover:bg-[#0b1322] transition"
                >
                  Sign out
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const { selectedEnvironment, selectedProject } = useConsole();

  const crumbs = [{ label: "Home", href: "/home" }];

  let currentPath = "";
  segments.forEach((segment) => {
    if (segment === "home") return;
    currentPath += `/${segment}`;

    let label = segment.replace(/-/g, " ");
    if (segment === "environments") label = "Environments";
    if (selectedEnvironment && segment === selectedEnvironment) label = selectedEnvironment;
    if (segment === "projects") label = "Projects";
    if (selectedProject && segment === selectedProject) label = selectedProject;
    if (segment === "api-keys") label = "API Keys";
    if (segment === "implementation") label = "Implementation";
    if (segment === "extension") label = "Extension";
    if (segment === "connect") label = "Connect";
    if (segment === "extension-monitoring") label = "Extension Monitoring";

    crumbs.push({ label, href: currentPath });
  });

  return (
    <nav className="mb-6 flex items-center overflow-x-auto whitespace-nowrap border-b border-gray-100 bg-white px-8 py-2 text-[13px] font-medium text-slate/80 scrollbar-hide">
      {crumbs.map((crumb, i) => (
        <div key={crumb.href} className="flex items-center shrink-0">
          {i > 0 && <ChevronRight className="mx-2 text-gray-300 w-3 h-3" />}
          <Link href={crumb.href} className="capitalize transition-colors hover:text-ink">
            {crumb.label}
          </Link>
        </div>
      ))}
    </nav>
  );
}

function NavRail() {
  const pathname = usePathname();
  const railItems = [
    { label: "Home", href: "/home", icon: Home },
    { label: "Environments", href: "/environments", icon: Layers },
    { label: "Extension", href: "/extension/connect", icon: Activity },
  ];

  return (
    <div className="w-[56px] bg-[#fcfcfc] border-r border-gray-100 flex flex-col items-center py-6 gap-6 z-50 shrink-0 h-full">
      {railItems.map((item) => (
        (() => {
          const isExtensionRail = item.href === "/extension/connect";
          const isActive = isExtensionRail
            ? pathname.startsWith("/extension/") || pathname.startsWith("/extension-monitoring")
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              title={item.label}
              className={`group relative h-10 w-10 flex items-center justify-center rounded-lg transition-all duration-300 ${
                isActive
                  ? "scale-110 bg-ink text-white shadow-lg shadow-black/10"
                  : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              }`}
            >
              <item.icon className="w-5 h-5 group-hover:scale-110 transition-transform" />
              {isActive && (
                <div className="absolute -left-0.5 top-2 bottom-2 w-1 rounded-r-full bg-ink" />
              )}
            </Link>
          );
        })()
      ))}
    </div>
  );
}

function Sidebar() {
  const { selectedEnvironment, selectedProject } = useConsole();
  const pathname = usePathname();

  if (!selectedEnvironment && !selectedProject) {
    return null;
  }

  const isProjectView = !!selectedProject;

  return (
    <aside className="w-[240px] flex-col bg-white border-r border-gray-100 h-full flex z-40 shrink-0">
      <div className="p-5 border-b border-gray-50">
        <p className="text-[11px] font-semibold text-gray-400 capitalize mb-1">
          {isProjectView ? "Project" : "Environment"}
        </p>
        <h3 className="text-xl font-bold text-gray-900 truncate capitalize leading-tight">
          {isProjectView ? selectedProject?.replace(/-/g, " ") : selectedEnvironment?.replace(/-/g, " ")}
        </h3>
      </div>

      <nav className="flex-1 py-4 px-3 overflow-y-auto">
        {selectedEnvironment && (
          <div className="space-y-1">
            <Link
              href={`/environments/${selectedEnvironment}`}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${pathname === `/environments/${selectedEnvironment}`
                ? "border border-black/10 bg-mint text-ink font-bold"
                : "text-gray-600 hover:bg-gray-50 font-medium"
                }`}
            >
              <LayoutDashboard className="w-5 h-5 opacity-70" />
              {selectedProject ? "Project Overview" : "Overview"}
            </Link>

            {selectedProject && (
              <div className="mt-1 ml-4 pl-4 border-l border-gray-100 flex flex-col gap-0.5 animate-in fade-in slide-in-from-top-1 duration-300">
                {[
                  { label: "Monitoring", href: "monitoring", icon: Activity },
                  { label: "Guardrails", href: "guardrails", icon: Shield },
                  { label: "Policies", href: "policies", icon: FileText },
                  { label: "Test", href: "test", icon: FlaskConical },
                  { label: "Evaluation", href: "evaluation", icon: BarChart3 },
                  { label: "Implementation", href: "implementation", icon: Code2 },
                  { label: "API Keys", href: "api-keys", icon: KeyRound },
                  { label: "Alerts", href: "alerts", icon: Bell },
                ].map((sub) => {
                  const fullHref = `/environments/${selectedEnvironment}/projects/${selectedProject}/${sub.href}`;
                  const isActive = pathname.startsWith(fullHref);
                  return (
                    <Link
                      key={sub.href}
                      href={fullHref}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all duration-200 ${isActive
                        ? "bg-mint text-ink font-bold"
                        : "text-gray-500 hover:text-gray-900 hover:bg-gray-50 font-medium"
                        }`}
                    >
                      <sub.icon className="w-4 h-4 opacity-70 shrink-0" />
                      {sub.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </nav>

      <div className="mt-auto p-4 border-t border-gray-50 bg-gray-50/30 flex flex-col gap-2">
        <Link href="#" className="flex items-center gap-3 text-[11px] font-semibold text-gray-500 hover:text-gray-900 transition-colors px-2 py-1">
          <MessageSquare className="w-4 h-4" /> Chat with us
        </Link>
        <Link href="#" className="flex items-center justify-between bg-white p-3 rounded-lg text-[11px] font-bold text-gray-700 hover:border-black/15 transition-all border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2">
            <LifeBuoy className="w-4 h-4" /> Support ticket
          </div>
          <span className="rounded bg-ink px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tighter text-white">NEW</span>
        </Link>
      </div>
    </aside>
  );
}

function ConsoleGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useUser();
  const { tenant, tenantReady } = useConsole();

  useEffect(() => {
    if (isLoading || !tenantReady) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!tenant?.tenant_id) {
      if (pathname !== "/onboarding/organization") {
        router.replace("/onboarding/organization");
      }
      return;
    }
    if (!tenant.environment_id) {
      if (pathname !== "/onboarding/environment") {
        router.replace("/onboarding/environment");
      }
      return;
    }
    if (!tenant.project_id) {
      if (pathname !== "/onboarding/project") {
        router.replace("/onboarding/project");
      }
      return;
    }
    if (pathname.startsWith("/onboarding")) {
      router.replace("/home");
    }
  }, [isLoading, tenantReady, user, tenant, router, pathname]);

  if (isLoading || !tenantReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-white">
        <div className="text-xs uppercase tracking-[0.4em] text-white/60">
          Loading workspace...
        </div>
      </div>
    );
  }

  return <>{children}</>;
}


export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isOnboarding = pathname.startsWith("/onboarding");

  return (
    <ConsoleProvider>
      <ConsoleGate>
        <div className="flex flex-col h-screen overflow-hidden bg-white font-sans selection:bg-black/10 italic-none">
          <TopNavbar variant={isOnboarding ? "onboarding" : "default"} />

          <div className="flex flex-1 overflow-hidden">
            {!isOnboarding && <NavRail />}
            {!isOnboarding && <Sidebar />}

            <main className="flex-1 flex flex-col min-w-0 bg-white">
              {!isOnboarding && <Breadcrumbs />}
              <div className="flex-1 overflow-y-auto">
                <div
                  className={
                    isOnboarding
                      ? "p-6 lg:p-10 max-w-[1200px] mx-auto"
                      : "p-8 lg:px-12 lg:pb-12 max-w-[1600px]"
                  }
                >
                  {children}
                </div>
              </div>
            </main>
          </div>
        </div>
      </ConsoleGate>
    </ConsoleProvider>
  );
}
