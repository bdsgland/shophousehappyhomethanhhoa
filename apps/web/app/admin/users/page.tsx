import Link from "next/link";

import { AdminUsersTable } from "@/components/AdminUsersTable";
import { fetchAdminUsers } from "@/lib/api";
import { getServerToken } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const token = getServerToken() ?? "";
  const users = await fetchAdminUsers(token);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-900">
            Quản lý người dùng
          </h1>
          <p className="text-sm text-brand-700">
            Đổi vai trò hoặc khoá/mở tài khoản. Tổng {users.length} user.
          </p>
        </div>
        <Link
          href="/admin"
          className="rounded-lg border border-brand-100 px-3 py-1.5 text-sm text-brand-900 hover:border-brand-500"
        >
          ← Về dashboard
        </Link>
      </header>

      <AdminUsersTable initialUsers={users} />
    </div>
  );
}
