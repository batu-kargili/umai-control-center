"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useUser } from "src/lib/auth-client";
import { fetchEnvironments, fetchProjects } from "src/lib/api";
import { findGuide } from "src/lib/implementation-guides";
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
  ChevronRight,
  Activity,
  KeyRound,
  Laptop,
  LayoutGrid,
  ScanSearch,
  ShieldAlert,
  History,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";

// Onboarding başlığı ile konsol başlığı AYRI bileşenlerdir, tek bir bileşenin iki
// dalı değil. Tek bileşen olduklarında onboarding dalı hook'lardan önce return
// ediyordu; `isOnboarding` değiştiğinde aynı JSX konumundaki aynı örneğin hook
// sayısı 0'dan 5'e çıkıyor ve React "Rendered more hooks than during the previous
// render" ile çöküyordu — tam olarak yeni müşterinin onboarding'i bitirdiği anda.
function OnboardingNavbar() {
  return (
      <header className="h-[56px] bg-white border-b border-secondary/10 text-ink flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-secondary/15 bg-secondary/8">
            <Image
              src={BRAND_LOGO_WHITE}
              alt={`${BRAND_NAME} Logo`}
              width={18}
              height={18}
              className="object-contain invert"
            />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] uppercase tracking-[0.3em] text-secondary/70">Onboarding</span>
            <span className="text-sm font-semibold">{CONTROL_CENTER_NAME}</span>
          </div>
        </div>
        <span className="text-xs font-semibold text-slate">
          Complete setup to unlock the console
        </span>
    </header>
  );
}

function TopNavbar() {
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
    <header className="h-[56px] border-b border-secondary/20 bg-black text-white flex items-center justify-between px-4 z-50">
      <div className="flex items-center gap-4">
        <Link href="/home" className="group flex items-center">
          <Image
            src={BRAND_LOGO_WHITE}
            alt={`${BRAND_NAME} Logo`}
            width={90}
            height={16}
            className="h-4 w-auto object-contain transition-opacity group-hover:opacity-80"
            priority
          />
        </Link>
      </div>

      <div className="flex items-center gap-6">
        <div className="relative group w-[320px]">
          <input
            placeholder="Search"
            className="w-full h-8 rounded-md bg-white/10 border border-white/10 px-4 pl-10 text-xs font-medium text-white placeholder-white/40 transition-all focus:bg-white/15 focus:border-secondary/40 focus:outline-none focus:ring-2 focus:ring-secondary/25"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-secondary transition-colors w-4 h-4" />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <span className="text-[10px] text-secondary/60 border border-secondary/30 rounded px-1">K</span>
          </div>
        </div>

        <div className="relative flex items-center gap-4" ref={menuRef}>
          <button title="Notifications" className="text-white/60 hover:text-secondary transition-colors">
            <Bell className="w-5 h-5" />
          </button>
          <button title="Help" className="text-white/60 hover:text-secondary transition-colors">
            <HelpCircle className="w-5 h-5" />
          </button>
          <button
            title="Menu"
            className={`text-white/60 hover:text-secondary transition-colors ${menuOpen ? "text-secondary" : ""}`}
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            <Menu className="w-6 h-6" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-[52px] z-50 w-[280px] rounded-2xl border border-secondary/12 bg-white text-ink shadow-soft">
              <div className="p-4 border-b border-secondary/10 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-secondary text-white flex items-center justify-center text-sm font-bold shadow-accent">
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
              <div className="p-4 border-t border-secondary/10">
                <a
                  href="/api/auth/logout?returnTo=/login"
                  className="inline-flex w-full items-center justify-center rounded-xl bg-secondary px-4 py-2 text-xs font-semibold text-white shadow-accent transition hover:bg-secondary/90"
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
    if (segment === "connect") label = "Monitoring";
    if (segment === "extension-monitoring") label = "Extension Monitoring";
    if (segment === "applications") label = "Applications";
    if (segment === "collectors") label = "Collectors";
    const guide = findGuide(segment);
    if (guide) label = guide.title;

    crumbs.push({ label, href: currentPath });
  });

  return (
    <nav className="mb-6 flex items-center overflow-x-auto whitespace-nowrap border-b border-secondary/10 bg-white px-8 py-2 text-[13px] font-medium text-slate/80 scrollbar-hide">
      {crumbs.map((crumb, i) => (
        <div key={crumb.href} className="flex items-center shrink-0">
          {i > 0 && <ChevronRight className="mx-2 text-gray-300 w-3 h-3" />}
          <Link
            href={crumb.href}
            className={`capitalize transition-colors hover:text-secondary ${
              i === crumbs.length - 1 ? "text-secondary" : ""
            }`}
          >
            {crumb.label}
          </Link>
        </div>
      ))}
    </nav>
  );
}

const RAIL_STORAGE_KEY = "umai.cc.rail-expanded";

function readRailPreference(): boolean {
  try {
    return window.localStorage.getItem(RAIL_STORAGE_KEY) !== "0";
  } catch {
    return true; // depolama kapalıysa varsayılan: açık
  }
}

