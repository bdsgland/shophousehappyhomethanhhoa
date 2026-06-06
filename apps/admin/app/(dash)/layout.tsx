import { AdminGuard } from "@/components/auth/AdminGuard";
import { AppShell } from "@/components/nav/AppShell";

// Layout cho toàn bộ khu vực đã đăng nhập: xác thực admin rồi render khung sidebar.
export default function DashLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminGuard>
      <AppShell>{children}</AppShell>
    </AdminGuard>
  );
}
