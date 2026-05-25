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

export type ChatRole = "user" | "assistant";

export type ChatTurn = {
  role: ChatRole;
  content: string;
};

export type ChatReply = {
  reply: string;
  intent_score: number;
  is_hot: boolean;
  suggested_next_step: string | null;
};

export async function postChat(args: {
  messages: ChatTurn[];
  projectSlug?: string;
  signal?: AbortSignal;
}): Promise<ChatReply> {
  const res = await fetch(`${AGENT_ENGINE_URL}/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: args.messages,
      project_slug: args.projectSlug ?? null,
    }),
    signal: args.signal,
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = "";
    try {
      const data = await res.json();
      detail = typeof data?.detail === "string" ? data.detail : "";
    } catch {
      // ignore
    }
    throw new Error(
      detail || `Agent trả lỗi ${res.status}. Vui lòng thử lại sau.`,
    );
  }
  return (await res.json()) as ChatReply;
}
