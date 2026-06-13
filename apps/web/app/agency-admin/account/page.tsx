"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  AgencyHeader,
  AgencyLoading,
  Card,
} from "@/components/agency/AgencyKit";
import { fetchAgencyMe, type Agency } from "@/lib/api";
import { clearAuthCookies, readToken, readUserFromCookie } from "@/lib/auth";

export default function AgencyAdminAccountPage() {
  const router = useRouter();
  const [agency, setAgency] = useState<Agency | null>(null);
  const [loading, setLoading] = useState(true);
  const user = typeof window !== "undefined" ? readUserFromCookie() : null;

  useEffect(() => {
    const token = readToken();
    if (!token) {
      setLoading(false);
      return;
    }
    fetchAgencyMe(token)
      .then((a) => setAgency(a))
      .catch(() => setAgency(null))
      .finally(() => setLoading(false));
  }, []);

  function logout() {
    clearAuthCookies();
    router.replace("/login");
  }

  return (
    <div className="space-y-5">
      <AgencyHeader title="Tài khoản" />

      {loading ? <AgencyLoading /> : null}

      {!loading ? (
        <>
          <Card title="Thông tin tài khoản">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-brand-600">Họ tên</dt>
                <dd className="font-medium text-brand-900">
                  {user?.full_name ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-brand-600">Email</dt>
                <dd className="font-medium text-brand-900">
                  {user?.email ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-brand-600">Sàn</dt>
                <dd className="font-medium text-brand-900">
                  {agency?.ten_san ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-brand-600">Trạng thái sàn</dt>
                <dd className="font-medium text-brand-900">
                  {agency?.status === "active"
                    ? "Đại lý F2 (đã duyệt)"
                    : agency?.status === "rejected"
                    ? "Bị từ chối"
                    : "Chờ duyệt"}
                </dd>
              </div>
            </dl>
          </Card>

          <Card title="Hồ sơ sàn">
            <p className="text-sm text-brand-700">
              Cập nhật thông tin doanh nghiệp, cam kết môi giới và đội sale để đủ
              điều kiện đại lý F2.
            </p>
            <Link
              href="/agency-onboarding"
              className="mt-3 inline-block rounded-lg border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
            >
              Mở hồ sơ sàn
            </Link>
          </Card>

          <button
            type="button"
            onClick={logout}
            className="rounded-lg bg-red-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-600"
          >
            Đăng xuất
          </button>
        </>
      ) : null}
    </div>
  );
}
