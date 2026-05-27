"use client";

import { useMemo, useState } from "react";

import { patchAdminUser, type AuthUser } from "@/lib/api";
import { readToken } from "@/lib/auth";

type Props = {
  initialUsers: AuthUser[];
};

export function AdminUsersTable({ initialUsers }: Props) {
  const [users, setUsers] = useState<AuthUser[]>(initialUsers);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...users].sort((a, b) => {
        if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
        return a.email.localeCompare(b.email);
      }),
    [users],
  );

  async function mutate(
    user: AuthUser,
    body: { role?: string; is_active?: boolean },
  ) {
    const token = readToken();
    if (!token) {
      setError("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.");
      return;
    }
    setError(null);
    setBusyId(user.id);
    try {
      const updated = await patchAdminUser(token, user.id, body);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)));
    } catch (e) {
      setError((e as Error).message || "Cập nhật thất bại");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-brand-100 bg-white">
        <table className="min-w-full divide-y divide-brand-100 text-sm">
          <thead className="bg-brand-50 text-left text-xs uppercase tracking-wide text-brand-700">
            <tr>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Họ tên</th>
              <th className="px-4 py-2">Vai trò</th>
              <th className="px-4 py-2">Trạng thái</th>
              <th className="px-4 py-2">Ngày tạo</th>
              <th className="px-4 py-2 text-right">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-100">
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-brand-700"
                >
                  Chưa có user — kiểm tra backend hoặc seed admin.
                </td>
              </tr>
            )}
            {sorted.map((u) => {
              const busy = busyId === u.id;
              const nextRole = u.role === "admin" ? "sale" : "admin";
              return (
                <tr key={u.id} className="text-brand-900">
                  <td className="px-4 py-2 font-medium">{u.email}</td>
                  <td className="px-4 py-2">{u.full_name}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        u.role === "admin"
                          ? "bg-amber-100 text-amber-900"
                          : "bg-brand-100 text-brand-900"
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {u.is_active ? (
                      <span className="text-emerald-700">Hoạt động</span>
                    ) : (
                      <span className="text-red-700">Đã khoá</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-brand-700">
                    {new Date(u.created_at).toLocaleString("vi-VN")}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => mutate(u, { role: nextRole })}
                        className="rounded-md border border-brand-100 px-2 py-1 text-xs hover:border-brand-500 disabled:opacity-50"
                      >
                        Đổi → {nextRole}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => mutate(u, { is_active: !u.is_active })}
                        className={`rounded-md px-2 py-1 text-xs text-white disabled:opacity-50 ${
                          u.is_active
                            ? "bg-red-600 hover:bg-red-700"
                            : "bg-emerald-600 hover:bg-emerald-700"
                        }`}
                      >
                        {u.is_active ? "Khoá" : "Mở"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
