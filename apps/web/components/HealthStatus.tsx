import { fetchHealth } from "@/lib/api";

export async function HealthStatus() {
  const health = await fetchHealth();

  if (!health) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <div className="font-semibold">⚠️ Không kết nối được agent-engine</div>
        <div className="mt-1">
          Hãy chạy: <code className="rounded bg-white px-1 py-0.5">cd apps/agent-engine && uvicorn app.main:app --reload</code>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
      <div className="font-semibold">✅ Agent-engine đang chạy</div>
      <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
        <div>
          <span className="opacity-60">Service:</span> {health.service}
        </div>
        <div>
          <span className="opacity-60">Version:</span> {health.version}
        </div>
        <div>
          <span className="opacity-60">LLM mode:</span> {health.llm_mode}
        </div>
        <div>
          <span className="opacity-60">Status:</span> {health.status}
        </div>
      </div>
    </div>
  );
}
