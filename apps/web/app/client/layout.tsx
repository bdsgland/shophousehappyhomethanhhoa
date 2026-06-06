import { ClientSidebar } from "@/components/client/ClientSidebar";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <ClientSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
