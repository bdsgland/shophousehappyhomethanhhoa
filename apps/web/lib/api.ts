export const AGENT_ENGINE_URL =
  process.env.NEXT_PUBLIC_AGENT_ENGINE_URL || "http://localhost:8000";

export type Lead = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  source_channel: string;
  interested_project_slug: string | null;
  status: "new" | "nurturing" | "hot" | "handed_off" | "lost";
  intent_score: number;
  created_at: string;
  updated_at: string;
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

export async function fetchLeads(): Promise<Lead[]> {
  try {
    const res = await fetch(`${AGENT_ENGINE_URL}/leads`, { cache: "no-store" });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}
