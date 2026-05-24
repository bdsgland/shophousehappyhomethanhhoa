import Link from "next/link";
import { fetchProjects } from "@/lib/api";

export async function ProjectTabs({ active }: { active?: string }) {
  const projects = await fetchProjects();
  const totalLeads = projects.reduce((sum, p) => sum + p.lead_count, 0);

  const tabClass = (isActive: boolean) =>
    `rounded-full border px-3 py-1 text-sm transition ${
      isActive
        ? "border-brand-500 bg-brand-500 text-white"
        : "border-brand-100 bg-white text-brand-900 hover:border-brand-500"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href="/leads" className={tabClass(!active)}>
        Tất cả <span className="opacity-70">({totalLeads})</span>
      </Link>
      {projects.map((p) => (
        <Link
          key={p.project_slug || p.project}
          href={`/leads?project=${encodeURIComponent(p.project)}`}
          className={tabClass(active === p.project)}
        >
          {p.project} <span className="opacity-70">({p.lead_count})</span>
        </Link>
      ))}
    </div>
  );
}