function NavRail() {
  const pathname = usePathname();
  const { selectedEnvironment, selectedProject } = useConsole();
  // Kapsam sidebar'ı (Environment/Project) görünürken iki menü yan yana
  // gelmesin diye rail kapalı başlar; kullanıcı açarsa kapsamdan çıkana kadar
  // açık kalır. Kapsam dışında kullanıcının kayıtlı tercihi geçerlidir.
  const hasScopeSidebar = Boolean(selectedEnvironment || selectedProject);
  const [expanded, setExpanded] = useState(true);

  // localStorage yalnızca tarayıcıda var; ilk render sunucuyla aynı olsun diye
  // tercih mount sonrasında okunur.
  useEffect(() => {
    setExpanded(hasScopeSidebar ? false : readRailPreference());
  }, [hasScopeSidebar]);

  const toggle = () => {
    setExpanded((prev) => {
      const next = !prev;
      if (!hasScopeSidebar) {
        try {
          window.localStorage.setItem(RAIL_STORAGE_KEY, next ? "1" : "0");
        } catch {
          /* yok say */
        }
      }
      return next;
    });
  };

  const railItems = [
    { label: "Home", href: "/home", icon: Home },
    { label: "Environments", href: "/environments", icon: Layers },
    { label: "Extension", href: "/extension-monitoring", icon: Activity },
    { label: "Applications", href: "/applications", icon: LayoutGrid },
    { label: "Shadow AI", href: "/shadow-ai", icon: ScanSearch },
    { label: "Findings", href: "/findings", icon: ShieldAlert },
    { label: "Sessions", href: "/sessions", icon: History },
    { label: "Collectors", href: "/collectors", icon: Laptop },
  ];

  const itemBase = `flex h-9 items-center gap-3 rounded-md text-[13px] transition-colors ${
    expanded ? "px-2.5" : "justify-center px-0"
  }`;
  const ToggleIcon = expanded ? PanelLeftClose : PanelLeftOpen;

  return (
    <nav
      aria-label="Primary"
      className={`${expanded ? "w-[208px]" : "w-[56px]"} shrink-0 h-full bg-[#fcfdff] border-r border-secondary/10 flex flex-col px-2 py-3 z-50 transition-[width] duration-200`}
    >
      <div className="flex flex-col gap-0.5">
        {railItems.map((item) => {
          const isActive =
            item.href === "/extension-monitoring"
              ? pathname.startsWith("/extension/") || pathname.startsWith("/extension-monitoring")
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={expanded ? undefined : item.label}
              aria-current={isActive ? "page" : undefined}
              className={`${itemBase} ${
                isActive
                  ? "bg-secondary/10 text-secondary font-semibold"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <item.icon className="w-[18px] h-[18px] shrink-0" />
              {expanded && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </div>
      <button
        type="button"
        onClick={toggle}
        title={expanded ? undefined : "Expand navigation"}
        aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
        className={`${itemBase} mt-auto text-gray-500 hover:bg-gray-100 hover:text-gray-900`}
      >
        <ToggleIcon className="w-[18px] h-[18px] shrink-0" />
        {expanded && <span>Collapse</span>}
      </button>
    </nav>
  );
}

// Sidebar başlığında URL'deki ID değil kaydın gerçek adı görünsün. Ad
// bulunamazsa ID'ye düşülür.
function useScopeNames(envId: string | null, projectId: string | null) {
  const { tenantId } = useConsole();
  const [envName, setEnvName] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);

  useEffect(() => {
    setEnvName(null);
    if (!tenantId || !envId) return;
    let active = true;
    fetchEnvironments(tenantId)
      .then((envs) => {
        if (active) setEnvName(envs.find((env) => env.environment_id === envId)?.name ?? null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [tenantId, envId]);

  useEffect(() => {
    setProjectName(null);
    if (!tenantId || !envId || !projectId) return;
    let active = true;
    fetchProjects(tenantId, envId)
      .then((projects) => {
        if (active) {
          setProjectName(projects.find((p) => p.project_id === projectId)?.name ?? null);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [tenantId, envId, projectId]);

  return { envName, projectName };
}

function Sidebar() {
  const { selectedEnvironment, selectedProject } = useConsole();
  const pathname = usePathname();
  const { envName, projectName } = useScopeNames(selectedEnvironment, selectedProject);

  if (!selectedEnvironment && !selectedProject) {
    return null;
  }

  const isProjectView = !!selectedProject;
  const overviewHref =
    selectedEnvironment && selectedProject
      ? `/environments/${selectedEnvironment}/projects/${selectedProject}`
      : selectedEnvironment
        ? `/environments/${selectedEnvironment}`
        : "/environments";
  const scopeTitle = isProjectView
    ? projectName ?? selectedProject
    : envName ?? selectedEnvironment;

  return (
    <aside className="w-[240px] flex-col bg-white border-r border-secondary/10 h-full flex z-40 shrink-0">
      <div className="p-5 border-b border-secondary/10">
        <p className="text-xs font-medium text-gray-500 mb-1">
          {isProjectView ? "Project" : "Environment"}
        </p>
        <h3 className="text-lg font-semibold text-gray-900 truncate leading-tight" title={scopeTitle ?? undefined}>
          {scopeTitle}
        </h3>
        {isProjectView && (
          <p className="mt-0.5 text-xs text-gray-500 truncate">
            {envName ?? selectedEnvironment}
          </p>
        )}
      </div>

      <nav className="flex-1 py-4 px-3 overflow-y-auto">
        {selectedEnvironment && (
          <div className="space-y-1">
            <Link
              href={overviewHref}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${pathname === overviewHref
                ? "bg-secondary/8 text-secondary font-semibold"
                : "text-gray-600 hover:bg-secondary/5 hover:text-secondary font-medium"
                }`}
            >
              <LayoutDashboard className="w-5 h-5 opacity-70" />
              {selectedProject ? "Project Overview" : "Overview"}
            </Link>

            {selectedProject && (
              <div className="mt-1 ml-4 pl-4 border-l border-secondary/10 flex flex-col gap-0.5">
                {[
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
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-colors ${isActive
                        ? "bg-secondary/8 text-secondary font-semibold"
                        : "text-gray-500 hover:text-secondary hover:bg-secondary/5 font-medium"
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
        <div className="flex flex-col h-screen overflow-hidden bg-white font-sans selection:bg-secondary/15 italic-none">
          {isOnboarding ? <OnboardingNavbar /> : <TopNavbar />}

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
