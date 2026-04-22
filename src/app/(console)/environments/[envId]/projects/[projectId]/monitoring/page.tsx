import { redirect } from "next/navigation";

export default function MonitoringPage({
  params,
}: {
  params: { envId: string; projectId: string };
}) {
  redirect(`/environments/${params.envId}/projects/${params.projectId}`);
}
