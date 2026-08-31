"use client";

import { Fragment, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  Database,
  Download,
  Eye,
  ExternalLink,
  Filter,
  LockKeyhole,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Risk = "Critical" | "High" | "Medium" | "Low";

const usageTrend = [
  { day: "Jul 1", events: 810, risky: 116 },
  { day: "Jul 5", events: 1020, risky: 144 },
  { day: "Jul 9", events: 940, risky: 138 },
  { day: "Jul 13", events: 1290, risky: 206 },
  { day: "Jul 17", events: 1510, risky: 238 },
  { day: "Jul 21", events: 1390, risky: 211 },
  { day: "Jul 25", events: 1740, risky: 284 },
  { day: "Jul 27", events: 1680, risky: 252 },
];

const departments = [
  { name: "Engineering", users: 146, risky: 34 },
  { name: "Sales", users: 121, risky: 28 },
  { name: "Marketing", users: 88, risky: 26 },
  { name: "Finance", users: 64, risky: 19 },
  { name: "HR", users: 51, risky: 12 },
];

const applications = [
  { name: "ChatGPT", vendor: "OpenAI", users: 218, events: "4,892", score: 76, reason: "Unapproved · 38 sensitive uploads", risk: "High" as Risk, color: "#10a37f", initials: "CG" },
  { name: "Microsoft Copilot", vendor: "Microsoft", users: 164, events: "3,476", score: 22, reason: "Sanctioned · enterprise controls", risk: "Low" as Risk, color: "#7c3aed", initials: "MC" },
  { name: "Claude", vendor: "Anthropic", users: 97, events: "1,824", score: 58, reason: "Tolerated · retention unverified", risk: "Medium" as Risk, color: "#d97706", initials: "CL" },
  { name: "Gemini", vendor: "Google", users: 76, events: "1,096", score: 47, reason: "Limited approval · 4 violations", risk: "Medium" as Risk, color: "#2563eb", initials: "GE" },
  { name: "DeepSeek", vendor: "DeepSeek", users: 41, events: "624", score: 94, reason: "Blocked · restricted data observed", risk: "Critical" as Risk, color: "#dc2626", initials: "DS" },
];

const employees = [
  { name: "Ela Demir", department: "Engineering", app: "DeepSeek", events: 94, violations: 17, score: 96, confidence: 94, risk: "Critical" as Risk, lastSeen: "8 min ago", factors: [{ label: "Restricted source code", points: 32 }, { label: "Blocked application", points: 25 }, { label: "Repeat behavior", points: 21 }, { label: "Unusual upload volume", points: 18 }] },
  { name: "Mert Kaya", department: "Finance", app: "ChatGPT", events: 71, violations: 12, score: 82, confidence: 91, risk: "High" as Risk, lastSeen: "14 min ago", factors: [{ label: "Privileged finance role", points: 24 }, { label: "Customer data", points: 23 }, { label: "Unapproved application", points: 20 }, { label: "Repeat behavior", points: 15 }] },
  { name: "Zeynep Aydin", department: "Marketing", app: "Claude", events: 63, violations: 9, score: 77, confidence: 86, risk: "High" as Risk, lastSeen: "22 min ago", factors: [{ label: "Campaign customer list", points: 27 }, { label: "Retention unverified", points: 19 }, { label: "Peer anomaly", points: 17 }, { label: "After-hours activity", points: 14 }] },
  { name: "Can Yilmaz", department: "Sales", app: "ChatGPT", events: 56, violations: 6, score: 61, confidence: 84, risk: "Medium" as Risk, lastSeen: "31 min ago", factors: [{ label: "Unapproved application", points: 22 }, { label: "Customer context", points: 18 }, { label: "Personal account", points: 13 }, { label: "Control warning", points: 8 }] },
  { name: "Derya Sahin", department: "HR", app: "Gemini", events: 39, violations: 4, score: 54, confidence: 79, risk: "Medium" as Risk, lastSeen: "46 min ago", factors: [{ label: "Employee information", points: 24 }, { label: "Limited approval", points: 15 }, { label: "Low recurrence", points: 9 }, { label: "Upload blocked", points: 6 }] },
  { name: "Arda Celik", department: "Engineering", app: "Copilot", events: 31, violations: 0, score: 18, confidence: 96, risk: "Low" as Risk, lastSeen: "1 hr ago", factors: [{ label: "Sanctioned application", points: 8 }, { label: "Normal peer behavior", points: 5 }, { label: "Managed identity", points: 3 }, { label: "No sensitive data", points: 2 }] },
];

const riskMix = [
  { name: "Critical", value: 8, color: "#dc2626" },
  { name: "High", value: 21, color: "#f97316" },
  { name: "Medium", value: 34, color: "#f5b942" },
  { name: "Low", value: 37, color: "#16a34a" },
];

const postureDimensions = [
  { label: "Data exposure", score: 78, color: "bg-red-500" },
  { label: "Application governance", score: 64, color: "bg-orange-500" },
  { label: "User behavior", score: 61, color: "bg-amber-500" },
  { label: "Control coverage", score: 72, color: "bg-secondary" },
];

const coverageSources = [
  { label: "Endpoint sensors", coverage: 94, detail: "1,207 / 1,284 devices", state: "Healthy" },
  { label: "Identity resolution", coverage: 96, detail: "452 / 469 users", state: "Healthy" },
  { label: "Network & DNS", coverage: 91, detail: "12 event sources", state: "Healthy" },
  { label: "Browser extension", coverage: 82, detail: "1,053 active devices", state: "Watch" },
  { label: "SaaS audit logs", coverage: 68, detail: "3 of 5 sources", state: "Gap" },
];

const decisionItems = [
  { id: "deepseek", severity: "Critical" as Risk, title: "Block DeepSeek across managed devices", impact: "17 restricted-source-code events from Engineering", owner: "CISO approval", due: "Due in 2h", recommendation: "Block and redirect users to Copilot Enterprise" },
  { id: "finance", severity: "High" as Risk, title: "Investigate Finance customer-data exposure", impact: "12 violations linked to a privileged finance identity", owner: "SOC Tier 2", due: "Due today", recommendation: "Open QRadar offense and preserve evidence" },
  { id: "saas", severity: "High" as Risk, title: "Close SaaS audit-log coverage gap", impact: "32% of sanctioned SaaS activity is not visible", owner: "Cloud Security", due: "Due Jul 29", recommendation: "Authorize remaining two audit-log connectors" },
  { id: "claude", severity: "Medium" as Risk, title: "Decide Claude policy for Marketing", impact: "97 active users; data-retention terms are unverified", owner: "AI Governance", due: "Due Aug 1", recommendation: "Approve enterprise tenant or block personal accounts" },
];

const riskClasses: Record<Risk, string> = {
  Critical: "border-red-200 bg-red-50 text-red-700",
  High: "border-orange-200 bg-orange-50 text-orange-700",
  Medium: "border-amber-200 bg-amber-50 text-amber-700",
  Low: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

function RiskBadge({ risk }: { risk: Risk }) {
  return (
    <span className={`inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${riskClasses[risk]}`}>
      {risk}
    </span>
  );
}

function MetricCard({
  label,
  value,
  change,
  direction,
  helper,
  icon: Icon,
  alert,
}: {
  label: string;
  value: string;
  change: string;
  direction: "up" | "down";
  helper: string;
  icon: typeof Users;
  alert?: boolean;
}) {
  const Direction = direction === "up" ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="border border-[#dde1e6] bg-white p-4">
      <div className="flex items-start justify-between">
        <div className={`flex h-8 w-8 items-center justify-center rounded-[4px] ${alert ? "bg-red-50 text-red-600" : "bg-[#edf3ff] text-secondary"}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className={`flex items-center text-xs font-semibold ${alert ? "text-red-600" : direction === "up" ? "text-orange-600" : "text-emerald-600"}`}>
          <Direction className="h-3.5 w-3.5" /> {change}
        </span>
      </div>
      <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.08em] text-slate">{label}</p>
      <p className="mt-1 text-[26px] font-semibold tracking-tight text-ink">{value}</p>
      <p className="mt-1 text-[10px] text-slate/70">{helper}</p>
    </div>
  );
}

export default function ShadowAiPage() {
  const [range, setRange] = useState("Last 30 days");
  const [department, setDepartment] = useState("All departments");
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>("Ela Demir");
  const [decisionStates, setDecisionStates] = useState<Record<string, "Open" | "In review" | "Resolved">>({
    finance: "In review",
  });

  const advanceDecision = (id: string) => {
    setDecisionStates((current) => {
      const state = current[id] ?? "Open";
      return { ...current, [id]: state === "Open" ? "In review" : "Resolved" };
    });
  };

  const filteredEmployees = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return employees.filter((employee) => {
      const departmentMatches = department === "All departments" || employee.department === department;
      const queryMatches = !normalized || [employee.name, employee.department, employee.app, employee.risk]
        .some((value) => value.toLowerCase().includes(normalized));
      return departmentMatches && queryMatches;
    });
  }, [department, query]);

  const refresh = () => {
    setRefreshing(true);
    window.setTimeout(() => setRefreshing(false), 700);
  };

  const exportCsv = () => {
    const header = "Employee,Department,AI application,Events,Violations,Risk,Last seen";
    const rows = filteredEmployees.map((row) =>
      [row.name, row.department, row.app, row.events, row.violations, row.risk, row.lastSeen].join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "umai-qradar-shadow-ai.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="-m-8 min-h-full space-y-5 bg-[#f5f7f9] px-8 pb-10 pt-6 lg:-mx-12 lg:-mb-12 lg:px-12">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate">Security analytics / Shadow AI</div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-ink">AI risk overview</h1>
          <p className="mt-1 text-[13px] text-slate">Enterprise exposure, control coverage and decisions derived from QRadar telemetry.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 items-center gap-2 rounded-[4px] border border-[#c6e2d0] bg-white px-3 text-[11px] font-semibold text-emerald-700">
            <span className="h-2 w-2 bg-emerald-500" />
            QRadar connected
          </div>
          <label className="relative">
            <select value={range} onChange={(event) => setRange(event.target.value)} className="h-9 appearance-none rounded-[4px] border border-[#cfd4da] bg-white pl-3 pr-9 text-[11px] font-semibold text-ink outline-none focus:border-secondary/50">
              <option>Last 7 days</option><option>Last 30 days</option><option>Last 90 days</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate" />
          </label>
          <button onClick={refresh} className="flex h-9 w-9 items-center justify-center rounded-[4px] border border-[#cfd4da] bg-white text-slate transition hover:border-secondary hover:text-secondary" aria-label="Refresh QRadar data">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button onClick={exportCsv} className="inline-flex h-9 items-center gap-2 rounded-[4px] bg-secondary px-4 text-[11px] font-semibold text-white transition hover:bg-blue-700">
            <Download className="h-4 w-4" /> Export report
          </button>
        </div>
      </div>

      <div className="border border-[#dde1e6] bg-white px-4 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center border border-[#dde1e6] text-secondary"><CircleDot className="h-3.5 w-3.5" /></div>
            <div><p className="text-[11px] font-semibold text-ink">IBM QRadar SIEM <span className="ml-2 font-normal text-slate">Production</span></p><p className="text-[10px] text-slate">Last sync 2 min ago · 28,419 normalized events · 3 correlation rules</p></div>
          </div>
          <button className="inline-flex items-center gap-1 text-xs font-semibold text-secondary">View integration <ExternalLink className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <div className="border border-[#cfd4da] bg-white">
          <div className="flex items-center justify-between border-b border-[#e2e5e9] px-5 py-3">
            <div><h2 className="text-[12px] font-semibold text-ink">Enterprise AI risk posture</h2><p className="mt-0.5 text-[10px] text-slate">Residual exposure after active controls and exceptions</p></div>
            <button className="inline-flex items-center gap-1 text-[10px] font-semibold text-secondary">Methodology <ChevronRight className="h-3 w-3" /></button>
          </div>
          <div className="grid md:grid-cols-[185px_1fr]">
            <div className="border-b border-[#e2e5e9] p-5 md:border-b-0 md:border-r">
              <div className="flex items-end gap-2"><span className="text-[54px] font-semibold leading-none tracking-[-0.05em] text-ink">68</span><span className="mb-1 text-xs text-slate">/ 100</span></div>
              <div className="mt-4 flex items-center gap-2"><RiskBadge risk="High" /><span className="flex items-center text-[10px] font-semibold text-red-600"><ArrowUpRight className="h-3 w-3" />4 points in 30d</span></div>
              <div className="mt-5 border-l-2 border-orange-500 pl-3"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate">Primary driver</p><p className="mt-1 text-xs font-medium text-ink">Restricted-data exposure</p><p className="mt-0.5 text-[10px] text-slate">42 verified events</p></div>
            </div>
            <div className="p-5">
              <div className="mb-4 flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate">Risk dimensions</p><span className="text-[10px] text-slate">91% evidence confidence</span></div>
              <div className="divide-y divide-[#edf0f2]">
                {postureDimensions.map((item) => (
                  <div key={item.label} className="grid grid-cols-[145px_1fr_28px] items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="text-[11px] text-slate">{item.label}</span>
                    <div className="h-1 bg-[#e8ebee]"><div className={`h-full ${item.color}`} style={{ width: `${item.score}%` }} /></div>
                    <span className="text-right text-[11px] font-semibold text-ink">{item.score}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="border border-[#cfd4da] bg-white p-5">
          <div className="flex items-start justify-between">
            <div><h2 className="flex items-center gap-2 text-sm font-semibold text-ink"><Radio className="h-4 w-4 text-secondary" /> Visibility & data quality</h2><p className="mt-0.5 text-xs text-slate">Can leadership trust the current risk picture?</p></div>
            <div className="text-right"><p className="text-2xl font-semibold text-ink">82%</p><p className="text-[10px] font-semibold text-orange-600">Overall coverage</p></div>
          </div>
          <div className="mt-5 space-y-3">
            {coverageSources.map((source) => (
              <div key={source.label} className="grid grid-cols-[1fr_88px] items-center gap-4">
                <div><div className="mb-1 flex items-center justify-between"><span className="text-[11px] font-semibold text-ink">{source.label}</span><span className="text-[10px] text-slate">{source.detail}</span></div><div className="h-1 bg-[#e8ebee]"><div className={`h-full ${source.coverage < 75 ? "bg-red-500" : source.coverage < 90 ? "bg-orange-500" : "bg-emerald-500"}`} style={{ width: `${source.coverage}%` }} /></div></div>
                <div className="flex items-center justify-between"><span className="text-xs font-semibold text-ink">{source.coverage}%</span><span className={`rounded-[3px] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${source.state === "Healthy" ? "bg-emerald-50 text-emerald-700" : source.state === "Watch" ? "bg-orange-50 text-orange-700" : "bg-red-50 text-red-700"}`}>{source.state}</span></div>
              </div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-3 divide-x divide-[#dfe3e7] border-t border-[#e2e5e9] pt-4 text-center"><div><p className="text-sm font-semibold text-ink">2m</p><p className="text-[9px] text-slate">Ingestion lag</p></div><div><p className="text-sm font-semibold text-ink">17</p><p className="text-[9px] text-slate">Unknown users</p></div><div><p className="text-sm font-semibold text-ink">3</p><p className="text-[9px] text-slate">Unmapped apps</p></div></div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="AI-active employees" value="469" change="12.4%" direction="up" helper="of 1,284 employees observed" icon={Users} />
        <MetricCard label="AI applications detected" value="23" change="3 new" direction="up" helper="7 are not organization-approved" icon={Bot} />
        <MetricCard label="High-risk employees" value="87" change="18.1%" direction="up" helper="critical or high risk score" icon={ShieldAlert} alert />
        <MetricCard label="Policy violations" value="312" change="8.7%" direction="down" helper="sensitive data and blocked apps" icon={AlertTriangle} />
      </section>

      <section className="overflow-hidden border border-[#cfd4da] bg-white">
        <div className="flex flex-col gap-2 border-b border-[#e2e5e9] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="flex items-center gap-2 text-sm font-semibold text-ink"><AlertTriangle className="h-4 w-4 text-orange-500" /> Decisions required</h2><p className="mt-0.5 text-xs text-slate">Prioritized actions requiring ownership or approval</p></div>
          <div className="flex items-center gap-3"><span className="border-l-2 border-red-500 pl-2 text-[10px] font-semibold uppercase tracking-wide text-red-700">3 open</span><button className="text-[11px] font-semibold text-secondary">View action center</button></div>
        </div>
        <div className="divide-y divide-slate/10">
          {decisionItems.map((item) => {
            const state = decisionStates[item.id] ?? "Open";
            return (
              <div key={item.id} className={`grid gap-4 px-5 py-3.5 transition md:grid-cols-[1fr_160px_125px] md:items-center ${state === "Resolved" ? "bg-emerald-50/30 opacity-65" : "hover:bg-[#f8fafc]"}`}>
                <div className="flex min-w-0 gap-3"><div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border ${item.severity === "Critical" ? "border-red-200 text-red-600" : item.severity === "High" ? "border-orange-200 text-orange-600" : "border-amber-200 text-amber-600"}`}>{state === "Resolved" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold text-ink">{item.title}</p><RiskBadge risk={item.severity} /></div><p className="mt-1 text-[11px] text-slate">{item.impact}</p><p className="mt-1 text-[10px] font-medium text-secondary">Recommended: {item.recommendation}</p></div></div>
                <div><p className="text-[10px] text-slate">Owner</p><p className="mt-0.5 text-xs font-semibold text-ink">{item.owner}</p><p className="mt-1 flex items-center gap-1 text-[10px] text-slate"><Clock3 className="h-3 w-3" />{item.due}</p></div>
                <button onClick={() => advanceDecision(item.id)} disabled={state === "Resolved"} className={`h-8 rounded-[4px] px-3 text-[10px] font-semibold transition ${state === "Resolved" ? "border border-emerald-200 bg-white text-emerald-700" : state === "In review" ? "border border-secondary bg-white text-secondary hover:bg-blue-50" : "bg-ink text-white hover:bg-black/80"}`}>{state === "Open" ? "Start review" : state === "In review" ? "Mark resolved" : "Resolved"}</button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <div className="border border-[#cfd4da] bg-white p-5">
          <div className="mb-5 flex items-start justify-between">
            <div><h2 className="text-sm font-semibold text-ink">AI activity trend</h2><p className="mt-0.5 text-xs text-slate">QRadar events correlated with known generative AI destinations</p></div>
            <div className="flex gap-4 text-[11px] text-slate"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-secondary" />All activity</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-red-500" />Risky</span></div>
          </div>
          <div className="h-[270px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={usageTrend} margin={{ left: -20, right: 8 }}>
                <defs><linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0f62fe" stopOpacity={0.2} /><stop offset="95%" stopColor="#0f62fe" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#71717a" }} dy={8} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#71717a" }} />
                <Tooltip contentStyle={{ borderRadius: 2, border: "1px solid #cfd4da", fontSize: 11, boxShadow: "none" }} />
                <Area type="monotone" dataKey="events" stroke="#0f62fe" strokeWidth={2.5} fill="url(#activityFill)" />
                <Area type="monotone" dataKey="risky" stroke="#ef4444" strokeWidth={2} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="border border-[#cfd4da] bg-white p-5">
          <div><h2 className="text-sm font-semibold text-ink">Employee risk distribution</h2><p className="mt-0.5 text-xs text-slate">Based on app, behavior and data exposure</p></div>
          <div className="relative mt-3 h-[175px]">
            <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={riskMix} dataKey="value" innerRadius={58} outerRadius={78} paddingAngle={3} startAngle={90} endAngle={-270}>{riskMix.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 12 }} /></PieChart></ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-2xl font-semibold text-ink">469</span><span className="text-[10px] text-slate">employees</span></div>
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-2">
            {riskMix.map((item) => <div key={item.name} className="flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-slate"><i className="h-2 w-2 rounded-full" style={{ background: item.color }} />{item.name}</span><span className="font-semibold text-ink">{item.value}%</span></div>)}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <div className="border border-[#cfd4da] bg-white p-5">
          <div className="mb-4"><h2 className="text-sm font-semibold text-ink">Risk by department</h2><p className="mt-0.5 text-xs text-slate">Employees using AI versus risky users</p></div>
          <div className="h-[235px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={departments} layout="vertical" margin={{ left: 12, right: 10 }}><CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" horizontal={false} /><XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#71717a" }} /><YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={72} tick={{ fontSize: 11, fill: "#3f3f46" }} /><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 12 }} /><Bar dataKey="users" fill="#dbeafe" radius={[0, 4, 4, 0]} barSize={13} /><Bar dataKey="risky" fill="#f97316" radius={[0, 4, 4, 0]} barSize={13} /></BarChart></ResponsiveContainer></div>
        </div>

        <div className="border border-[#cfd4da] bg-white p-5">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-semibold text-ink">Most-used AI applications</h2><p className="mt-0.5 text-xs text-slate">Ranked by QRadar network activity</p></div><button className="text-xs font-semibold text-secondary">View all 23</button></div>
          <div className="divide-y divide-slate/10">
            {applications.map((app) => (
              <div key={app.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-3 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-center gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] text-[9px] font-bold text-white" style={{ background: app.color }}>{app.initials}</div><div className="min-w-0"><p className="truncate text-xs font-semibold text-ink">{app.name}</p><p className="text-[10px] text-slate">{app.vendor} · {app.events} events</p></div></div>
                <div className="hidden max-w-[170px] text-right sm:block"><p className="truncate text-[10px] font-medium text-slate">{app.reason}</p><p className="text-[10px] text-slate/60">{app.users} users</p></div>
                <div className="flex items-center gap-2"><div className={`flex h-7 w-7 items-center justify-center border text-[11px] font-bold ${app.score >= 85 ? "border-red-200 text-red-700" : app.score >= 70 ? "border-orange-200 text-orange-700" : app.score >= 40 ? "border-amber-200 text-amber-700" : "border-emerald-200 text-emerald-700"}`} title={`Risk score ${app.score}/100`}>{app.score}</div><RiskBadge risk={app.risk} /></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden border border-[#cfd4da] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#e2e5e9] px-5 py-3.5 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 className="text-sm font-semibold text-ink">Employees requiring attention</h2><p className="mt-0.5 text-xs text-slate">Prioritized by UMAI risk score and QRadar offenses</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate/60" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employees" className="h-9 w-52 rounded-[4px] border border-[#cfd4da] pl-9 pr-3 text-[11px] outline-none focus:border-secondary" /></label>
            <label className="relative"><Filter className="absolute left-3 top-2.5 h-4 w-4 text-slate/60" /><select value={department} onChange={(event) => setDepartment(event.target.value)} className="h-9 appearance-none rounded-[4px] border border-[#cfd4da] bg-white pl-9 pr-8 text-[11px] font-medium outline-none"><option>All departments</option>{departments.map((item) => <option key={item.name}>{item.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-slate" /></label>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-xs">
            <thead className="bg-slate/[0.035] text-[10px] font-semibold uppercase tracking-[0.12em] text-slate"><tr><th className="px-5 py-3">Employee</th><th className="px-4 py-3">AI application</th><th className="px-4 py-3 text-right">Events</th><th className="px-4 py-3 text-right">Violations</th><th className="px-4 py-3">Risk score</th><th className="px-4 py-3">Risk</th><th className="px-4 py-3">Last seen</th><th className="px-5 py-3" /></tr></thead>
            <tbody className="divide-y divide-slate/10">
              {filteredEmployees.map((employee) => (
                <Fragment key={employee.name}>
                  <tr className={`transition hover:bg-blue-50/30 ${expandedEmployee === employee.name ? "bg-blue-50/25" : ""}`}>
                    <td className="px-5 py-3.5"><div className="flex items-center gap-3"><div className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-[#dfe3e7] bg-[#f5f7f9] text-[9px] font-bold text-slate">{employee.name.split(" ").map((part) => part[0]).join("")}</div><div><p className="font-semibold text-ink">{employee.name}</p><p className="text-[10px] text-slate">{employee.department}</p></div></div></td>
                    <td className="px-4 py-3.5 font-medium text-ink">{employee.app}</td><td className="px-4 py-3.5 text-right font-medium text-ink">{employee.events}</td><td className="px-4 py-3.5 text-right"><span className={employee.violations > 10 ? "font-semibold text-red-600" : "font-medium text-ink"}>{employee.violations}</span></td>
                    <td className="px-4 py-3.5"><button onClick={() => setExpandedEmployee(expandedEmployee === employee.name ? null : employee.name)} className="inline-flex items-center gap-2 border border-[#d7dce1] bg-white px-2 py-1"><span className={`text-xs font-bold ${employee.score >= 85 ? "text-red-600" : employee.score >= 70 ? "text-orange-600" : employee.score >= 40 ? "text-amber-600" : "text-emerald-600"}`}>{employee.score}</span><ChevronDown className={`h-3 w-3 text-slate transition ${expandedEmployee === employee.name ? "rotate-180" : ""}`} /></button></td>
                    <td className="px-4 py-3.5"><RiskBadge risk={employee.risk} /></td><td className="px-4 py-3.5 text-slate">{employee.lastSeen}</td><td className="px-5 py-3.5 text-right"><button className="font-semibold text-secondary">Investigate</button></td>
                  </tr>
                  {expandedEmployee === employee.name && (
                    <tr className="bg-[#f8fafc]"><td colSpan={8} className="px-5 py-4"><div className="grid gap-5 lg:grid-cols-[1fr_220px]">
                      <div><div className="mb-3 flex items-center gap-2"><Eye className="h-4 w-4 text-secondary" /><p className="text-xs font-semibold text-ink">Why this score is {employee.score}/100</p></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{employee.factors.map((factor) => <div key={factor.label} className="border border-[#dfe3e7] bg-white p-3"><div className="flex items-center justify-between"><span className="text-[10px] text-slate">{factor.label}</span><span className="text-xs font-bold text-ink">+{factor.points}</span></div><div className="mt-2 h-1 bg-[#e8ebee]"><div className="h-full bg-secondary" style={{ width: `${Math.min(factor.points * 3, 100)}%` }} /></div></div>)}</div></div>
                      <div className="border border-[#cbd9f0] bg-[#f3f7fd] p-3"><div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-[10px] font-semibold text-ink"><UserCheck className="h-3.5 w-3.5 text-secondary" />Evidence confidence</span><span className="text-sm font-bold text-secondary">{employee.confidence}%</span></div><p className="mt-2 text-[10px] leading-relaxed text-slate">Correlated across identity, endpoint, network and QRadar offense evidence.</p><div className="mt-2 flex gap-1"><span className="border border-[#dfe3e7] bg-white px-1.5 py-1 text-[9px] text-slate"><Database className="mr-1 inline h-3 w-3" />QRadar</span><span className="border border-[#dfe3e7] bg-white px-1.5 py-1 text-[9px] text-slate"><LockKeyhole className="mr-1 inline h-3 w-3" />UMAI policy</span></div></div>
                    </div></td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {filteredEmployees.length === 0 && <div className="flex flex-col items-center py-10 text-slate"><CheckCircle2 className="mb-2 h-7 w-7 text-emerald-500" /><p className="text-sm font-medium">No matching employees</p></div>}
        </div>
      </section>
    </div>
  );
}
