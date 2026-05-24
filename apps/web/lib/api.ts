export const AGENT_ENGINE_URL =
  process.env.NEXT_PUBLIC_AGENT_ENGINE_URL || "http://localhost:8000";

export type Lead = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  source_channel: string;
  project: string | null;
  project_slug: string | null;
  facebook_url: string | null;
  notes: string | null;
  status: "new" | "nurturing" | "hot" | "handed_off" | "lost";
  intent_score: number;
  created_at: string;
  updated_at: string;
};

export type ProjectSummary = {
  project_slug: string;
  project: string;
  lead_count: number;
};

export async function fetchHealth(): Promise<{
  status: string;
  service: string;
  version: string;
  llm_mode: string;
} | null> {
  try {
    const res = await fetch(`${AGENT_ENGINE_URL}/health`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchLeads(opts?: { project?: string }): Promise<Lead[]> {
  try {
    const qs = opts?.project
      ? `?project=${encodeURIComponent(opts.project)}`
      : "";
    const res = await fetch(`${AGENT_ENGINE_URL}/leads${qs}`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchProjects(): Promise<ProjectSummary[]> {
  try {
    const res = await fetch(`${AGENT_ENGINE_URL}/leads/projects`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}
