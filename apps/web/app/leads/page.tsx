import { LeadList } from "@/components/LeadList";
import { ProjectTabs } from "@/components/ProjectTabs";
import { getServerToken } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default function LeadsPage({
  searchParams,
}: {
  searchParams: { project?: string };
}) {
  const project = searchParams.project;
  const token = getServerToken() ?? undefined;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-brand-900">
          {project ? `Lead — ${project}` : "Danh sách lead"}
        </h1>
        <p className="text-sm text-brand-700">
          {project
            ? `Đang xem lead thuộc dự án "${project}". Click "Tất cả" để xem mọi dự án.`
            : "Chọn 1 dự án bên dưới để xem lead riêng, hoặc giữ \"Tất cả\" để xem tổng."}
        </p>
      </header>

      <ProjectTabs active={project} token={token} />

      <LeadList project={project} token={token} />
    </div>
  );
}
