import { AgentSidebar } from "@/components/agent/AgentSidebar";

export default function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <AgentSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
