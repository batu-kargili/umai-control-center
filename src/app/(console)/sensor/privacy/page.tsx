import { Eye, ShieldCheck } from "lucide-react";

export default function SensorPrivacyPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-secondary/70">Endpoint Sensor</p>
        <h2 className="font-display text-3xl text-ink">Privacy Notice</h2>
        <p className="text-sm text-slate">
          Local Smarttech POC posture for the UMAI Windows Sensor.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-secondary/10 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-secondary" />
            <h3 className="font-semibold text-ink">Collected</h3>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-slate">
            <li>Device enrollment and heartbeat status.</li>
            <li>AI application, DNS, and network metadata.</li>
            <li>Hash-linked sensor events and policy version metadata.</li>
          </ul>
        </div>

        <div className="rounded-lg border border-secondary/10 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-secondary" />
            <h3 className="font-semibold text-ink">Not Collected</h3>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-slate">
            <li>No covert monitoring.</li>
            <li>No TLS interception in this POC flow.</li>
            <li>No prompt or response body capture by default.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
