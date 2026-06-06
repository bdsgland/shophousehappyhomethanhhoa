import { redirect } from "next/navigation";

import { ProjectDetailDashboard } from "@/components/dashboard/ProjectDetailDashboard";
import { getServerToken } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default function ProjectDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const token = getServerToken();
  if (!token) {
    redirect(`/login?next=/dashboard/project/${params.slug}`);
  }

  return <ProjectDetailDashboard />;
}
